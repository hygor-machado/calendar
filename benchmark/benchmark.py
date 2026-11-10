#!/usr/bin/env python3
"""Run a read-only, matched A/B/n calendar benchmark with raw per-frame JSON.

Requires Python >=3.10, Playwright 1.57.0 and its Chromium installation.
No calls to the Bubble editor or modification of saved pages/reusables.

Versions under test come from versions.json (page + CSS classes of each calendar).
`--versions chatgpt,claude` reproduces the original two-version protocol exactly.
"""
from __future__ import annotations
import argparse
import asyncio
import importlib.metadata
import json
import platform
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from playwright.async_api import async_playwright, Page

HERE = Path(__file__).resolve().parent
MONITOR = (HERE / 'monitor.js').read_text(encoding='utf-8')
REGISTRY = json.loads((HERE / 'versions.json').read_text(encoding='utf-8'))
SELECTOR_KEYS = ('month', 'title', 'grid', 'day')
CONTEXT = {'viewport':{'width':390,'height':844},'timezone_id':'America/Campo_Grande','locale':'en-US',
           'device_scale_factor':1,'is_mobile':False,'has_touch':False}
KEY_METRICS = {
    'A': ['longtasks_sum_ms','longtasks_max_ms','raf_max_interval_ms','raf_frames_over_50ms',
          'frames_with_invisible_grid','unsolicited_scroll_jumps_over_250px','dom_elements_calendar'],
    'B': ['longtasks_sum_ms','raf_max_interval_ms','frames_with_invisible_grid','unsolicited_scroll_jumps_over_250px'],
    'C': ['longtasks_max_ms','raf_max_interval_ms','frames_with_invisible_grid','unsolicited_scroll_jumps_over_250px'],
    'D': ['selection_latency_ms','selection_next_raf_latency_ms','longtasks_sum_ms','frames_with_invisible_grid'],
}


def resolve_versions(names: list[str], base_url: str) -> dict[str, dict[str, str]]:
    known = REGISTRY['versions']
    unknown = [n for n in names if n not in known]
    if unknown:
        raise SystemExit(f"Unknown version(s): {', '.join(unknown)}. Known: {', '.join(known)}")
    if len(set(names)) != len(names):
        raise SystemExit('Each version can appear only once in --versions.')
    out = {}
    for n in names:
        item = known[n]
        out[n] = {'url': item.get('url') or f"{base_url.rstrip('/')}/{item['page']}", **{k: item[k] for k in SELECTOR_KEYS}}
    return out


def build_schedule(names: list[str], rounds: int) -> list[tuple[int, str]]:
    # Round r runs the list rotated by r-1 places, so each version takes every slot in turn.
    # For two versions this is the original order: [a,b], [b,a], [a,b].
    n = len(names)
    return [(r + 1, names[(r + i) % n]) for r in range(rounds) for i in range(n)]


def build_protocol(versions: dict[str, dict[str, str]], schedule: list[tuple[int, str]]) -> dict[str, Any]:
    return {
        'versions':versions,'round_order':schedule,'context':CONTEXT,'prepare_wait_after_load_ms':9000,
        'prepare_clicks':6,'wait_after_each_load_click_ms':2500,'expected_total_months':22,
        'wait_after_return_to_top_ms':2000,'scenario_order':['A','B','C','D'],
        'scenario_A':{'down_steps':75,'up_steps':75,'delta_px':80,'target_interval_ms':30},
        'scenario_B':{'steps':36,'delta_px':60,'scheduling':'one scrollBy per requestAnimationFrame'},
        'scenario_C':{'steps':1,'delta_px':2400,'method':'instant scrollBy'},
        'scenario_D':'Repeat A; a trusted mouse click at midpoint (after downward step 75, before step 76/up). Continue wheel scheduling while selection is observed.',
        'measurement_tail_ms':1000,
        'between_scenarios':'instant scrollTo(0,0), wait 2 seconds; same 22-month loaded page',
        'isolation':'fresh browser context per version/round; one page; no parallel benchmarks',
        'blank_rule':'month rectangle intersects viewport; day RG opacity product through month <0.5, missing RG, or no day cell with getClientRects()',
        'scroll_jump_rule':'absolute observed delta >250 AND excess beyond cumulative requested/clamped scroll envelope >250; conservative attribution; raw all large candidates retained',
        'latency_rule':'trusted DOM click event.timeStamp to MutationObserver selection text change containing a digit; next-rAF latency also retained',
        'median_rule':'median only when every round of that version is valid for the scenario',
        'limitations':['No compositor trace; rAF samples do not capture every compositor frame.',
                       'Real wheel cadence is recorded; 30ms is a target, not guaranteed under load.',
                       'Observers/layout inspection introduce overhead, recorded per rAF.',
                       'Scroll jump attribution can miss same-direction jumps within pending input credit.',
                       'Scenario ordering may warm later scenarios; identical fixed order for every version.'],
    }


def save(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')


def status_total(text: str | None) -> int:
    if text is None:
        raise RuntimeError('Missing #calendar-load-status: cannot verify the requested 22 months.')
    # Known test page displays "Disponíveis: N + P anteriores. Janela: W."
    m=re.search(r'(\d+)\s*\+\s*(\d+)',text)
    if not m:
        raise RuntimeError(f'Unrecognized load status; refusing to infer total from virtual month DOM: {text!r}')
    return int(m.group(1))+int(m.group(2))


async def prepare(page: Page, cfg: dict[str,str]) -> dict[str,Any]:
    response=await page.goto(cfg['url'],wait_until='load',timeout=60000)
    if response is not None and response.status>=400:
        raise RuntimeError(f'HTTP {response.status}')
    await asyncio.sleep(9)
    initial=await page.evaluate("() => document.querySelector('#calendar-load-status')?.textContent?.trim() ?? null")
    if status_total(initial)!=4:
        raise RuntimeError(f'Expected four initial months, got {initial!r}. No inputs changed.')
    clicks=[]
    btn=page.get_by_role('button',name='Load next months',exact=True)
    for i in range(6):
        t=time.perf_counter()
        await btn.click(timeout=15000)
        await asyncio.sleep(2.5)
        text=await page.evaluate("() => document.querySelector('#calendar-load-status')?.textContent?.trim() ?? null")
        count=status_total(text)
        expected=4+3*(i+1)
        clicks.append({'click':i+1,'months':count,'status_text':text,'click_plus_wait_ms':(time.perf_counter()-t)*1000})
        if count!=expected:
            raise RuntimeError(f'After click {i+1}: expected {expected}, got {count}. No inputs changed.')
    await page.evaluate("() => window.scrollTo({top:0,left:0,behavior:'instant'})")
    await asyncio.sleep(2)
    return {'http_status':response.status if response else None,'initial_status':initial,'clicks':clicks,'verified_total':22}


async def click_visible_day(page: Page) -> dict[str,Any]:
    # Coordinates only: Locator.click() could auto-scroll, contaminating the scenario.
    await page.evaluate('() => window.__calendarProtocol.armSelection()')
    point=await page.evaluate('() => window.__calendarProtocol.visibleClickPoint()')
    if not point:
        return {'status':'failed','reason':'No hit-testable visible day at the midpoint; no auto-scroll or substitute click.'}
    await page.mouse.click(point['x'],point['y'])
    return {'status':'dispatched','point':point}


async def wheel_sequence(page: Page, interact: bool) -> dict[str,Any]:
    # Keep 30ms target spacing between dispatch starts. Never burst overdue commands.
    # The actual driver intervals and browser-received wheel events are both exported.
    dispatches=[]
    loop=asyncio.get_running_loop()
    start=loop.time()
    due=start
    click_task=None
    for i in range(150):
        await asyncio.sleep(max(0,due-loop.time()))
        sent=loop.time()
        delta=80 if i<75 else -80
        await page.mouse.wheel(0,delta)
        finished=loop.time()
        dispatches.append({'index':i+1,'delta_px':delta,'dispatch_start_ms':(sent-start)*1000,
                           'dispatch_end_ms':(finished-start)*1000,'ideal_time_ms':i*30,
                           'lateness_ms':(sent-(start+i*.030))*1000})
        if interact and i==74:
            click_task=asyncio.create_task(click_visible_day(page))
        due=sent+.030
    click_result=await click_task if click_task else None
    intervals=[b['dispatch_start_ms']-a['dispatch_start_ms'] for a,b in zip(dispatches,dispatches[1:])]
    return {'dispatches':dispatches,'actual_interval_median_ms':statistics.median(intervals),
            'actual_interval_max_ms':max(intervals),'interaction':click_result}


async def scenario(page: Page, name: str) -> dict[str,Any]:
    await page.mouse.move(195,422)
    await page.evaluate('(s) => window.__calendarProtocol.start(s)',name)
    driver=None
    error=None
    try:
        if name in ('A','D'):
            driver=await wheel_sequence(page,interact=name=='D')
        elif name=='B':
            await page.evaluate('() => window.__calendarProtocol.rafSteps(36,60)')
        elif name=='C':
            await page.evaluate('() => window.__calendarProtocol.scrollBy(2400)')
        else:
            raise ValueError(name)
        await asyncio.sleep(1)  # Same tail for A/B/C/D, including delayed rendering.
    except Exception as exc:
        error=f'{type(exc).__name__}: {exc}'
    result=await page.evaluate('() => window.__calendarProtocol.finish()')
    result['driver']=driver
    result['status']='complete' if error is None else 'failed'
    result['error']=error
    if name=='D' and result['metrics']['selection_latency_ms'] is None:
        result['status']='interaction_failed'
        result['error']=result['error'] or 'No confirmed selection text change after the midpoint trusted click.'
    return result


def medians(runs: list[dict[str,Any]], versions: list[str], rounds: int) -> dict[str,Any]:
    result={}
    for version in versions:
        result[version]={}
        for sc in ('A','B','C','D'):
            rows=[r['scenarios'][sc] for r in runs if r['version']==version and sc in r.get('scenarios',{})
                  and r['scenarios'][sc]['status']=='complete']
            keys=sorted({k for r in rows for k in r['metrics']})
            metrics={}
            for key in keys:
                vals=[r['metrics'][key] for r in rows if isinstance(r['metrics'].get(key),(float,int))]
                metrics[key]={'n':len(vals),'median':statistics.median(vals) if len(vals)==rounds else None,'values':vals}
            result[version][sc]={'valid_runs':len(rows),'metrics':metrics}
    return result


def fmt(m: dict[str,Any] | None) -> str:
    if not m or m['median'] is None:
        return 'NOT AVAILABLE'
    v=m['median']
    return f'{v:.0f}' if float(v).is_integer() else f'{v:.1f}'


def report(summary: dict[str,Any], versions: list[str], rounds: int) -> str:
    planned=len(versions)*rounds
    lines=['# Calendar benchmark','',f"Status: {summary['status']}",f"Completed runs: {summary['completed_runs']}/{planned}",
           f"Versions: {', '.join(versions)}",'','## Key metrics (median)','',
           '| Scenario | Metric | '+' | '.join(versions)+' |','|---|---|'+'---:|'*len(versions)]
    med=summary['medians']
    for sc,keys in KEY_METRICS.items():
        for key in keys:
            lines.append(f'| {sc} | {key} | '+' | '.join(fmt(med[v][sc]['metrics'].get(key)) for v in versions)+' |')
    lines+=['','## All metrics','','| Version | Scenario | Metric | n | Median |','|---|---|---|---:|---:|']
    for version,data in med.items():
        for sc,item in data.items():
            for key,m in item['metrics'].items():
                val='NOT AVAILABLE' if m['median'] is None else f"{m['median']:.3f}"
                lines.append(f"| {version} | {sc} | {key} | {m['n']} | {val} |")
    return '\n'.join(lines)+'\n'


async def main(args: argparse.Namespace) -> int:
    names=[n.strip() for n in (args.versions or ','.join(REGISTRY['default_versions'])).split(',') if n.strip()]
    if not names:
        raise SystemExit('No versions selected.')
    if args.rounds<1:
        raise SystemExit('--rounds must be at least 1.')
    versions=resolve_versions(names,args.base_url)
    schedule=build_schedule(names,args.rounds)
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    save(out/'protocol.json',build_protocol(versions,schedule))
    runs=[]
    env={'utc_started':datetime.now(timezone.utc).isoformat(),'platform':platform.platform(),
         'python':sys.version,'playwright':importlib.metadata.version('playwright'),
         'headless':not args.headed,'context':CONTEXT,'throttling':'none','network':'ordinary browser traffic'}
    async with async_playwright() as p:
        kw={'headless':not args.headed}
        if args.chromium:kw['executable_path']=args.chromium
        try:
            browser=await p.chromium.launch(**kw)
        except Exception as exc:
            save(out/'execution_status.json',{'status':'blocked','stage':'browser_launch','error':str(exc),'environment':env,
                                             'completed_runs':0,'medians':None})
            print(f'Browser launch failed: {exc}',file=sys.stderr);return 2
        env['chromium']=browser.version
        save(out/'environment.json',env)
        abort=False
        try:
            for seq,(round_no,version) in enumerate(schedule,1):
                print(f'[{seq}/{len(schedule)}] round={round_no} version={version}',flush=True)
                context=await browser.new_context(**CONTEXT)
                page=await context.new_page()
                errors=[]
                page.on('pageerror',lambda exc: errors.append(str(exc)))
                run={'sequence':seq,'round':round_no,'version':version,'url':versions[version]['url'],
                     'status':'running','scenarios':{},'page_errors':errors}
                path=out/f'round_{round_no}_{version}.json'
                try:
                    run['preparation']=await prepare(page,versions[version])
                    await page.evaluate(MONITOR,versions[version])
                    run['environment_observed']=await page.evaluate('() => window.__calendarProtocol.inspect()')
                    for i,name in enumerate(('A','B','C','D')):
                        if i:
                            await page.evaluate("() => window.scrollTo({top:0,left:0,behavior:'instant'})")
                            await asyncio.sleep(2)
                        run['scenarios'][name]=await scenario(page,name)
                        save(path,run)
                        print(f"  {name}: {run['scenarios'][name]['status']}",flush=True)
                    run['status']='complete' if all(s['status']=='complete' for s in run['scenarios'].values()) else 'partial'
                except Exception as exc:
                    run['status']='failed';run['error']=f'{type(exc).__name__}: {exc}'
                    print(run['error'],file=sys.stderr,flush=True)
                    # No retries or alternate network paths for an administrator policy block.
                    if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(exc):abort=True
                finally:
                    save(path,run);runs.append(run);await context.close()
                if abort:break
        finally:
            await browser.close()
    save(out/'all_rounds.json',runs)
    summary={'status':'complete' if len(runs)==len(schedule) and all(r['status']=='complete' for r in runs) else 'incomplete',
             'completed_runs':sum(r['status']=='complete' for r in runs),'attempted_runs':len(runs),
             'planned_runs':len(schedule),'versions':names,'medians':medians(runs,names,args.rounds)}
    save(out/'summary.json',summary)
    (out/'report.md').write_text(report(summary,names,args.rounds),encoding='utf-8')
    print(f'Artifacts: {out}',flush=True)
    return 0 if summary['status']=='complete' else 1


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--versions',help='Comma-separated names from versions.json (default: its default_versions).')
    parser.add_argument('--rounds',type=int,default=3,help='Rounds per version (default 3).')
    parser.add_argument('--base-url',default=REGISTRY['base_url'],help='Bubble app base URL (default from versions.json).')
    parser.add_argument('--output',type=Path,default=Path('benchmark-results'))
    parser.add_argument('--chromium',help='Optional executable path; default is the Playwright-pinned Chromium.')
    parser.add_argument('--headed',action='store_true',help='Use visible Chromium; keep it foreground, unobscured.')
    raise SystemExit(asyncio.run(main(parser.parse_args())))

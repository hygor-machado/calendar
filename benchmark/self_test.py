#!/usr/bin/env python3
"""Offline synthetic checks ONLY. These are NOT Bubble performance results."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright
from benchmark import MONITOR, CONTEXT, REGISTRY, status_total, medians, build_schedule, resolve_versions

async def test():
    results=[]
    async with async_playwright() as p:
        kw={'headless':True}
        if os.environ.get('CHROMIUM'):kw['executable_path']=os.environ['CHROMIUM']
        browser=await p.chromium.launch(**kw)
        context=await browser.new_context(**CONTEXT)
        page=await context.new_page()
        await page.set_content('''<!DOCTYPE html><html><head><style>
        body{margin:0;} .month{height:320px;} .grid{height:240px;} .day{display:inline-block;width:40px;height:40px;}
        </style></head><body><div id="selection-output">Seleção: →</div>
        <div id="calendar-under-test"><div class="month"><div class="title">Oct 2026</div><div class="grid">
        <button class="day">10</button><button class="day">20</button></div></div></div><div style="height:8000px"></div>
        <script>document.querySelector('.day').addEventListener('click',()=>setTimeout(()=>{document.querySelector('#selection-output').textContent='Seleção: 2026-10-10';},30));</script>
        </body></html>''')
        await page.evaluate(MONITOR,dict(month='.month',title='.title',grid='.grid',day='.day'))
        initial=await page.evaluate('() => window.__calendarProtocol.inspect()')
        assert initial['viewport']=={'width':390,'height':844}
        assert initial['timezone']=='America/Campo_Grande'
        assert initial['locale']=='en-US'
        assert not initial['visible_months'][0]['invisible']
        results.append('Exact viewport, timezone and locale; normal grid detected as visible')
        await page.evaluate("() => {document.querySelector('.month').style.opacity='.8';document.querySelector('.grid').style.opacity='.6';}")
        state=await page.evaluate('() => window.__calendarProtocol.inspect()')
        assert abs(state['visible_months'][0]['effective_opacity']-.48)<1e-8
        assert state['visible_months'][0]['invisible']
        results.append('Ancestor opacity product 0.8 × 0.6 = 0.48 detects invisible grid')
        await page.evaluate("() => {document.querySelector('.month').style.opacity='1';document.querySelector('.grid').style.opacity='1';for(const d of document.querySelectorAll('.day'))d.style.display='none';}")
        state=await page.evaluate('() => window.__calendarProtocol.inspect()')
        assert state['visible_months'][0]['invisible']
        results.append('No day getClientRects detects invisible grid')
        await page.evaluate("() => {for(const d of document.querySelectorAll('.day'))d.style.display='inline-block';}")
        await page.evaluate("() => window.__calendarProtocol.start('longtask')")
        await page.evaluate('() => {setTimeout(()=>{const end=performance.now()+90;while(performance.now()<end){}},0)}')
        await asyncio.sleep(.15)
        r=await page.evaluate('() => window.__calendarProtocol.finish()')
        assert r['metrics']['longtasks_count']>=1,r
        assert r['metrics']['raf_frames_over_50ms']>=1,r
        results.append('Synthetic 90ms busy task detected by longtask observer and rAF')
        await page.evaluate("() => window.__calendarProtocol.start('requested-jump')")
        await page.evaluate('() => window.__calendarProtocol.scrollBy(2400)')
        await asyncio.sleep(.10)
        r=await page.evaluate('() => window.__calendarProtocol.finish()')
        assert r['metrics']['unsolicited_scroll_jumps_over_250px']==0,r
        results.append('Requested 2400px jump excluded from unsolicited jumps')
        await page.evaluate('() => window.scrollTo({top:0,behavior:"instant"})')
        await asyncio.sleep(.10)
        await page.evaluate("() => window.__calendarProtocol.start('unrequested-jump')")
        await page.evaluate('() => window.scrollTo({top:600,behavior:"instant"})')
        await asyncio.sleep(.10)
        r=await page.evaluate('() => window.__calendarProtocol.finish()')
        assert r['metrics']['unsolicited_scroll_jumps_over_250px']>=1,r
        results.append('Unrequested 600px jump detected')
        await page.evaluate('() => window.scrollTo({top:0,behavior:"instant"})')
        await asyncio.sleep(.10)
        await page.evaluate("() => window.__calendarProtocol.start('interaction')")
        await page.evaluate('() => window.__calendarProtocol.armSelection()')
        await page.locator('.day').first.click()
        await asyncio.sleep(.15)
        r=await page.evaluate('() => window.__calendarProtocol.finish()')
        assert r['metrics']['selection_latency_ms'] is not None,r
        assert r['raw']['selection']['is_trusted'] is True
        results.append('Trusted click and selection text MutationObserver latency recorded')
        await context.close();await browser.close()
    assert status_total('Disponíveis: 22 + 0 anteriores. Janela: 9.')==22
    try:status_total(None)
    except RuntimeError:pass
    else:raise AssertionError('Missing month status must be rejected')
    assert medians([],['chatgpt','claude'],3)['chatgpt']['A']['valid_runs']==0
    results.append('Missing month status rejected; no medians invented with zero runs')
    assert build_schedule(['chatgpt','claude'],3)==[(1,'chatgpt'),(1,'claude'),(2,'claude'),(2,'chatgpt'),(3,'chatgpt'),(3,'claude')]
    sched=build_schedule(['a','b','c'],3)
    assert all(sorted(v for r,v in sched if r==n)==['a','b','c'] for n in (1,2,3))
    assert [[v for r,v in sched if r==n].index('a') for n in (1,2,3)]==[0,2,1]
    results.append('Two versions keep the original order; three versions rotate through every slot')
    for name in REGISTRY['versions']:
        cfg=resolve_versions([name],REGISTRY['base_url'])[name]
        assert cfg['url'].startswith('https://') and all(cfg[k].startswith('.') for k in ('month','title','grid','day'))
    results.append('Every registered version resolves to a URL and four CSS selectors')
    result={'scope':'synthetic_local_fixture_only_NOT_Bubble','status':'passed','checks':results}
    Path(__file__).with_name('synthetic_self_test.json').write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps(result,indent=2,ensure_ascii=False))

if __name__=='__main__':asyncio.run(test())

/* Browser-only instrumentation. Never writes to Bubble or edits the page DOM. */
(config) => {
  if (window.__calendarProtocol) throw new Error('Monitor already installed');
  const {month, title, grid, day} = config;
  let run = null, rafId = null, observer = null, selectionObserver = null;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const now = () => performance.now();
  const clamp = y => Math.max(0, Math.min(y, Math.max(0, document.documentElement.scrollHeight-innerHeight)));
  const ms = () => [...document.querySelectorAll(month)].filter(e => e.getClientRects().length);
  const output = () => document.querySelector('#selection-output');
  const outputText = () => output()?.textContent?.trim() ?? null;
  function opacityTo(element, ancestor) {
    let value = 1, node = element;
    while (node) {
      const n = Number.parseFloat(getComputedStyle(node).opacity);
      value *= Number.isFinite(n) ? n : 1;
      if (node === ancestor) return value;
      node = node.parentElement;
    }
    return null;
  }
  function visibleMonths() {
    const rows = [];
    for (const m of ms()) {
      const r = m.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
      const g = m.querySelector(grid);
      const effectiveOpacity = g ? opacityTo(g, m) : null;
      const hasCellRects = Boolean(g && [...g.querySelectorAll(day)].some(d => d.getClientRects().length > 0));
      rows.push({title: m.querySelector(title)?.textContent?.trim() || '', top:r.top, bottom:r.bottom,
        effective_opacity: effectiveOpacity, has_cell_rects:hasCellRects,
        invisible: !g || !hasCellRects || effectiveOpacity === null || effectiveOpacity < .5});
    }
    return rows;
  }
  function trackY(source) {
    if (!run) return;
    const y = scrollY, prev = run.lastY;
    if (y === prev) return;
    const dy = y-prev;
    // Conservative attribution: allow movement toward all requested input still pending.
    // Coalesced wheel input is therefore NOT automatically an unsolicited jump.
    const target = clamp(run.expectedY), lo = Math.min(prev,target), hi = Math.max(prev,target);
    const beyondRequestedEnvelope = Math.max(0,lo-y,y-hi);
    const item = {t:now()-run.start,source,from:prev,to:y,delta:dy,expected_target:target,
      unrequested_excess_px:beyondRequestedEnvelope,
      unsolicited:Math.abs(dy)>250 && beyondRequestedEnvelope>250};
    run.scroll_events.push(item);
    if (Math.abs(dy)>250) run.large_scroll_events.push(item);
    run.lastY = y;
  }
  function request(delta, source, extra={}) {
    if (!run) return;
    run.expectedY=clamp(run.expectedY+delta);
    run.inputs.push({t:now()-run.start,source,delta,expected_target:run.expectedY,...extra});
  }
  function wheel(e) {
    if (!run) return;
    // Playwright mouse.wheel dispatches pixel deltas. Retain deltaMode in raw output.
    request(e.deltaY,'wheel',{event_timestamp:e.timeStamp,delta_mode:e.deltaMode,is_trusted:e.isTrusted});
  }
  function sample(ts) {
    if (!run) return;
    const began=now();
    trackY('raf');
    const visible=visibleMonths();
    const frame={t:ts-run.start,interval_ms:ts-run.lastRaf,scroll_y:scrollY,
      visible_month_count:visible.length,months:visible,
      invisible_grid:visible.some(m=>m.invisible)};
    if (run.selection?.observed_text_at !== null && run.selection?.observed_text_at !== undefined && run.selection.first_raf_after_text_at === null) {
      run.selection.first_raf_after_text_at=ts;
    }
    frame.instrumentation_ms=now()-began;
    run.frames.push(frame);run.lastRaf=ts;rafId=requestAnimationFrame(sample);
  }
  function addTasks(entries) {
    if (!run) return;
    for (const e of entries) if (e.startTime>=run.start) {
      run.longtasks.push({start_ms:e.startTime-run.start,duration_ms:e.duration,name:e.name,
        attribution:[...e.attribution].map(a=>({name:a.name,containerType:a.containerType,containerName:a.containerName}))});
    }
  }
  function click(e) {
    if (!run?.selection || run.selection.click_event_at !== null) return;
    const cell=e.target.closest?.(day), m=cell?.closest(month);
    if (!cell || !m) return;
    run.selection.click_event_at=e.timeStamp;
    run.selection.click_handler_at=now();
    run.selection.is_trusted=e.isTrusted;
    run.selection.clicked_day=cell.textContent.trim();
    run.selection.clicked_month=m.querySelector(title)?.textContent?.trim() || '';
  }
  document.addEventListener('wheel',wheel,{capture:true,passive:true});
  document.addEventListener('scroll',()=>trackY('scroll-event'),{capture:true,passive:true});
  document.addEventListener('click',click,true);
  window.__calendarProtocol={
    start: name => new Promise(resolve=>requestAnimationFrame(ts=>{
      if (run) throw new Error('Scenario already running');
      if (!PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('longtask API unavailable');
      run={name,start:ts,lastRaf:ts,lastY:scrollY,expectedY:scrollY,frames:[],longtasks:[],inputs:[],
        scroll_events:[],large_scroll_events:[],selection:null};
      observer=new PerformanceObserver(list=>addTasks(list.getEntries()));
      observer.observe({type:'longtask',buffered:false});
      rafId=requestAnimationFrame(sample);resolve({start:ts,scroll_y:scrollY});
    })),
    scrollBy: delta => {request(delta,'scrollBy');window.scrollBy({top:delta,left:0,behavior:'instant'});},
    rafSteps: (count, delta) => new Promise(resolve=>{
      let i=0;
      function step(){window.__calendarProtocol.scrollBy(delta);i++;if(i<count)requestAnimationFrame(step);else resolve(i);}
      requestAnimationFrame(step);
    }),
    armSelection: () => {
      if (!run || !output()) throw new Error('Selection output absent');
      run.selection={baseline:outputText(),armed_at:now(),click_event_at:null,click_handler_at:null,
        observed_text_at:null,observed_text:null,first_raf_after_text_at:null,is_trusted:null};
      const owner=run;
      selectionObserver=new MutationObserver(()=>{
        if(run!==owner || owner.selection.click_event_at===null || owner.selection.observed_text_at!==null) return;
        const text=outputText();
        if(text!==null && text!==owner.selection.baseline && /\d/.test(text)){
          owner.selection.observed_text_at=now();owner.selection.observed_text=text;
        }
      });
      selectionObserver.observe(output(),{subtree:true,childList:true,characterData:true});
    },
    visibleClickPoint: () => {
      const candidates=[];
      for (const m of ms()) for (const d of m.querySelectorAll(day)) {
        const r=d.getBoundingClientRect(), g=d.closest(grid), o=opacityTo(d,m);
        if(r.width<=0 || r.height<=0 || r.top<45 || r.bottom>innerHeight-45 || r.left<0 || r.right>innerWidth)continue;
        if(!g || o===null || o<.5 || getComputedStyle(d).pointerEvents==='none')continue;
        const text=d.textContent.trim();if(!/^\d{1,2}$/.test(text))continue;
        const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        if(!hit || !d.contains(hit))continue;
        candidates.push({x,y,day:text,month:m.querySelector(title)?.textContent?.trim()||'',score:Math.abs(y-innerHeight/2)});
      }
      candidates.sort((a,b)=>a.score-b.score);return candidates[0]||null;
    },
    finish: () => {
      if(!run)throw new Error('No active scenario');
      cancelAnimationFrame(rafId);addTasks(observer.takeRecords());observer.disconnect();selectionObserver?.disconnect();
      const end=now(), root=document.querySelector('#calendar-under-test');
      const r=run;run=null;
      const tasks=r.longtasks.filter(t=>t.start_ms<=end-r.start),f=r.frames;
      const bad=f.filter(x=>x.invisible_grid).length;
      const sel=r.selection;
      const latency=sel?.click_event_at!=null && sel?.observed_text_at!=null?sel.observed_text_at-sel.click_event_at:null;
      return clone({scenario:r.name,measurement_duration_ms:end-r.start,
        metrics:{longtasks_count:tasks.length,longtasks_sum_ms:tasks.reduce((s,t)=>s+t.duration_ms,0),
          longtasks_max_ms:Math.max(0,...tasks.map(t=>t.duration_ms)),
          raf_max_interval_ms:Math.max(0,...f.map(x=>x.interval_ms)),raf_frames_over_50ms:f.filter(x=>x.interval_ms>50).length,
          sampled_frames:f.length,frames_with_invisible_grid:bad,invisible_grid_frame_fraction:f.length?bad/f.length:null,
          unsolicited_scroll_jumps_over_250px:r.large_scroll_events.filter(x=>x.unsolicited).length,
          dom_elements_document:document.querySelectorAll('*').length,
          dom_elements_calendar:root?root.querySelectorAll('*').length:null,
          selection_latency_ms:latency,
          selection_next_raf_latency_ms:sel?.click_event_at!=null && sel?.first_raf_after_text_at!=null?sel.first_raf_after_text_at-sel.click_event_at:null,
          instrumentation_total_ms:f.reduce((s,x)=>s+x.instrumentation_ms,0)},
        raw:{longtasks:tasks,frames:f,inputs:r.inputs,scroll_events:r.scroll_events,large_scroll_events:r.large_scroll_events,selection:sel},
        final_scroll_y:scrollY});
    },
    inspect:()=>({visible_months:visibleMonths(),selection:outputText(),month_shells:ms().length,
      status_text:document.querySelector('#calendar-load-status')?.textContent?.trim()||null,
      viewport:{width:innerWidth,height:innerHeight},timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale:navigator.language,user_agent:navigator.userAgent}),
  };
}

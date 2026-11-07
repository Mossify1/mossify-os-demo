/* Demo stand-in for the Command Center server (:8792). Serves window.DEMO_SNAPSHOT,
   adds a fake live event every few seconds, simulates Fix, Ask, ideas and feedback drafts. */
(function () {
  const RealDate = Date, offset = RealDate.parse('2026-11-06T14:30:00Z') - RealDate.now();
  class DemoDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); } static now() { return RealDate.now() + offset; } }
  DemoDate.parse = RealDate.parse; DemoDate.UTC = RealDate.UTC; window.Date = DemoDate;

  const S = window.DEMO_SNAPSHOT;
  const pool = S.feed.slice(0, 20).map(e => Object.assign({}, e));
  let n = 0;
  const now = () => Date.now() / 1000;
  function tick() {
    const base = pool[n % pool.length]; n++;
    const e = Object.assign({}, base, {id: 'live' + n, ts: now()});
    S.feed.unshift(e); S.feed = S.feed.slice(0, 150);
    const node = S.nodes.find(x => x.id === e.node);
    if (node) { node.actionsToday++; node.actions7d++; node.spark[13]++; node.lastRun = new Date().toISOString(); }
    S.actionsToday++;
    S.updated = new Date().toISOString();
    if (typeof window.load === 'function') window.load();
  }
  setInterval(() => { if (!document.hidden) tick(); }, 6500);

  const FIX_STEPS = [['queued', 'Queued'], ['checking', 'Reading the last log'], ['restarting', 'Restarting the job'], ['fixed', 'Back to healthy']];
  function startFix(id) {
    let i = 0;
    const step = () => {
      const [state, label] = FIX_STEPS[i];
      S.fixes[id] = {state, step: label, by: 'lucas', started: now(), ended: state === 'fixed' ? now() : null,
                     cause: 'Etsy API timed out twice', fix: state === 'fixed' ? 'Re-ran the sync; 214 listings and stock levels up to date.' : '', lucas: ''};
      if (state === 'fixed') {
        S.nodes.forEach(nd => nd.jobs.forEach(j => { if (j.id === id) { j.status = 'ok'; j.note = ''; j.why = null; } }));
        S.nodes.forEach(nd => { if (nd.jobs.some(j => j.id === id)) { nd.status = nd.jobs.some(j => j.status === 'fail') ? 'fail' : nd.jobs.some(j => j.status === 'warn') ? 'warn' : 'ok'; nd.note = ''; } });
        S.needs = S.needs.filter(x => !(x.items || []).some(it => it.job === id));
        S.counts = {ok: 0, warn: 0, fail: 0, idle: 0}; S.nodes.forEach(nd => S.counts[nd.status]++);
        S.feed.unshift({id: 'fix' + Date.now(), ts: now(), node: 'cos', text: 'Fix agent fixed ' + id + ' (you pressed Fix)', sys: 'hub', out: 'ok', src: 'fix',
                        detail: {Job: id, 'Started by': 'Lucas', Cause: 'Etsy API timed out twice', Fix: 'Re-ran the sync, all listings in step', Took: '41s'}});
      }
      if (typeof window.load === 'function') window.load();
      if (++i < FIX_STEPS.length) setTimeout(step, 1600);
    };
    step();
  }

  const ANSWERS = [
    [/sale|revenue|sell/i, 'Sales today are $4,917 across 19 orders, ahead of last Friday by 12%. Wholesale CA is the biggest chunk ($2,410, 3 orders). Yesterday closed at $2,490 vs $2,210 the week before.'],
    [/ad|roas|meta|google/i, 'Ads are at 4.1x over the last 7 days, right on the 4.0x target. Google Shopping is the best at 4.8x, so the ads agent moved its budget up 20% this morning. Meta is 3.3x and two weak test ads were cut yesterday.'],
    [/fail|down|broken|wrong|health/i, '17 of 18 agents are healthy. Etsy sync failed twice on an API timeout. Press Fix on its card and the fix agent re-runs it; nothing else needs you.'],
    [/ar|owe|invoice|overdue|collect/i, 'Customers owe $41.8k in total, $9.6k of it overdue. Two accounts are 60+ days late ($2.2k). Reminders went out automatically this week and Keshav logged a promise to pay on one of them.'],
    [/stock|inventory|reorder|out/i, 'One SKU is out and 4 will run out inside their lead time. The 30" moss pole sells 18 a day, so the purchasing agent already drafted a PO for it in your Gmail.'],
    [/team|aidan|keshav|thiago/i, 'Good week for the team. Aidan is on pace for his win-back target, Keshav has freight under 18%, and Thiago’s newest ad has the best hold rate yet. Two things are waiting on you.'],
  ];
  function ask(q) {
    const hit = ANSWERS.find(([re]) => re.test(q));
    return {answer: hit ? hit[1] : 'In the live system this question goes to Claude, which reads the real agent logs and numbers (read-only). In this demo, try asking about sales, ads, what’s failing, who owes us, stock or the team.', cost: 0.01};
  }

  const json = (o, status) => Promise.resolve(new Response(JSON.stringify(o), {status: status || 200, headers: {'Content-Type': 'application/json'}}));
  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url && url.url || url);
    if (!u.startsWith('/api/')) {
      if (/demo\.invalid/.test(u)) return json({ok: true});
      return realFetch(url, opts);
    }
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const delay = (o, ms) => new Promise(r => setTimeout(() => r(json(o)), ms));
    switch (u.split('?')[0]) {
      case '/api/snapshot': return json(S);
      case '/api/ask': return delay(ask(body.q || ''), 1400);
      case '/api/fix': (body.jobs || []).forEach(startFix); return json({started: body.jobs || [], errors: []});
      case '/api/dismiss': return json({ok: true});
      case '/api/idea/start': return delay({ok: true, link: '#demo'}, 600);
      case '/api/team/draft': return delay({to: body.person + '@demo.mossify', drafts: [
        {label: 'Warm', subject: 'Great week, ' + body.person, body: 'Hey ' + body.person + ',\n\nJust wanted to say the work this week really showed. Keep it going and tell me where I can help.\n\nLucas'},
        {label: 'Direct', subject: 'This week + one ask', body: 'Hi ' + body.person + ',\n\nStrong week overall. One ask for next week: close the open item on your list by Wednesday.\n\nThanks,\nLucas'},
        {label: 'Short', subject: 'Thanks!', body: 'Nice work this week ' + body.person + ' 🙌\n\nLucas'}]}, 1200);
      case '/api/team/send': return delay({ok: true, to: body.person + '@demo.mossify', link: '#demo'}, 700);
      default: return json({ok: true});
    }
  };
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/^https?:/.test(h) || h === '#demo') { e.preventDefault(); e.stopPropagation(); toast('Opens the real app in the live system. Turned off in the demo.'); }
  }, true);
  function toast(m) {
    let t = document.getElementById('demo-toast');
    if (!t) { t = document.createElement('div'); t.id = 'demo-toast'; t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#272922;color:#fff;font:500 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:999px;z-index:2147483647;max-width:90vw;text-align:center;transition:opacity .25s;pointer-events:none'; document.body.appendChild(t); }
    t.textContent = m; t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = '0', 2600);
  }
})();

/* Demo stand-in for claude.ai's window.claude (db, user, assets, downloads, mcp).
   Everything lives in memory and resets on reload. Data comes from window.DEMO_DB.
   ?as=<Name> picks who you're viewing as; ?clock=<ISO> sets the demo clock.
   The hub pages are rewritten at build time to call window.DEMO_CLAUDE instead of window.claude:
   on claude.ai the host puts its own read-only window.claude on every page before any script runs,
   and its use('db') resolves null there, which left every data section empty. */
(function () {
  const qs = new URLSearchParams(location.search);
  const RealDate = Date;
  const clockAt = RealDate.parse(qs.get('clock') || window.DEMO_CLOCK || '2026-11-06T14:30:00Z');
  const offset = clockAt - RealDate.now();
  class DemoDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
    static now() { return RealDate.now() + offset; }
  }
  DemoDate.parse = RealDate.parse; DemoDate.UTC = RealDate.UTC;
  window.Date = DemoDate;

  const TEAM = ['Lucas', 'Aidan', 'Keshav', 'Thiago'];
  const UID = n => 'u_demo' + n + '0'.repeat(19 - n.length);
  const me = TEAM.includes(qs.get('as')) ? qs.get('as') : 'Lucas';
  try { if (qs.get('look')) localStorage.setItem('hubLook', qs.get('look')); } catch (e) {}
  const myId = UID(me);
  const EDITORS = ['Lucas', 'Keshav'];

  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const store = {};
  const src = window.DEMO_DB || {};
  for (const col in src) store[col] = clone(src[col]);
  const colOf = p => p.split('/').slice(0, -1).join('/');
  const idOf = p => p.split('/').pop();
  const colListeners = {}, docListeners = {};
  let seq = 0;
  const newId = () => 'demo' + Date.now().toString(36) + (seq++).toString(36);

  function docSnap(col, id) {
    const d = store[col] && store[col][id];
    return {id, exists: d !== undefined, ref: {id, path: col + '/' + id}, data: () => clone(d)};
  }
  function querySnap(col, q) {
    let ids = Object.keys(store[col] || {});
    let docs = ids.map(id => docSnap(col, id));
    if (q.order) {
      const [f, dir] = q.order;
      docs.sort((a, b) => { const x = (a.data() || {})[f], y = (b.data() || {})[f]; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); });
    }
    if (q.lim) docs = docs.slice(0, q.lim);
    return {docs, size: docs.length, empty: !docs.length, forEach: fn => docs.forEach(fn), docChanges: () => docs.map(d => ({type: 'added', doc: d}))};
  }
  function notify(col, id) {
    setTimeout(() => {
      (colListeners[col] || []).forEach(l => { try { l.cb(querySnap(col, l.q)); } catch (e) { console.error(e); } });
      (docListeners[col + '/' + id] || []).forEach(cb => { try { cb(docSnap(col, id)); } catch (e) { console.error(e); } });
    }, 0);
  }
  function setPath(obj, path, val) {
    const parts = path.split('.'); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (typeof o[parts[i]] !== 'object' || o[parts[i]] === null) o[parts[i]] = {}; o = o[parts[i]]; }
    if (val && val.__delete__) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val;
  }
  function write(col, id, data, mode) {
    store[col] = store[col] || {};
    if (mode === 'delete') delete store[col][id];
    else if (mode === 'set') store[col][id] = clone(data);
    else { const cur = store[col][id] || {}; Object.keys(data).forEach(k => setPath(cur, k, clone(data[k]))); store[col][id] = cur; }
    notify(col, id);
    return Promise.resolve();
  }

  function query(col, q) {
    return {
      orderBy: (f, dir) => query(col, Object.assign({}, q, {order: [f, dir || 'asc']})),
      limit: n => query(col, Object.assign({}, q, {lim: n})),
      where: () => query(col, q),
      get: () => Promise.resolve(querySnap(col, q)),
      add: data => { const id = newId(); return write(col, id, data, 'set').then(() => ({id, path: col + '/' + id})); },
      doc: id => docRef(col + '/' + (id || newId())),
      onSnapshot: (cb, err) => {
        const l = {cb, q}; (colListeners[col] = colListeners[col] || []).push(l);
        setTimeout(() => cb(querySnap(col, q)), 0);
        return () => { colListeners[col] = colListeners[col].filter(x => x !== l); };
      }
    };
  }
  function docRef(path) {
    const col = colOf(path), id = idOf(path);
    return {
      id, path,
      get: () => Promise.resolve(docSnap(col, id)),
      set: (data, opts) => write(col, id, data, opts && opts.merge ? 'update' : 'set'),
      update: data => write(col, id, data, 'update'),
      delete: () => write(col, id, null, 'delete'),
      onSnapshot: (cb, err) => {
        const k = col + '/' + id; (docListeners[k] = docListeners[k] || []).push(cb);
        setTimeout(() => cb(docSnap(col, id)), 0);
        return () => { docListeners[k] = docListeners[k].filter(x => x !== cb); };
      },
      toString: () => path
    };
  }
  const db = {collection: p => query(p, {}), doc: p => docRef(p)};

  const user = {
    id: async () => myId,
    isOwner: async () => me === 'Lucas',
    can: async () => true,
    canEdit: async () => EDITORS.includes(me),
    me: async () => ({name: me + ' (demo)', id: myId}),
    profiles: async ids => { const o = {}; ids.forEach(i => { const n = TEAM.concat(['Claude']).find(t => UID(t) === i); o[i] = {name: n || 'Teammate'}; }); return o; }
  };

  const blobs = {};
  const assets = {
    upload: async (file, opts) => { const id = 'demo' + Math.random().toString(16).slice(2, 14); blobs[id] = URL.createObjectURL(file); return {id, contentType: file.type, sizeBytes: file.size, url: blobs[id]}; },
    delete: async () => {},
    list: async () => ({assets: [], usage: {}}),
    url: id => blobs[id] || '#'
  };
  const downloads = {save: async ({filename, data}) => { toast('Download: ' + filename + ' (demo file)'); }};

  /* Google Calendar stand-in for the V2 hub's Calendar tab: a believable week for each person, the same every week. */
  const CAL = {
    Lucas: [[1, 10, 0, 30, 'Weekly numbers (30 min)', 'Team Hub'], [2, 13, 30, 30, 'Call with a garden-centre buyer', 'Phone'], [3, 12, 0, 60, 'Lunch with Aidan', ''], [4, 16, 0, 45, 'Ad creative review', 'Meet'], [5, 9, 0, 30, 'Supplier call: Lakeview Coir Mills', 'Meet']],
    Aidan: [[1, 10, 0, 30, 'Weekly numbers (30 min)', 'Team Hub'], [2, 9, 30, 120, 'Account calls: lapsed garden centres', ''], [3, 12, 0, 60, 'Lunch with Lucas', ''], [3, 14, 0, 60, 'Prairie Growers co-op check-in', 'Meet'], [4, 9, 0, 90, 'Applications + CRM clean-up', ''], [5, 11, 0, 60, 'Trade-show prep', '']],
    Keshav: [[1, 8, 30, 30, 'Warehouse call: Toronto receiving', 'Phone'], [1, 10, 0, 30, 'Weekly numbers (30 min)', 'Team Hub'], [3, 11, 0, 60, 'Freight review: open RFQs', ''], [4, 15, 0, 30, 'Customs broker: drawback claim', 'Phone'], [5, 13, 0, 120, 'Receiving at Toronto (closes 3 PM)', 'Lakeshore 3PL']],
    Thiago: [[1, 10, 0, 30, 'Weekly numbers (30 min)', 'Team Hub'], [2, 0, 0, 0, 'Shoot day', 'Studio'], [4, 13, 0, 90, 'Edit review with Lucas', 'Meet'], [5, 10, 0, 60, 'Influencer picks + gifting', '']]
  };
  const pad = n => String(n).padStart(2, '0');
  const localIso = (d, h, m) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + (h == null ? '' : 'T' + pad(h) + ':' + pad(m) + ':00');
  function calEvents(who, startIso) {
    const s = new RealDate((startIso || '').slice(0, 10) + 'T00:00:00'), out = [];
    if (isNaN(s)) return out;
    const dow = (s.getDay() + 6) % 7, mon = new RealDate(s); mon.setDate(mon.getDate() - dow);
    const weekNo = Math.floor(mon.getTime() / 6048e5);
    (CAL[who] || []).forEach(([day, h, m, dur, summary, location], i) => {
      const d = new RealDate(mon); d.setDate(mon.getDate() + day - 1);
      if (dur === 0) { out.push({summary, location, start: {date: localIso(d)}, end: {date: localIso(d)}, htmlLink: '', eventType: 'default'}); return; }
      const e = new RealDate(d); e.setHours(h, m + dur, 0, 0);
      out.push({summary, location, start: {dateTime: localIso(d, h, m)}, end: {dateTime: localIso(e, e.getHours(), e.getMinutes())}, htmlLink: '', eventType: 'default'});
    });
    if (who === 'Thiago' && weekNo % 3 === 1) { const f = new RealDate(mon); f.setDate(mon.getDate() + 4); out.push({summary: 'Out of office', location: '', start: {date: localIso(f)}, end: {date: localIso(f)}, htmlLink: '', eventType: 'OUT_OF_OFFICE'}); }
    return out;
  }
  const whoOf = id => { const n = String(id || '').split('@')[0].toLowerCase(); return TEAM.find(t => t.toLowerCase() === n) || 'Lucas'; };
  const mcp = {
    watchTool: (server, tool, input, handler, opts) => {
      let on = true;
      setTimeout(() => { if (!on) return; const events = tool === 'list_events' ? calEvents(whoOf(input && input.calendarId), input && input.startTime) : []; try { handler({type: 'data', result: {payload: {events}}, cache: {storedAt: new Date().toISOString()}}); } catch (e) { console.error(e); } }, 120);
      return () => { on = false; };
    },
    callTool: async (server, tool, input) => ({payload: tool === 'list_events' ? {events: calEvents(whoOf(input && input.calendarId), input && input.startTime)} : {}}),
    describeTool: async () => ({}),
    server: async () => ({})
  };
  window.DEMO_MCP = mcp;

  const api = {db, user, assets, downloads, mcp};
  window.DEMO_CLAUDE = {use: async name => api[name] || null, demo: true};
  try { window.claude = window.DEMO_CLAUDE; } catch (e) {}
  window.DEMO = {me, myId, store, toast: (m) => toast(m)};

  function toast(msg) {
    let t = document.getElementById('demo-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'demo-toast';
      t.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#272922;color:#fff;font:500 14px/1.4 system-ui,sans-serif;padding:10px 16px;border-radius:999px;z-index:2147483647;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:min(90vw,520px);text-align:center;transition:opacity .25s;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.style.opacity = '1';
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, 2600);
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    const u = String(url && url.url || url);
    if (/demo\.invalid/.test(u)) {
      toast('In the live system this talks to the Mac mini. Simulated here.');
      return Promise.resolve(new Response(JSON.stringify({ok: true, demo: true, started: ['po-intake', 'ar-watch', 'rfq-agent'], jobs: []}), {status: 200, headers: {'Content-Type': 'application/json'}}));
    }
    return realFetch(url, opts);
  };

  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const h = a.getAttribute('href') || '';
    if (/^(https?:)?\/\//.test(h) || h.startsWith('/_blob/') || h === '#demo' || h.startsWith('mailto:') || h.startsWith('tel:')) {
      if (/fonts\.googleapis|cdnjs/.test(h)) return;
      e.preventDefault(); e.stopPropagation();
      const what = /mail\.google/.test(h) ? 'Gmail' : /shopify/.test(h) ? 'Shopify' : /demo\.invalid\/(reel|tt|yt)/.test(h) ? 'the post on social' : /demo\.invalid/.test(h) ? 'a tool on the Mac mini' : /^(mailto|tel):/.test(h) ? 'your mail or phone app' : 'the real file or app';
      toast('Opens ' + what + ' in the live system. Turned off in the demo.');
    }
  }, true);
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (/\/_blob\//.test(this.currentSrc || this.src || '')) { toast('The spoken quote plays in the live hub. Muted in the demo.'); return Promise.resolve(); }
    return realPlay.apply(this, arguments);
  };
  window.open = (u) => { toast('Opens a new window in the live system. Turned off in the demo.'); return null; };
  window.confirm = () => true;
  window.addEventListener('message', e => {
    if (e.data && e.data.demo === 'reset') location.reload();
  });
})();

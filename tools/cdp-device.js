// 真机 WebView 诊断：输出布局关键数值
const http = require('http');
const PORT = process.argv[2] || '9222';

const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

const EXPR = `JSON.stringify((function(){
  var d = document, b = document.body;
  var ed = d.getElementById('editorPane'), pv = d.getElementById('previewPane'), tb = d.getElementById('toolbar');
  var r = function(el){ if(!el) return null; var x = el.getBoundingClientRect(); return {top: Math.round(x.top), bottom: Math.round(x.bottom), h: Math.round(x.height)}; };
  return {
    dpr: devicePixelRatio,
    innerW: innerWidth, innerH: innerHeight,
    docScrollTop: d.documentElement.scrollTop, docScrollH: d.documentElement.scrollHeight,
    bodyScrollH: b.scrollHeight, bodyScrollTop: b.scrollTop,
    mode: b.getAttribute('data-mode'),
    bar: r(d.getElementById('bar')),
    toolbar: r(tb),
    editorPane: r(ed),
    textarea: r(d.getElementById('editor')),
    previewPane: r(pv),
    previewPaneScrollTop: pv ? pv.scrollTop : null,
    previewPaneScrollH: pv ? pv.scrollHeight : null,
    preview: r(d.getElementById('preview')),
    editorScrollTop: d.getElementById('editor').scrollTop,
    editorScrollH: d.getElementById('editor').scrollHeight,
    panesH: Math.round(d.getElementById('panes').getBoundingClientRect().height),
    visualViewportH: window.visualViewport ? Math.round(window.visualViewport.height) : null
  };
})())`;

(async () => {
  const tabs = await getJSON('/json');
  const page = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); } };
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });

  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
  if (r.result && r.result.result && r.result.result.value) {
    console.log(JSON.stringify(JSON.parse(r.result.result.value), null, 2));
  } else {
    console.log('FAIL', JSON.stringify(r.result).slice(0, 500));
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

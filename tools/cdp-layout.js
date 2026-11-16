// 极端尺寸布局检查：320 窄屏 / 横屏 / 大字号
const fs = require('fs');
const http = require('http');
const PORT = process.argv[2], OUT = process.argv[3];

const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json');
  const page = tabs.find(t => t.type === 'page' && /index\.html/.test(t.url)) || tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); } };
  const send = (m, p = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return (r.result && r.result.result) ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');

  const cases = [
    { tag: 'narrow320', w: 320, h: 640, dpr: 2 },
    { tag: 'landscape', w: 844, h: 390, dpr: 2 },
    { tag: 'bigfont',   w: 390, h: 844, dpr: 2, before: "document.querySelector('[data-act=font-inc]').click();document.querySelector('[data-act=font-inc]').click();document.querySelector('[data-act=font-inc]').click();document.querySelector('[data-act=font-inc]').click();document.querySelector('[data-act=font-inc]').click();document.querySelector('[data-act=font-inc]').click();"}
  ];

  for (const c of cases) {
    await send('Emulation.setDeviceMetricsOverride', { width: c.w, height: c.h, deviceScaleFactor: c.dpr, mobile: c.w < c.h });
    if (c.before) await ev(c.before);
    await new Promise(r => setTimeout(r, 350));
    const metrics = await ev(`JSON.stringify({
      iw: innerWidth, ih: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      bodyH: document.body.scrollHeight,
      actionsRight: Math.round(document.getElementById('actions').getBoundingClientRect().right),
      toolbarScrollW: document.getElementById('toolbar').scrollWidth,
      toolbarClientW: document.getElementById('toolbar').clientWidth,
      editorH: Math.round(document.getElementById('editor').getBoundingClientRect().height)
    })`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`${OUT}/layout-${c.tag}.png`, Buffer.from(shot.result.data, 'base64'));
    console.log('  ' + c.tag + ': ' + metrics);
  }

  // 菜单在窄屏的表现
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 2, mobile: true });
  await ev("document.querySelector('[data-act=menu]').click()");
  await new Promise(r => setTimeout(r, 300));
  const sheet = await ev("JSON.stringify({cols: getComputedStyle(document.querySelector('.sheet-grid')).gridTemplateColumns.split(' ').length, sheetH: Math.round(document.getElementById('sheet').getBoundingClientRect().height)})");
  console.log('  320 宽菜单: ' + sheet);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/layout-narrow320-menu.png`, Buffer.from(shot2.result.data, 'base64'));

  ws.close(); process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

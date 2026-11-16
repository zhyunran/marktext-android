// CDP 场景截图：手机视口 390x844，覆盖深/浅主题、菜单、查找
const fs = require('fs');
const http = require('http');

const PORT = process.argv[2];
const OUT = process.argv[3];

const getJSON = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});

(async () => {
  const tabs = await getJSON('/json');
  const page = tabs.find(t => t.type === 'page' && /index\.html/.test(t.url)) || tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const f = pend.get(m.id); pend.delete(m.id); f(m); } };
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pend.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const res = r.result || {};
    if (res.exceptionDetails) console.log('  [exc] ' + JSON.stringify(res.exceptionDetails.exception && res.exceptionDetails.exception.description));
    return res.result && res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(r.result.data, 'base64');
    const f = `${OUT}/${name}.png`;
    fs.writeFileSync(f, buf);
    console.log('  ' + name + '.png  ' + Math.round(buf.length / 1024) + ' KB');
  };

  // 1) 深色 · 分屏（默认）
  await evalJs("localStorage.setItem('marktext.settings', JSON.stringify({theme:'dark',editorFont:14,previewFont:15})); location.reload()");
  await new Promise(r => setTimeout(r, 900));
  await shot('v2-phone-dark-split');

  // 2) 深色 · 菜单
  await evalJs("document.querySelector('[data-act=menu]').click()");
  await new Promise(r => setTimeout(r, 350));
  await shot('v2-phone-dark-menu');

  // 3) 浅色 · 菜单（点两次主题：dark→light）
  await evalJs("document.querySelector('[data-act=theme]').click()");
  await new Promise(r => setTimeout(r, 350));
  await shot('v2-phone-light-menu');

  // 4) 浅色 · 分屏
  await evalJs("document.getElementById('scrim').click()");
  await new Promise(r => setTimeout(r, 250));
  await shot('v2-phone-light-split');

  // 5) 查找（浅色）
  await evalJs("document.querySelector('[data-act=find]').click(); document.getElementById('findInput').value='Markdown'; document.getElementById('findInput').dispatchEvent(new Event('input'))");
  await new Promise(r => setTimeout(r, 600));
  await shot('v2-phone-find');
  const findCount = await evalJs("document.getElementById('findCount').textContent");
  console.log('  查找计数 = ' + findCount);

  // 6) 布局实测
  const metrics = await evalJs(`JSON.stringify({
    iw: innerWidth, scrollW: document.documentElement.scrollWidth,
    theme: document.body.getAttribute('data-theme'),
    actionsRight: Math.round(document.getElementById('actions').getBoundingClientRect().right),
    sheetVisible: !document.getElementById('sheet').hasAttribute('hidden'),
    findVisible: !document.getElementById('findbar').hasAttribute('hidden'),
    marks: document.querySelectorAll('#preview mark').length,
    editorFont: getComputedStyle(document.documentElement).getPropertyValue('--editor-font').trim()
  })`);
  console.log('  实测:', metrics);

  // 7) 撤销 / 重做
  const undoCheck = await evalJs(`(function(){
    var ed = document.getElementById('editor');
    var before = ed.value;
    ed.focus(); ed.value = before + '\\n\\nUNDO-TEST';
    ed.dispatchEvent(new Event('input'));
    var mid = ed.value;
    document.querySelector('[data-act=undo]').click();
    var afterUndo = ed.value;
    document.querySelector('[data-act=redo]').click();
    var afterRedo = ed.value;
    return JSON.stringify({midOk: mid.indexOf('UNDO-TEST')>0, undoOk: afterUndo.indexOf('UNDO-TEST')<0, redoOk: afterRedo.indexOf('UNDO-TEST')>0});
  })()`);
  console.log('  撤销/重做:', undoCheck);

  // 8) 字号
  const fontCheck = await evalJs(`(function(){
    document.querySelector('[data-act=font-inc]').click();
    document.querySelector('[data-act=font-inc]').click();
    var up = getComputedStyle(document.documentElement).getPropertyValue('--editor-font').trim();
    document.querySelector('[data-act=font-reset]').click();
    var reset = getComputedStyle(document.documentElement).getPropertyValue('--editor-font').trim();
    return up + ' -> ' + reset;
  })()`);
  console.log('  字号:', fontCheck);

  // 9) 打印 HTML 生成
  const printCheck = await evalJs(`(function(){
    var html = null;
    var origAndroid = window.Android;
    window.Android = { print: function(h,n){ html = h; window.__printName = n; } };
    document.querySelector('[data-act=print]').click();
    window.Android = origAndroid;
    return JSON.stringify({len: html ? html.length : 0, hasDoctype: !!(html && html.indexOf('<!DOCTYPE')===0), name: window.__printName});
  })()`);
  console.log('  打印:', printCheck);

  ws.close();
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });

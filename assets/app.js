/* MarkText Android · 所见即所得编辑器（无第三方库） */
(function () {
  'use strict';

  var doc, titleEl, statsEl, sheet, scrim;

  /* ============ 设置 ============ */
  var S = { theme: 'dark', fontSize: 16 };
  var THEMES = ['dark', 'light', 'auto'];
  var THEME_LABEL = { dark: '深色', light: '浅色', auto: '跟随系统' };

  function loadSettings() {
    try {
      var raw = localStorage.getItem('mt.settings');
      if (raw) { var o = JSON.parse(raw); S.theme = o.theme || S.theme; S.fontSize = +o.fontSize || S.fontSize; }
    } catch (e) {}
  }
  function saveSettings() { try { localStorage.setItem('mt.settings', JSON.stringify(S)); } catch (e) {} }
  function resolvedTheme() {
    if (S.theme !== 'auto') return S.theme;
    return (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  function applySettings() {
    document.body.setAttribute('data-theme', resolvedTheme());
    document.documentElement.style.setProperty('--doc-font', S.fontSize + 'px');
    var tb = document.querySelector('[data-act="theme"]');
    if (tb) tb.textContent = '主题：' + THEME_LABEL[S.theme];
    if (statsEl) statsEl.textContent = statsLine();
  }

  function toast(msg) {
    if (window.Android && window.Android.toast) window.Android.toast(msg);
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 1500);
  }

  /* ============ Markdown → HTML ============ */

  function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function inlineToHtml(src) {
    var codes = [];
    var s = src.replace(/`([^`\n]+)`/g, function (_, c) { codes.push('<code>' + escHtml(c) + '</code>'); return '\u0000C' + (codes.length - 1) + '\u0000'; });
    s = escHtml(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\u0000C(\d+)\u0000/g, function (_, i) { return codes[+i]; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s;
  }

  function mdToHtml(md) {
    if (!md) return '<p><br></p>';
    var text = md.replace(/\r\n?/g, '\n');
    var fences = [];
    text = text.replace(/^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm, function (_, lang) {
      var body = arguments[2];
      fences.push('<pre><code>' + escHtml(body.replace(/\n$/, '')) + '</code></pre>');
      return '\u0000F' + (fences.length - 1) + '\u0000';
    });

    var lines = text.split('\n'), out = [], i = 0;

    function row(line) {
      var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
      return t.split('|').map(function (c) { return c.trim(); });
    }
    function item(line) {
      var m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      if (!m) return null;
      var task = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
      return { ordered: /\d/.test(m[2]), task: task ? task[1].toLowerCase() === 'x' : null, text: task ? task[2] : m[3] };
    }

    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^\u0000F\d+\u0000$/.test(line.trim())) { out.push(line.trim()); i++; continue; }

      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { out.push('<h' + h[1].length + '>' + inlineToHtml(h[2]) + '</h' + h[1].length + '>'); i++; continue; }

      if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (/^ {0,3}>/.test(line)) {
        var q = [];
        while (i < lines.length && /^ {0,3}>/.test(lines[i])) { q.push(lines[i].replace(/^ {0,3}>\s?/, '')); i++; }
        out.push('<blockquote>' + mdToHtml(q.join('\n')) + '</blockquote>');
        continue;
      }

      if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
        var head = row(lines[i]); i += 2;
        var body = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) { body.push(row(lines[i])); i++; }
        var html = '<table><thead><tr>' + head.map(function (c) { return '<th>' + inlineToHtml(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        body.forEach(function (r) {
          html += '<tr>' + head.map(function (_, k) { return '<td>' + inlineToHtml(r[k] || '') + '</td>'; }).join('') + '</tr>';
        });
        out.push(html + '</tbody></table>');
        continue;
      }

      var first = item(line);
      if (first) {
        var tag = first.ordered ? 'ol' : 'ul';
        var html2 = '<' + tag + '>';
        while (i < lines.length) {
          var it = item(lines[i]);
          if (!it) break;
          if (it.task !== null) {
            html2 += '<li data-task="' + (it.task ? '1' : '0') + '">' + (it.task ? '☑ ' : '☐ ') + inlineToHtml(it.text) + '</li>';
          } else {
            html2 += '<li>' + inlineToHtml(it.text) + '</li>';
          }
          i++;
        }
        out.push(html2 + '</' + tag + '>');
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\u0000F)/.test(lines[i]) && !item(lines[i])) { para.push(lines[i]); i++; }
      out.push('<p>' + inlineToHtml(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('\n').replace(/\u0000F(\d+)\u0000/g, function (_, k) { return fences[+k]; });
  }

  /* ============ HTML → Markdown ============ */

  function inlineToMd(node) {
    var out = '';
    for (var n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\u00a0/g, ' '); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      var inner = inlineToMd(n);
      if (tag === 'strong' || tag === 'b') out += '**' + inner + '**';
      else if (tag === 'em' || tag === 'i') out += '*' + inner + '*';
      else if (tag === 'del' || tag === 's' || tag === 'strike') out += '~~' + inner + '~~';
      else if (tag === 'u') out += '++' + inner + '++';
      else if (tag === 'code' && n.parentNode.tagName.toLowerCase() !== 'pre') out += '`' + inner + '`';
      else if (tag === 'br') out += '\n';
      else if (tag === 'a') out += '[' + inner + '](' + (n.getAttribute('href') || '') + ')';
      else if (tag === 'img') out += '![' + (n.getAttribute('alt') || '图片') + '](' + (n.getAttribute('src') || '') + ')';
      else out += inner;
    }
    return out;
  }

  function htmlToMd(root) {
    var blocks = [];
    for (var n = root.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        var t = n.nodeValue.replace(/\u00a0/g, ' ').trim();
        if (t) blocks.push(t);
        continue;
      }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        blocks.push(new Array(+tag[1] + 1).join('#') + ' ' + inlineToMd(n).trim());
      } else if (tag === 'p' || tag === 'div') {
        var s = inlineToMd(n).trim();
        if (s) blocks.push(s);
      } else if (tag === 'blockquote') {
        var qm = inlineToMd(n).trim();
        if (qm) blocks.push(qm.split('\n').map(function (l) { return '> ' + l; }).join('\n'));
      } else if (tag === 'pre') {
        blocks.push('```\n' + (n.textContent || '').replace(/\n$/, '') + '\n```');
      } else if (tag === 'hr') {
        blocks.push('---');
      } else if (tag === 'ul' || tag === 'ol') {
        var lines = [];
        for (var li = n.firstChild; li; li = li.nextSibling) {
          if (li.nodeType !== 1 || li.tagName.toLowerCase() !== 'li') continue;
          var tt = inlineToMd(li).trim();
          var taskAttr = li.getAttribute('data-task');
          if (taskAttr === '1') lines.push('- [x] ' + tt.replace(/^☑\s*/, ''));
          else if (taskAttr === '0') lines.push('- [ ] ' + tt.replace(/^☐\s*/, ''));
          else lines.push((tag === 'ol' ? (lines.length + 1) + '. ' : '- ') + tt);
        }
        if (lines.length) blocks.push(lines.join('\n'));
      } else if (tag === 'table') {
        var rows = [];
        var trs = n.querySelectorAll('tr');
        for (var r = 0; r < trs.length; r++) {
          var cells = [];
          var tds = trs[r].children;
          for (var c = 0; c < tds.length; c++) cells.push(inlineToMd(tds[c]).trim());
          rows.push('| ' + cells.join(' | ') + ' |');
          if (r === 0) rows.push('| ' + cells.map(function () { return '---'; }).join(' | ') + ' |');
        }
        if (rows.length) blocks.push(rows.join('\n'));
      } else {
        var txt = inlineToMd(n).trim();
        if (txt) blocks.push(txt);
      }
    }
    return blocks.join('\n\n');
  }

  /* ============ 状态 ============ */
  var currentName = '未打开文档';
  var dirty = false;
  var sourceMode = false;

  function toMarkdown() { return sourceMode ? (doc.innerText || '') : htmlToMd(doc); }
  function loadMarkdown(md) {
    sourceMode = false;
    doc.classList.remove('source');
    doc.innerHTML = mdToHtml(md);
  }

  function statsLine() {
    var md = toMarkdown();
    var words = (md.match(/[\u4e00-\u9fa5]/g) || []).length + (md.match(/[A-Za-z0-9_'-]+/g) || []).length;
    return md.length + ' 字符 · ' + words + ' 词';
  }

  function refreshChrome() {
    titleEl.textContent = currentName + (dirty ? ' •' : '');
    if (statsEl) statsEl.textContent = statsLine();
  }

  var saveTimer;
  function scheduleSave() {
    dirty = true;
    refreshChrome();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var md = toMarkdown();
      if (window.Android && window.Android.saveDraft) window.Android.saveDraft(md, currentName);
      try { localStorage.setItem('mt.draft', md); localStorage.setItem('mt.name', currentName); } catch (e) {}
    }, 700);
  }

  /* ============ 编辑命令 ============ */
  function exec(cmd, value) {
    doc.focus();
    try { document.execCommand(cmd, false, value || null); } catch (e) {}
    scheduleSave();
  }

  function wrapInline(tag) {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) { exec('insertHTML', '<' + tag + '>代码</' + tag + '>'); return; }
    var range = sel.getRangeAt(0);
    var el = document.createElement(tag);
    try { el.appendChild(range.extractContents()); range.insertNode(el); } catch (e) { return; }
    sel.removeAllRanges();
    var r2 = document.createRange();
    r2.selectNodeContents(el);
    sel.addRange(r2);
    scheduleSave();
  }

  function applyCommand(name) {
    switch (name) {
      case 'h1': exec('formatBlock', 'h1'); break;
      case 'h2': exec('formatBlock', 'h2'); break;
      case 'bold': exec('bold'); break;
      case 'italic': exec('italic'); break;
      case 'strike': exec('strikeThrough'); break;
      case 'inlineCode': wrapInline('code'); break;
      case 'quote': exec('formatBlock', 'blockquote'); break;
      case 'ul': exec('insertUnorderedList'); break;
      case 'ol': exec('insertOrderedList'); break;
      case 'task': exec('insertHTML', '<ul><li data-task="0">☐ 待办事项</li></ul><p><br></p>'); break;
      case 'codeBlock': exec('formatBlock', 'pre'); break;
      case 'table': exec('insertHTML', '<table><thead><tr><th>列1</th><th>列2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p><br></p>'); break;
      case 'link': { var url = prompt('链接地址', 'https://'); if (url) exec('createLink', url); break; }
      case 'image':
        if (window.Android && window.Android.pickImage) window.Android.pickImage();
        else { var u = prompt('图片地址', 'https://'); if (u) exec('insertImage', u); }
        break;
      case 'hr': exec('insertHorizontalRule'); break;
      case 'undo': exec('undo'); break;
      case 'redo': exec('redo'); break;
    }
  }

  /* ============ 菜单 / 文件动作 ============ */
  function openSheet(on) {
    if (on) { sheet.removeAttribute('hidden'); scrim.removeAttribute('hidden'); applySettings(); }
    else { sheet.setAttribute('hidden', ''); scrim.setAttribute('hidden', ''); }
  }

  function defaultName() {
    var d = new Date();
    return '未命名-' + (d.getMonth() + 1) + String(d.getDate()).padStart(2, '0') + '.md';
  }

  function doSave() {
    var name = currentName === '未打开文档' ? defaultName() : currentName;
    var md = toMarkdown();
    if (window.Android && window.Android.saveFile) window.Android.saveFile(name, md);
    else toast('浏览器预览：保存不可用');
  }

  function exportHtml() {
    var body = mdToHtml(toMarkdown());
    var css = 'body{font:16px/1.75 -apple-system,"Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:#1f2328;background:#fff;margin:28px auto;max-width:760px;padding:0 18px}' +
      'h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:.2em}pre{background:#f6f8fa;border:1px solid #e1e4e8;border-radius:8px;padding:12px;overflow:auto}' +
      'code{background:#f6f8fa;border-radius:4px;padding:.1em .3em}pre code{background:none;padding:0}' +
      'blockquote{border-left:3px solid #1a73e8;color:#555;margin:.8em 0;padding:.2em 0 .2em 1em}' +
      'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}img{max-width:100%}';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + escHtml(currentName) + '</title><style>' + css + '</style></head><body>' + body + '</body></html>';
  }

  /* ============ 事件 ============ */
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('button') : null;
    if (!b) return;

    if (b.dataset.cmd) { applyCommand(b.dataset.cmd); return; }

    switch (b.dataset.act) {
      case 'menu': openSheet(true); break;
      case 'open': openSheet(false); if (window.Android && window.Android.openFile) window.Android.openFile(); else toast('App 内可用'); break;
      case 'save': openSheet(false); doSave(); break;
      case 'saveAs': openSheet(false); currentName = '未打开文档'; doSave(); break;
      case 'share': openSheet(false); if (window.Android && window.Android.share) window.Android.share(toMarkdown()); break;
      case 'print': openSheet(false); if (window.Android && window.Android.exportPdf) window.Android.exportPdf(exportHtml(), (currentName || 'MarkText').replace(/\.md$/i, '')); else toast('浏览器模式不可用'); break;
      case 'undo': applyCommand('undo'); break;
      case 'redo': applyCommand('redo'); break;
      case 'source': {
        openSheet(false);
        var md = toMarkdown();
        sourceMode = !sourceMode;
        if (sourceMode) { doc.classList.add('source'); doc.textContent = md; }
        else { loadMarkdown(md); }
        scheduleSave();
        toast(sourceMode ? '源码视图（再点一次返回）' : '已返回排版视图');
        break;
      }
      case 'theme': S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length]; saveSettings(); applySettings(); break;
      case 'font-inc': S.fontSize = Math.min(24, S.fontSize + 1); saveSettings(); applySettings(); break;
      case 'font-dec': S.fontSize = Math.max(13, S.fontSize - 1); saveSettings(); applySettings(); break;
      case 'default': openSheet(false); if (window.Android && window.Android.openDefaultSettings) window.Android.openDefaultSettings(); else toast('请到系统设置里设为默认'); break;
    }
  });

  function wireEvents() {
    doc.addEventListener('input', scheduleSave);
    doc.addEventListener('blur', scheduleSave);
    if (scrim) scrim.addEventListener('click', function () { openSheet(false); });
    titleEl.addEventListener('click', function () {
      var n = prompt('文件名', currentName);
      if (n && n.trim()) { currentName = n.trim(); refreshChrome(); }
    });
  }

  /* ============ Android 回调 ============ */
  window.__onFileOpened = function (name, text) {
    currentName = name || '未命名.md';
    loadMarkdown(text || '');
    dirty = false;
    refreshChrome();
    document.getElementById('scroll').scrollTop = 0;
    toast('已打开 ' + currentName);
  };
  window.__onPdfSaved = function (name) { toast('已保存 PDF：' + name); };
  window.__onFileSaved = function (name) {
    if (name) currentName = name;
    dirty = false; refreshChrome();
    toast('已保存 ' + currentName);
  };
  window.__onImage = function (dataUrl, info) {
    doc.focus();
    exec('insertHTML', '<img src="' + dataUrl + '" alt="图片"><p><br></p>');
    toast(info ? '已插入图片 ' + info : '已插入图片');
  };
  window.__handleBack = function () {
    if (!sheet.hasAttribute('hidden')) { openSheet(false); return true; }
    if (sourceMode) { sourceMode = false; doc.classList.remove('source'); loadMarkdown(toMarkdown()); return true; }
    return false;
  };

  /* ============ 启动 ============ */
  (function boot() {
    doc = document.getElementById('doc');
    titleEl = document.getElementById('title');
    statsEl = document.getElementById('stats');
    sheet = document.getElementById('sheet');
    scrim = document.getElementById('scrim');

    loadSettings();
    applySettings();

    var draft = '', name = '未打开文档';
    try {
      if (window.Android && window.Android.loadDraft) {
        draft = window.Android.loadDraft() || '';
        name = window.Android.loadDraftName() || name;
      }
      if (!draft) {
        draft = localStorage.getItem('mt.draft') || '';
        name = localStorage.getItem('mt.name') || name;
      }
    } catch (e) {}

    if (draft) {
      currentName = name;
      loadMarkdown(draft);
    } else {
      doc.innerHTML = '<h1>欢迎使用 MarkText</h1>' +
        '<p>这是<strong>所见即所得</strong>编辑器：屏幕上的样子就是最终效果，保存时自动转成 Markdown。</p>' +
        '<p>点右上角 <strong>⋯</strong> 打开文件、存 PDF、换主题；工具栏可以加粗、列表、插表格。</p>' +
        '<blockquote>在文件管理器里点任意 <code>.md</code> 文件也能用它打开。</blockquote>';
      currentName = '未打开文档';
    }
    refreshChrome();
    wireEvents();
  })();
})();

/* QR Generator: no network requests, analytics, or storage of QR content. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const preview = $('preview');
  const status = $('status');
  const pngButton = $('save-png');
  const svgButton = $('save-svg');
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const types = ['link', 'text', 'wifi'];
  const MARGIN = 4; // Four-module quiet zone for reliable scanning.
  const OUTPUT_PX = 1024;
  let activeType = 'link';
  let currentQr = null;
  let currentSvg = '';
  let renderTimer;

  // Only theme preference is read/saved; QR input and passwords are never persisted.
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('theme-toggle').textContent = dark ? '☀️' : '🌙';
  }
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('theme'); } catch (_) { /* file:// may block storage */ }
  setTheme(savedTheme === 'dark' || (!savedTheme && media.matches));
  $('theme-toggle').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    setTheme(dark);
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (_) { /* optional */ }
  });
  media.addEventListener('change', event => {
    let preference = null;
    try { preference = localStorage.getItem('theme'); } catch (_) { /* optional */ }
    if (!preference) setTheme(event.matches);
  });

  function changeType(next, focusTab = false) {
    activeType = next;
    tabs.forEach(tab => {
      const chosen = tab.dataset.type === next;
      tab.setAttribute('aria-selected', String(chosen));
      tab.tabIndex = chosen ? 0 : -1;
      if (chosen && focusTab) tab.focus();
    });
    for (const type of types) $('panel-' + type).hidden = type !== next;
    generate();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => changeType(tab.dataset.type));
    tab.addEventListener('keydown', event => {
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (delta) {
        event.preventDefault();
        changeType(types[(index + delta + types.length) % types.length], true);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        changeType(event.key === 'Home' ? types[0] : types[types.length - 1], true);
      }
    });
  });

  function escapeWifi(value) {
    return value.replace(/[\\;,:\"]/g, char => '\\' + char);
  }
  function wifiPayload() {
    const ssid = $('ssid').value;
    const security = $('security').value;
    const password = $('password').value;
    if (!ssid) return {hint: 'Enter a network name.'};
    if (security !== 'nopass' && !password) return {hint: 'Enter the Wi-Fi password.'};
    const parts = ['WIFI:T:' + security, 'S:' + escapeWifi(ssid)];
    if (security !== 'nopass') parts.push('P:' + escapeWifi(password));
    if ($('hidden-network').checked) parts.push('H:true');
    return {value: parts.join(';') + ';;'};
  }
  function linkPayload() {
    const link = $('link').value.trim();
    if (!link) return {hint: 'Enter a website address.'};
    // Leave explicit schemes alone, including custom URI schemes.
    const explicitScheme = /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(link) || /^(mailto|tel|sms|geo):/i.test(link);
    return {value: explicitScheme ? link : 'https://' + link.replace(/^\/\//, '')};
  }
  function payload() {
    if (activeType === 'link') return linkPayload();
    if (activeType === 'wifi') return wifiPayload();
    return $('content').value ? {value: $('content').value} : {hint: 'Enter text to encode.'};
  }
  function clear(hint, isError = false) {
    currentQr = null;
    currentSvg = '';
    preview.replaceChildren();
    const placeholder = document.createElement('div');
    placeholder.className = 'empty';
    placeholder.textContent = hint;
    preview.append(placeholder);
    status.classList.toggle('error', isError);
    status.textContent = isError ? hint : '';
    pngButton.disabled = true;
    svgButton.disabled = true;
  }
  function makeSvg(qr) {
    const count = qr.getModuleCount();
    const size = count + MARGIN * 2;
    const path = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) path.push(`M${col + MARGIN} ${row + MARGIN}h1v1h-1z`);
      }
    }
    // Only encoder-produced integer coordinates enter SVG markup, never QR content.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${OUTPUT_PX}" height="${OUTPUT_PX}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
  }
  function generate() {
    const result = payload();
    if (!result.value) {
      clear(result.hint);
      return;
    }
    try {
      // The vendored QR matrix encoder takes 8-bit binary strings; convert
      // via TextEncoder so Chinese, emoji, and other Unicode round-trip as UTF-8.
      const bytes = new TextEncoder().encode(result.value);
      if (bytes.length > 2331) throw new Error('QR capacity exceeded');
      const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
      const qr = new window.QRMatrix(0, 0); // Auto-size, medium error correction.
      qr.addData(binary);
      qr.make();
      currentQr = qr;
      currentSvg = makeSvg(qr);
      preview.innerHTML = currentSvg;
      status.classList.remove('error');
      status.textContent = `${qr.getModuleCount()} × ${qr.getModuleCount()} modules · ${bytes.length} bytes`;
      pngButton.disabled = false;
      svgButton.disabled = false;
    } catch (error) {
      console.error('QR generation error:', error.message); // No QR input is logged.
      clear('This content is too long for one QR code. Try shortening it.', true);
    }
  }
  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(generate, 120);
  }
  ['link', 'content', 'ssid', 'password'].forEach(id => $(id).addEventListener('input', scheduleRender));
  $('security').addEventListener('change', () => {
    const open = $('security').value === 'nopass';
    $('password-field').hidden = open;
    $('password').disabled = open;
    generate();
  });
  $('hidden-network').addEventListener('change', generate);
  $('show-password').addEventListener('click', () => {
    const input = $('password');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('show-password').textContent = show ? 'Hide' : 'Show';
    $('show-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    $('show-password').setAttribute('aria-pressed', String(show));
  });

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  svgButton.addEventListener('click', () => {
    if (!currentQr) return;
    download(new Blob([currentSvg], {type: 'image/svg+xml;charset=utf-8'}), `qr-${activeType}.svg`);
  });
  pngButton.addEventListener('click', () => {
    if (!currentQr) return;
    const count = currentQr.getModuleCount();
    const total = count + MARGIN * 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = OUTPUT_PX;
    const context = canvas.getContext('2d');
    if (!context) {
      status.classList.add('error');
      status.textContent = 'PNG export is unavailable in this browser. Try SVG instead.';
      return;
    }
    context.fillStyle = '#fff';
    context.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    context.fillStyle = '#000';
    // Pixel boundaries stay aligned to avoid anti-aliasing or blurry cells.
    for (let row = 0; row < count; row++) {
      const y1 = Math.round((row + MARGIN) * OUTPUT_PX / total);
      const y2 = Math.round((row + MARGIN + 1) * OUTPUT_PX / total);
      for (let col = 0; col < count; col++) {
        if (!currentQr.isDark(row, col)) continue;
        const x1 = Math.round((col + MARGIN) * OUTPUT_PX / total);
        const x2 = Math.round((col + MARGIN + 1) * OUTPUT_PX / total);
        context.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
    }
    canvas.toBlob(blob => {
      if (blob) download(blob, `qr-${activeType}.png`);
    }, 'image/png');
  });


  // Bookmarklets transfer content via a fragment, never via an HTTP request.
  // Remove it from the visible URL/history as soon as we have parsed it.
  function loadBookmarkletData() {
    const fragment = window.location.hash;
    if (!fragment) return false;
    const params = new URLSearchParams(fragment.slice(1));
    const type = params.get('type');
    const data = params.get('data');
    if ((type !== 'link' && type !== 'text') || data === null) return false;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (_) { /* Some file:// browsers restrict history updates. */ }
    $(type === 'link' ? 'link' : 'content').value = data;
    changeType(type);
    if (type === 'text' && !data) {
      $('content').focus();
      status.textContent = 'Clipboard access was blocked. Paste your text here to generate the QR code.';
    }
    return true;
  }

  // Each bookmarklet is self-contained: it runs on the source website, then
  // opens this static generator. No external scripts or APIs are loaded.
  const bookmarkletTemplate = [
    'javascript:(function(){',
    'var action="__ACTION__",base="https://tools.fishese.cc/qr/#";',
    'function target(type,data){return base+new URLSearchParams({type:type,data:data}).toString();}',
    'function send(type,data,tab){',
      'if(!data){if(tab)tab.close();return;}',
      'var url=target(type,data);',
      'if(tab){tab.location.replace(url);}',
      'else{window.open(url,"_blank","noopener,noreferrer");}',
    '}',
    'function clipboard(){',
      'var tab=window.open("about:blank","_blank");',
      'if(tab){try{tab.opener=null;}catch(e){}}',
      'function finish(value){',
        'if(value){if(tab)send("text",value,tab);else window.location.assign(target("text",value));}',
        'else if(tab)tab.location.replace(target("text",""));',
        'else{var pasted=window.prompt("Paste clipboard text for the QR code:","");',
          'if(pasted)window.location.assign(target("text",pasted));}',
      '}',
      'try{if(navigator.clipboard&&navigator.clipboard.readText){',
        'navigator.clipboard.readText().then(finish,function(){finish("");});',
      '}else finish("");}catch(e){finish("");}',
    '}',
    'if(action==="page"){send("link",window.location.href);return;}',
    'if(action==="clipboard"){clipboard();return;}',
    'var selection=window.getSelection?String(window.getSelection()).trim():"";',
    'var answer=window.prompt("Make a QR from:\\n1 - Current page URL\\n2 - Selected text\\n3 - Clipboard text\\n\\nEnter 1, 2 or 3:",selection?"2":"1");',
    'if(answer===null)return;',
    'answer=answer.trim();',
    'if(answer==="1"){send("link",window.location.href);}',
    'else if(answer==="2"){send("text",selection||window.prompt("No text selected. Paste text here:",""));}',
    'else if(answer==="3"){clipboard();}',
    'else window.alert("Please choose 1, 2 or 3.");',
    '})()'
  ].join('');

  for (const action of ['page', 'clipboard', 'choose']) {
    const source = bookmarkletTemplate.replace('__ACTION__', action);
    const link = $('bookmarklet-' + action);
    const copy = $('copy-bookmarklet-' + action);
    link.href = source;
    // Bookmarklets should be dragged into the bookmarks bar, not clicked here.
    link.addEventListener('click', event => {
      event.preventDefault();
      $('bookmarklet-help').textContent = 'Drag the link to your bookmarks bar, or use Copy code to create a bookmark manually.';
    });
    copy.addEventListener('click', async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(source);
        copied = true;
      } catch (_) {
        // Supports local-file mode or browsers where Clipboard API is unavailable.
        const input = document.createElement('textarea');
        input.value = source;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.append(input);
        input.select();
        try { copied = document.execCommand('copy'); } catch (_) { /* optional */ }
        input.remove();
      }
      $('bookmarklet-help').textContent = copied
        ? 'Bookmarklet code copied. Add a bookmark and paste it into its URL/address field.'
        : 'Could not copy automatically. Drag the bookmarklet link into your bookmarks bar instead.';
    });
  }

  if (!loadBookmarkletData()) clear('Enter something on the left to generate a QR code.');
})();

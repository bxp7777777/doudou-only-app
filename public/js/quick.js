/* 快捷记录：右下角浮钮，一步记喝水 / 吃饭 / 心情（复用页面现有按钮，不改数据逻辑） */
(function () {
  var OPEN = false, box = null, outside = null;
  function find(act) {
    var list = document.querySelectorAll('[data-act="' + act + '"]');
    for (var i = 0; i < list.length; i++) if (list[i].offsetParent) return list[i];
    return null;
  }
  function fire(act) {
    var el = find(act);
    if (el) { el.click(); return true; }
    return false;
  }
  function close() {
    if (box) { box.remove(); box = null; }
    OPEN = false;
    if (outside) { document.removeEventListener('pointerdown', outside); outside = null; }
  }
  /* 记心情：切到「小日子」，把心情那一排滚到眼前，让人自己点一个 */
  function goMood() {
    var tab = document.querySelector('[data-act="tab"][data-tab="cycle"]');
    if (tab) tab.click();
    else window.location.hash = '#/cycle';
    setTimeout(function () {
      var m = document.querySelector('[data-act="diary-mood"]');
      if (!m) return;
      if (m.scrollIntoView) m.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var wrap = m.parentElement;
      if (wrap) {
        wrap.style.transition = 'box-shadow .3s';
        wrap.style.boxShadow = '0 0 0 3px rgba(240,160,150,.55)';
        setTimeout(function () { wrap.style.boxShadow = ''; }, 1600);
      }
      toast('点一个今天的心情就行');
    }, 420);
  }
  function open() {
    OPEN = true;
    box = document.createElement('div');
    box.id = 'quickBox';
    box.innerHTML = '<button type="button" data-q="cup">💧 喝一杯</button>'
      + '<button type="button" data-q="mood">🫧 记心情</button>'
      + '<button type="button" data-q="focus">🎯 只做一件事</button>';
    document.body.appendChild(box);
    box.addEventListener('click', function (ev) {
      var q = ev.target && ev.target.dataset ? ev.target.dataset.q : '';
      if (!q) return;
      if (q === 'cup') { fire('cup') ? close() : toast('先去首页点一次小水杯，之后这里就能一键记了'); }
      else if (q === 'mood') { close(); goMood(); }
      else if (q === 'focus') { toggleFocus(); close(); }
    });
    outside = function (ev) {
      if (box && !box.contains(ev.target) && ev.target.id !== 'quickFab') close();
    };
    setTimeout(function () { document.addEventListener('pointerdown', outside); }, 0);
  }
  function toggleFocus() {
    var on = document.body.classList.toggle('focus-mode');
    var pill = document.getElementById('focusPill');
    if (on) {
      if (!pill) {
        pill = document.createElement('button');
        pill.id = 'focusPill';
        pill.type = 'button';
        pill.textContent = '只做一件事 · 点我退出';
        pill.addEventListener('click', toggleFocus);
        document.body.appendChild(pill);
      }
      pill.style.display = 'block';
    } else if (pill) pill.style.display = 'none';
    try { localStorage.setItem('doudou_focus', on ? '1' : '0'); } catch (e) {}
  }
  function restoreFocus() {
    try { if (localStorage.getItem('doudou_focus') === '1') toggleFocus(); } catch (e) {}
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'quick-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function boot() {
    var style = document.createElement('style');
    style.textContent = '#quickFab{position:fixed;right:14px;bottom:132px;z-index:9998;width:44px;height:44px;border-radius:50%;border:1px solid #f0dcc4;background:#fffaf2;box-shadow:0 6px 16px rgba(120,80,50,.18);font-size:19px;line-height:1;cursor:pointer}'
      + '#quickBox{position:fixed;right:14px;bottom:184px;z-index:9999;display:flex;flex-direction:column;gap:8px;background:#fffdf8;border:1px solid #f3e7d8;border-radius:16px;padding:10px;box-shadow:0 10px 26px rgba(110,75,50,.2)}'
      + '#quickBox button{display:block;width:118px;text-align:left;padding:9px 11px;border-radius:11px;border:1px solid #efe2d2;background:#fff;font-size:12.5px;color:#4a382a;cursor:pointer}'
      + '.quick-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:rgba(60,45,35,.9);color:#fff;font-size:12px;padding:8px 12px;border-radius:12px;z-index:10001;max-width:80vw}';
    document.head.appendChild(style);
    var b = document.createElement('button');
    b.id = 'quickFab';
    b.type = 'button';
    b.textContent = '✍️';
    b.setAttribute('aria-label', '快捷记录');
    b.addEventListener('click', function () { OPEN ? close() : open(); });
    document.body.appendChild(b);
    restoreFocus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

/* 陪伴小应用的背景音乐：洛克王国纯音乐 + 流行曲，可点选、可关 */
(function () {
  var TRACKS = [
    ['audio/bgm_home_2.mp3', '人鱼湾（海鸥海浪）· 顾月寒'],
    ['audio/bgm_home_1.mp3', '洛克王国 · 背景一'],
    ['audio/bgm_home_3.mp3', '洛克王国 · 背景二'],
    ['audio/bgm_song_4.mp3', '慢慢喜欢你 · 莫文蔚'],
    ['audio/bgm_song_1.mp3', '妈妈说 · 余佳运'],
    ['audio/bgm_song_2.mp3', '和你 · 余佳运'],
    ['audio/bgm_song_3.mp3', '再一起 · 余佳运'],
    ['audio/bgm_song_5.mp3', '如果你也刚好抬头看树 · 孙天宇'],
    ['audio/bgm_song_6.mp3', '宿敌 · 许嵩'],
    ['audio/bgm_song_7.mp3', '一笑倾城 · 汪苏泷'],
    ['audio/bgm_song_8.mp3', '如果有来生 · 谭维维'],
    ['audio/bgm_song_9.mp3', '玻璃 · Gareth.T'],
    ['audio/bgm_song_10.mp3', '下一秒 · 张碧晨'],
    ['audio/bgm_song_11.mp3', '如果可以 · 韦礼安'],
    ['audio/bgm_song_12.mp3', '我不难过 · 孙燕姿'],
    ['audio/bgm_song_13.mp3', '刻在我心底的名字 · 卢广仲'],
    ['audio/bgm_song_14.mp3', '夏夜最后的烟火 · 颜人中'],
    ['audio/bgm_song_15.mp3', '九月底 · 余佳运'],
    ['audio/bgm_song_16.mp3', '好久不见 · 陈奕迅'],
    ['audio/bgm_song_17.mp3', '呼吸决定 · Fine乐团'],
    ['audio/bgm_song_18.mp3', '关于爱的定义 · 方大同'],
    ['audio/bgm_song_19.mp3', '想你就写信 (Live) · 周杰伦 / 李硕 / 达布希勒图 / 张鑫'],
    ['audio/bgm_song_20.mp3', '我想念 · 汪苏泷'],
    ['audio/bgm_song_21.mp3', '哪里都是你 · 队长'],
    ['audio/bgm_song_22.mp3', '多远都要在一起 · G.E.M.邓紫棋']
  ];
  var KEY = 'mini_bgm';
  function st() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  var audio = null, cur = '', timer = 0, unlocked = false;

  function vol() { var s = st(); return typeof s.vol === 'number' ? s.vol : 0.45; }
  function fade(to, ms) {
    if (!audio) return;
    clearInterval(timer);
    var from = audio.volume, t0 = Date.now(), d = ms || 400;
    timer = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / d);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) clearInterval(timer);
    }, 40);
  }
  function play(url) {
    var s = st();
    if (s.off) return;
    var src = url || s.track || TRACKS[Math.floor(Math.random() * TRACKS.length)][0];
    if (!audio) audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    if (audio.dataset.src !== src) { audio.dataset.src = src; audio.src = src; }
    cur = src;
    audio.volume = 0;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {
      if (unlocked) return;
      unlocked = true;
      var kick = function () { document.removeEventListener('pointerdown', kick); document.removeEventListener('keydown', kick); play(src); };
      document.addEventListener('pointerdown', kick, { once: true });
      document.addEventListener('keydown', kick, { once: true });
    });
    fade(vol(), 500);
  }
  function stop() { if (!audio) return; var a = audio; fade(0, 250); setTimeout(function () { try { a.pause(); } catch (e) {} }, 280); }

  function panel() {
    var el = document.getElementById('miniBgm');
    if (el) { el.remove(); return; }
    var s = st();
    var items = ['<button class="mini-bgm-row' + (s.track ? '' : ' on') + '" data-u="">🎲 随机播放</button>']
      .concat(TRACKS.map(function (t) { return '<button class="mini-bgm-row' + (s.track === t[0] ? ' on' : '') + '" data-u="' + t[0] + '">🎵 ' + t[1] + '</button>'; }))
      .join('');
    el = document.createElement('div');
    el.id = 'miniBgm';
    el.innerHTML = '<div class="mini-bgm-box"><h4>背景音乐 <button id="miniBgmX" class="mini-bgm-x" aria-label="关闭">✕</button></h4>'
      + '<div class="mini-bgm-list">' + items + '</div>'
      + '<div class="mini-bgm-foot"><label>音量 <input id="miniBgmVol" type="range" min="0" max="100" value="' + Math.round(vol() * 100) + '"></label>'
      + '<button id="miniBgmOff" class="mini-bgm-btn">' + (s.off ? '开启音乐' : '关闭音乐') + '</button></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      if (ev.target === el) { el.remove(); return; }
      if (ev.target && ev.target.id === 'miniBgmX') { el.remove(); return; }
      var u = ev.target && ev.target.dataset ? ev.target.dataset.u : null;
      if (u !== null && ev.target.classList.contains('mini-bgm-row')) {
        var o = st(); o.track = u; o.off = false; save(o); el.remove(); play(u || undefined); panel();
        return;
      }
    });
    var vol2 = el.querySelector('#miniBgmVol');
    if (vol2) vol2.addEventListener('input', function () { var o = st(); o.vol = Number(this.value) / 100; save(o); if (audio) audio.volume = vol(); });
    var off = el.querySelector('#miniBgmOff');
    if (off) off.addEventListener('click', function () {
      var o = st(); o.off = !o.off; save(o);
      if (o.off) stop(); else play(o.track || undefined);
      el.remove(); panel();
    });
  }

  function boot() {
    var style = document.createElement('style');
    style.textContent = '#miniBgmBtn{position:fixed;right:14px;bottom:78px;z-index:9999;width:44px;height:44px;border-radius:50%;border:1px solid #f0dcc4;background:#fffaf2;box-shadow:0 6px 16px rgba(120,80,50,.18);font-size:20px;line-height:1;cursor:pointer}'
      + '#miniBgm{position:fixed;inset:0;z-index:10000;background:rgba(60,45,35,.28);display:flex;align-items:center;justify-content:center;padding:18px}'
      + '.mini-bgm-box{width:min(360px,92vw);background:#fffdf8;border-radius:18px;padding:14px;box-shadow:0 16px 40px rgba(90,60,40,.22)}'
      + '.mini-bgm-box h4{margin:0 0 8px;font-size:15px;text-align:center;color:#4a382a;position:relative}'
      + '.mini-bgm-x{position:absolute;right:0;top:-4px;width:26px;height:26px;border-radius:50%;border:1px solid #efe2d2;background:#fff;font-size:13px;line-height:1;cursor:pointer;color:#8a6f52}'
      + '.mini-bgm-list{max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:6px}'
      + '.mini-bgm-row{text-align:left;padding:9px 11px;border-radius:11px;border:1px solid #efe2d2;background:#fff;font-size:12px;color:#4a382a;cursor:pointer}'
      + '.mini-bgm-row.on{border-color:#f0c05a;background:#fff8ea;font-weight:700}'
      + '.mini-bgm-foot{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:11px;color:#8a6f52}'
      + '.mini-bgm-foot input{flex:1}'
      + '.mini-bgm-btn{padding:7px 12px;border-radius:10px;border:1px solid #efe2d2;background:#fff;font-size:11.5px;cursor:pointer}';
    document.head.appendChild(style);
    var b = document.createElement('button');
    b.id = 'miniBgmBtn';
    b.type = 'button';
    b.textContent = '🎵';
    b.setAttribute('aria-label', '背景音乐');
    b.addEventListener('click', panel);
    document.body.appendChild(b);
    // 默认不自动响：第一次用就是关的，想听再点 🎵 自己挑一首
    var s0 = st();
    if (typeof s0.off !== 'boolean') { s0.off = true; save(s0); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

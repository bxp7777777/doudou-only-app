import * as date from './date.js';
import * as store from './store.js';
import * as plan from './plan.js';
import * as cycleUtil from './cycle.js';
import * as storyUtil from './story.js';
import * as jokeUtil from './joke.js';
import * as schedule from './schedule.js';
import { load as loadWeather } from './weather.js';

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

const TABS = [
  { key: 'home', icon: '🏠', label: '今陪伴' },
  { key: 'cycle', icon: '🌸', label: '小日子' },
  { key: 'story', icon: '🌙', label: '每日故事' },
  { key: 'memo', icon: '📝', label: '备忘' },
  { key: 'game', icon: '🎮', label: '养成' }
];

const state = {
  tab: 'home',
  weather: [],
  weatherStatus: 'loading',
  lastPeriod: '',
  diaryDate: '',
  diaryQuery: '',
  tomato: { running: false, remain: 25 * 60, focus: 25 * 60, done: 0, setMin: 25 }
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function todayKey() {
  return date.dateKey(new Date());
}

// 按当天日期取模选句：同一天固定，跨天轮换，长期不重样
function dayRotSeed() {
  return Number(plan.dayIndex(todayKey())) || 0;
}
function dayPick(arr, off) {
  if (!arr || !arr.length) return '';
  const s = dayRotSeed() + (off || 0);
  return arr[(((s % arr.length) + arr.length) % arr.length)];
}

/* ------------------------- 小日子的小工具 ------------------------- */

const pad2 = (n) => String(n).padStart(2, '0');
const ymdOf = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

function moodOf(key) {
  return store.MOODS.find((m) => m.key === key) || null;
}
function bodyOf(key) {
  return store.BODIES.find((b) => b.key === key) || null;
}
function moodEmoji(key) {
  const m = moodOf(key);
  return m ? m.emoji : '';
}
function moodLabel(key) {
  const m = moodOf(key);
  return m ? m.label : '';
}
function bodyEmoji(key) {
  const b = bodyOf(key);
  return b ? b.emoji : '';
}
function bodyLabel(key) {
  const b = bodyOf(key);
  return b ? b.label : '';
}

function editDay() {
  return state.diaryDate || todayKey();
}

/** 切页/点标签前先把没落地的字存掉，免得最后几个字丢了 */
function flushDiaryText() {
  const ta = document.getElementById('diary-text');
  if (!ta || typeof ta.value !== 'string') return;
  clearTimeout(diaryTimer);
  store.saveDiary((ta.dataset && ta.dataset.date) || editDay(), { text: ta.value });
}

function exportDiary() {
  const all = store.listDiary(4000).slice().reverse();
  if (!all.length) return toast('还没写过，先写两句吧');
  const lines = ['# 豆豆的小日子', ''];
  all.forEach((e) => {
    const bits = [e.date];
    if (e.mood) bits.push(moodEmoji(e.mood) + ' ' + moodLabel(e.mood));
    if (e.body) bits.push(bodyEmoji(e.body) + ' ' + bodyLabel(e.body));
    lines.push('## ' + bits.join(' · '));
    if ((e.tags || []).length) lines.push(e.tags.map((t) => '#' + t).join(' '));
    lines.push('', String(e.text || '').trim() || '（只记了心情）', '');
  });
  try {
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '豆豆的小日子.md';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
        URL.revokeObjectURL(a.href);
      } catch {
        /* 忽略 */
      }
    }, 1000);
    toast('导出啦，文件叫「豆豆的小日子.md」');
  } catch {
    toast('这个浏览器不让下载，先复制正文吧');
  }
}

function tabFromUrl(url) {
  const u = String(url || '');
  if (u.includes('/cycle/')) return 'cycle';
  if (u.includes('/story/')) return 'story';
  if (u.includes('/memo/')) return 'memo';
  if (u.includes('/settings/')) return 'settings';
  return 'home';
}

function currentTab() {
  const m = window.location.hash.match(/^#\/(\w+)/);
  const key = m ? m[1] : 'home';
  const ok = TABS.some((t) => t.key === key) || key === 'settings';
  return ok ? key : 'home';
}

/* ------------------------- 渲染 ------------------------- */

function render() {
  const now = new Date();
  const period = date.periodOfDay(now);
  state.lastPeriod = period;

  appEl.innerHTML =
    state.tab === 'home'
      ? homePage(now, period)
      : state.tab === 'cycle'
      ? cyclePage()
      : state.tab === 'story'
      ? storyPage()
      : state.tab === 'memo'
      ? memoPage()
      : settingsPage();

  tabsEl.innerHTML = TABS.map(
    (t) => `<button class="tab ${state.tab === t.key ? 'on' : ''}" data-act="tab" data-tab="${t.key}">
      <span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>
    </button>`
  ).join('');
}

function hero(title, subline) {
  return `<header class="hero">
    <h1 class="hero-hi">${esc(title)}</h1>
    <p class="hero-date">${esc(subline)}</p>
  </header>`;
}

/* ------------------------- 首页 ------------------------- */

function homePage(now, period) {
  const today = date.dateKey(now);
  const cfg = store.getCycle();
  const cycle = cycleUtil.hasParams(cfg) ? cycleUtil.analyze(cfg, today) : null;

  const modules = plan.build({
    today,
    period,
    now,
    water: store.getWater(today),
    checkin: store.getCheckin(today),
    cycle,
    weather: state.weather,
    weatherStatus: state.weatherStatus
  });

  return `<div class="wrap">
    <header class="hero hero--home">
      <div class="hero-top">
        <h1 class="hero-hi">${esc(plan.greeting(period, dayRotSeed()))}</h1>
        <button class="gear" data-act="tab" data-tab="settings" aria-label="设置">⚙️</button>
      </div>
      <div class="hero-mascots">
        <img class="hero-mascot m-pig" src="/art/pets/pig.jpg" alt="小猪" loading="lazy" onerror="this.remove()">
        <img class="hero-mascot m-dog" src="/art/pets/golden.jpg" alt="小金毛" loading="lazy" onerror="this.remove()">
      </div>
      <p class="hero-date">${esc(date.cn(today))} · ${esc(date.weekdayCN(now))} · ${esc(date.PERIOD_LABEL[period] || '')}</p>
      <p class="hero-note">${esc(homeNote(period))}</p>
    </header>
    ${modules.map(moduleHTML).join('')}
    ${moodTrendCardHTML()}
    ${milestoneCardHTML()}
    ${wishCardHTML()}
    ${extraHomeHTML(now)}
    <p class="foot">小猪和小金毛都在这儿，不催不吼，只陪你。</p>
  </div>`;
}

function moduleHTML(m) {
  const lines = (m.lines || []).map((l) => `<p class="line">${esc(l)}</p>`).join('');
  let extra = '';

  if (m.type === 'water') {
    extra = `<div class="cups">${(m.cups || [])
      .map(
        (c) => `<button class="cup ${c.done ? 'cup-on' : ''}" data-act="cup" data-index="${c.index}" aria-pressed="${c.done}">
          <span class="cup-icon">${c.done ? '🥛' : '🫗'}</span>
          <span class="cup-txt">第${c.index + 1}杯</span>
        </button>`
      )
      .join('')}</div>`;
  } else if (m.type === 'weather') {
    extra = weatherHTML(m);
  } else if (m.type === 'checklist') {
    extra = `<div class="checks">${(m.items || [])
      .map(
        (c) => `<button class="check ${c.done ? 'check-on' : ''}" data-act="check" data-id="${c.id}" aria-pressed="${c.done}">
          <span class="check-box">${c.mark}</span><span class="check-label">${esc(c.label)}</span>
        </button>`
      )
      .join('')}</div>`;
  } else if (m.type === 'story') {
    extra = `<div class="story-block">
      <p class="story-name">《${esc(m.story.title)}》</p>
      <p class="line">${esc(m.story.body)}</p>
      <p class="nn">${esc(m.nn || '今天也被两只小家伙陪着，小开心攒一点')}</p>
    </div>`;
  }

  const cta = m.cta
    ? `<button class="btn btn-mini" data-act="tab" data-tab="${tabFromUrl(m.cta.url)}">${esc(m.cta.text)}</button>`
    : '';

  return `<section class="card">
    <h2 class="card-head"><span class="card-icon">${m.icon}</span><span class="card-title">${esc(m.title)}</span></h2>
    ${m.sub ? `<p class="card-sub">${esc(m.sub)}</p>` : ''}
    ${lines}
    ${extra}
    ${cta}
  </section>`;
}

/* ------------------------- 首页补充小卡：心情趋势 / 纪念册 / 想吃清单（纯本地、不进 plan.build） ------------------------- */

function homeNote(period) {
  const NOTE = {
    morning: ['先喝半杯温水，今天也慢慢陪你', '起床先润一口温水，别急着忙起来', '早餐吃点温热的，上午更有精神', '伸个懒腰再开始，今天轻松一点', '天亮啦，小猪小金毛陪你慢慢进入状态'],
    noon: ['午饭吃热的、七分饱，别用冰饮顶', '午间慢慢吃，饭后歇十分钟', '午饭别凑合，温热七分饱最舒服', '午后补一口温水，别等渴了才喝', '中午歇一歇，下午才不容易累'],
    afternoon: ['起身活动两分钟，再喝一口水', '犯困就站起来走走，洗把脸清醒一下', '课间喝两口温水，眼睛远眺一会儿', '下午慢慢来，别把自己绷太紧', '阳光好就晒一小会儿，心情会亮一点'],
    evening: ['晚饭七分饱，吃完走两圈再回宿舍', '晚饭温热清淡些，饭后活动一小会儿', '晚上别吃太撑，舒服最重要', '收工前再补一口温水', '傍晚慢慢放松，把白天的累卸掉一点'],
    late: ['准备收工，别再刷太久', '慢慢把今天的事收尾，别熬夜硬撑', '差不多就停手，明天接着来', '手头的事先存好，早点让自己松下来', '今天已经做得够多啦，温柔收尾'],
    bedtime: ['小故事看完啦，让眼睛和心情松一松', '轻松看完今天的小故事，好心情收进口袋', '故事和笑话都看过啦，慢慢安静下来', '两只小家伙陪你乐过，现在歇一歇', '把今天的小开心收好，明天还有新的'],
    sleep: ['放下手机，好好歇一觉', '把灯调柔，让自己慢慢静下来', '不赶时间，放松躺着也是休息', '呼吸放慢，今天的事交给明天', '窝舒服一点，慢慢进入休息状态'],
    deepnight: ['不打扰你，就在旁边安静陪着', '小猪小金毛不催你，只陪着', '这么晚啦，先把手机放远一点', '安安静静待着，等你慢慢放松', '别硬撑，累了就先躺下歇着']
  };
  const arr = NOTE[period] || ['陪着你'];
  return '小猪盯吃喝，小金毛摇尾巴 · ' + dayPick(arr, 0);
}

function daysBetween(a, b) {
  const ta = new Date(a + 'T00:00:00').getTime();
  const tb = new Date(b + 'T00:00:00').getTime();
  return Math.round((tb - ta) / 86400000);
}

function moodTrendCardHTML() {
  const moodEmoji = {};
  store.MOODS.forEach((m) => { moodEmoji[m.key] = m.emoji; });
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = date.dateKey(d);
    const e = store.getDiary(key);
    const emoji = e && e.mood ? moodEmoji[e.mood] : '';
    cells.push(`<span style="display:flex;flex-direction:column;align-items:center;font-size:18px;gap:2px">${emoji || '<span style="opacity:.25">·</span>'}<i style="font-style:normal;font-size:10px;color:#9a948c">${date.weekdayCN(d).slice(-1)}</i></span>`);
  }
  return `<section class="card">
    <h2 class="card-head"><span class="card-icon">🌈</span><span class="card-title">近7天心情小记</span></h2>
    <div style="display:flex;gap:6px;justify-content:space-between;margin:8px 0">${cells.join('')}</div>
    <p class="card-sub">在「小日子」里点一下今天的心情，这里就会亮起来。</p>
  </section>`;
}

function milestoneCardHTML() {
  const today = date.dateKey(new Date());
  const list = store.getMilestones();
  const rows = list.map((m) => {
    const left = daysBetween(today, m.date);
    const status = left > 0 ? `还有 ${left} 天` : left === 0 ? '就是今天！' : '已过去';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0"><span>🎯 ${esc(m.label)}</span><span style="color:#9a948c;font-size:12px">${status}</span><button class="btn btn-mini" data-act="ms-del" data-id="${esc(m.id)}">删</button></div>`;
  }).join('');
  return `<section class="card">
    <h2 class="card-head"><span class="card-icon">📌</span><span class="card-title">重要日子 · 倒计时</span></h2>
    ${rows || '<p class="line">记一个想记住的日子（考试、见面、生日都行），小猪帮你数着。</p>'}
    <div style="margin-top:8px"><button class="btn btn-mini" data-act="ms-add">＋ 添加一个日子</button></div>
  </section>`;
}

function wishCardHTML() {
  const list = store.getWishes();
  const rows = list.map((w) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0"><span>🍡 ${esc(w.text)}</span><button class="btn btn-mini" data-act="wish-del" data-id="${esc(w.id)}">删</button></div>`).join('');
  return `<section class="card">
    <h2 class="card-head"><span class="card-icon">🍡</span><span class="card-title">想吃清单</span></h2>
    ${rows || '<p class="line">随口记下想吃的，方便时再去吃；身体不舒服时不硬吃。</p>'}
    <div style="display:flex;gap:8px;margin-top:8px"><input id="wish-input" class="wish-input" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e3ddd5;border-radius:8px;background:#fff" placeholder="记下一个想吃的…" /><button class="btn btn-mini" data-act="wish-add">＋ 记下</button></div>
  </section>`;
}

/* ------------------------- 主页陪伴增强 + 番茄钟 ------------------------- */

const HEAL_LINES = [
  '有人稳稳陪着你，慢慢来也没关系',
  '今天也认真生活了，给自己一点掌声',
  '累了就歇一会儿，不用一直绷着',
  '你不需要时刻完美，被喜欢的是真实的你',
  '把一件小事做好，今天就不算白费',
  '柔软一点也没关系，你值得被好好对待',
  '往前走就好，方向慢慢会清晰'
];
const PERSONA_TAGS = [
  { t: '细心', d: '总能留意到细节' },
  { t: '爱笑', d: '笑起来很有感染力' },
  { t: '会听人说话', d: '让人愿意讲心里话' },
  { t: '认真', d: '答应的事会放在心上' },
  { t: '慢热但专一', d: '认定了就很稳' },
  { t: '温柔', d: '说话让人放松' },
  { t: '有韧性', d: '难的时候也撑得住' }
];

function extraHomeHTML(now) {
  return [
    birthdayBlessingHTML(),
    dailySignCardHTML(),
    healLineHTML(),
    personalityTagHTML(),
    careHintHTML(),
    comfortHTML(),
    moveCardHTML(now),
    tomatoCardHTML(),
    pledgeCardHTML(now),
    foodPrefCardHTML()
  ].join('');
}

/* ---- 生日（7/15）：底层只在当天露出祝福，平时主页不显示生日内容 ---- */
const BIRTHDAY = { month: 7, day: 15 };

function isBirthday(now) {
  const t = now || new Date();
  return t.getMonth() === BIRTHDAY.month - 1 && t.getDate() === BIRTHDAY.day;
}

function birthdayBlessingHTML() {
  if (!isBirthday(new Date())) return '';
  return `<section class="card bday-card">
    <h2 class="card-head"><span class="card-icon">🎂</span><span class="card-title">专属祝福</span></h2>
    <p class="line">生日快乐呀：愿这一岁睡得香、吃得暖，被人放在心上，想要的都慢慢靠近。小猪和小金毛今天一直陪着你。</p>
  </section>`;
}

/* ---- 巨蟹座 · 每日温和提示（按日期轮换；只做陪伴提醒与小彩蛋，不预测吉凶祸福） ---- */
const SIGN_TIPS = [
  '今天多给自己一点耐心，慢一点也没关系。',
  '记得喝几口温的，先把自己照顾好。',
  '累了就歇一小会儿，别硬撑到傍晚。',
  '对自己温柔一点，你值得被好好对待。',
  '心里有事就写两笔下来，说出来会轻一些。',
  '肩颈和脚注意保暖，别对着风口久待。',
  '三餐吃热一点，肚子舒服了心情会跟着松。',
  '忙之前先坐一分钟，把今天最重要的事排前面。',
  '有点低落也没关系，先喝口水、深呼吸三下。',
  '今天不必事事满分，做完手头这件就很棒。',
  '睡前少刷一会儿，让脑子慢慢安静下来。',
  '和人相处时先顾好自己的感受，不勉强迎合。',
  '遇到小不顺别否定全部，那只是今天的一小段。',
  '今晚早点躺平，明天才有力气去做喜欢的事。'
];
const SIGN_LUCK = ['🍊', '🌟', '☁️', '🌙', '🧸', '🫧', '🌷', '🍑', '🍀', '🦋', '🧶', '🍯'];

function daySeed(now) {
  const t = now || new Date();
  return t.getFullYear() * 372 + (t.getMonth() + 1) * 31 + t.getDate();
}

function dailySignCardHTML() {
  const seed = daySeed();
  const tip = SIGN_TIPS[seed % SIGN_TIPS.length];
  const icon = SIGN_LUCK[seed % SIGN_LUCK.length];
  const luckyNo = (seed % 9) + 1;
  return `<section class="card sign-card">
    <h2 class="card-head"><span class="card-icon">♋</span><span class="card-title">巨蟹座 · 今日小提示</span></h2>
    <p class="line">${esc(tip)}</p>
    <p class="card-sub" style="margin-top:6px">今日小彩蛋 ${icon} · 小标记 ${luckyNo}</p>
  </section>`;
}

function healLineHTML() {
  const di = Math.floor(Date.now() / 86400000);
  return `<section class="card"><p style="margin:0;color:#8a8177;font-size:12px">🌱 今日一句</p><p style="margin:6px 0 0;font-size:14px;line-height:1.6">${esc(HEAL_LINES[di % HEAL_LINES.length])}</p></section>`;
}

function personalityTagHTML() {
  const di = Math.floor(Date.now() / 86400000);
  const c = PERSONA_TAGS[di % PERSONA_TAGS.length];
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🪞</span><span class="card-title">今日小标签</span></h2><p class="line">「${esc(c.t)}」——${esc(c.d)}</p></section>`;
}

function careHintHTML() {
  const recent = store.listDiary(7);
  const unwell = recent.find((e) => ['tired', 'lie', 'sick'].includes(e.body));
  if (!unwell) return '';
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🩹</span><span class="card-title">身体小提醒</span></h2><p class="line">最近状态一般：温水备好、别硬扛，累了就早点歇；不舒服持续的话，记得好好照顾自己。</p></section>`;
}

function comfortHTML() {
  const recent = store.listDiary(7);
  const low = recent.some((e) => e.mood === 'low' || e.mood === 'bad');
  if (!low) return '';
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🤍</span><span class="card-title">想抱抱你</span></h2><p class="line">这几天心情有点沉，先把今天过好就够了；喝口温水、早点睡，想说的可以记进小日子。</p></section>`;
}

function moveCardHTML(now) {
  const done = !!store.get('dd:move:' + date.dateKey(now), false);
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🚶</span><span class="card-title">今日动一动</span></h2>
  <p class="line">起身走一走、拉伸两下，出点汗人会轻快些。</p>
  <button class="btn ${done ? 'btn-mint' : 'btn-ghost'} btn-sm" data-act="moveToggle">${done ? '✓ 今天活动过了' : '点我打个卡'}</button></section>`;
}

function focusStreak() {
  const s = store.get('dd:focusStreak', { lastDate: '', streak: 0 });
  return Number(s.streak) || 0;
}

function tomatoCardHTML() {
  const t = state.tomato;
  const mm = pad2(Math.floor(t.remain / 60));
  const ss = pad2(t.remain % 60);
  const pct = Math.round((1 - t.remain / t.focus) * 100);
  const quick = [15, 20, 25, 30, 45]
    .map((m) => `<button class="tomato-quick" type="button" data-act="tomatoQuick" data-min="${m}">${m}′</button>`)
    .join('');
  return `<section class="card tomato-card">
  <h2 class="card-head"><span class="card-icon">🍅</span><span class="card-title">番茄专注钟</span></h2>
  <p id="tomato-time" class="tomato-time">${mm}:${ss}</p>
  <div class="tomato-track"><div id="tomato-bar" class="tomato-bar" style="width:${pct}%"></div></div>
  <div class="tomato-controls">
    <button class="btn ${t.running ? 'btn-ghost' : ''} btn-sm" data-act="tomatoToggle">${t.running ? '暂停' : '开始专注'}</button>
    <button class="btn btn-ghost btn-sm" data-act="tomatoReset">重置</button>
  </div>
  <div class="tomato-set">
    <span class="tomato-set-label">时长</span>
    ${quick}
    <input id="tomato-min" class="tomato-min" type="number" min="5" max="90" step="1" placeholder="自定义" />
    <button class="btn btn-mini tomato-set-apply" data-act="tomatoSetApply">应用</button>
  </div>
  <p class="card-sub" style="text-align:right;margin-top:8px">今日完成 ${t.done} 轮 · 连续专注 ${focusStreak()} 天</p>
  </section>`;
}

function tomatoTick() {
  const t = state.tomato;
  if (!t || !t.running) return;
  t.remain -= 1;
  if (t.remain <= 0) {
    t.remain = 0;
    t.running = false;
    t.done += 1;
    recordFocusRound();
    toast('一轮专注完成，起身喝口水、看看远处～');
    render();
    return;
  }
  const timeEl = document.getElementById('tomato-time');
  if (timeEl) timeEl.textContent = pad2(Math.floor(t.remain / 60)) + ':' + pad2(t.remain % 60);
  const barEl = document.getElementById('tomato-bar');
  if (barEl) barEl.style.width = Math.round((1 - t.remain / t.focus) * 100) + '%';
}

function recordFocusRound() {
  const today = todayKey();
  const s = store.get('dd:focusStreak', { lastDate: '', streak: 0 });
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (s.lastDate !== today) {
    s.streak = s.lastDate === date.dateKey(y) ? s.streak + 1 : 1;
    s.lastDate = today;
  }
  store.set('dd:focusStreak', s);
}

function pledgeCardHTML(now) {
  const day = date.dateKey(now);
  const p = store.get('dd:pledge', { date: '', text: '', done: false });
  const valid = p.date === day;
  const body = valid && p.text
    ? `<p class="line">${p.done ? '✓ 已兑现：' : ''}${esc(p.text)}</p>`
    : '<p class="line">和自己约好今天要做到的一件小事。</p>';
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🤞</span><span class="card-title">今日小约定</span></h2>
  ${body}
  <div style="display:flex;gap:8px"><input id="pledge-input" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e3ddd5;border-radius:8px;background:#fff" placeholder="如：今天练20分钟琴" />
  <button class="btn btn-mini" data-act="pledgeSave">记下</button></div>
  ${valid && p.text ? `<button class="btn btn-ghost btn-sm" data-act="pledgeDone" style="margin-top:8px">${p.done ? '已兑现 ✓' : '标记为已兑现'}</button>` : ''}
  </section>`;
}

function foodPrefCardHTML() {
  const p = store.get('dd:foodPref', { like: [], avoid: [] });
  const chip = (kind, tag) => `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px;padding:2px 8px;background:#f6f1ea;border-radius:10px;font-size:12px">${esc(tag)}<button data-act="foodDel" data-kind="${kind}" data-tag="${esc(tag)}" style="border:0;background:none;cursor:pointer;color:#b08">×</button></span>`;
  const like = (p.like || []).map((t) => chip('like', t)).join('');
  const avoid = (p.avoid || []).map((t) => chip('avoid', t)).join('');
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🍽️</span><span class="card-title">口味偏好</span></h2>
  <p class="line">爱吃：${like || '还没记'}</p>
  <p class="line">不太接受：${avoid || '还没记'}</p>
  <div style="display:flex;gap:8px;margin-top:8px">
    <input id="food-input" style="flex:1;min-width:0;padding:6px 8px;border:1px solid #e3ddd5;border-radius:8px;background:#fff" placeholder="记一个口味或食物" />
    <button class="btn btn-mini" data-act="foodAdd" data-kind="like">爱吃+</button>
    <button class="btn btn-mini" data-act="foodAdd" data-kind="avoid">忌口+</button>
  </div></section>`;
}

function weatherHTML(m) {
  if (!m.cities || !m.cities.length) return '';
  return `<div class="wx">${m.cities
    .map(
      (c) => `<div class="wx-city">
        <div class="wx-top"><span class="wx-icon">${c.icon}</span><span class="wx-name">${esc(c.name)}</span><span class="wx-note">${esc(c.note)}</span></div>
        <p class="wx-temp">${esc(c.temp)}°</p>
        <p class="wx-sub">${esc(c.text)} · 体感 ${esc(c.feels)}°</p>
        <p class="wx-sub">${esc(c.min)}° ~ ${esc(c.max)}° · 湿度 ${esc(c.humidity)}%</p>
        ${c.rain === null || c.rain === undefined ? '' : `<p class="wx-sub">降水概率 ${esc(c.rain)}%</p>`}
      </div>`
    )
    .join('')}</div>`;
}

/* ------------------------- 小日子 ------------------------- */

function cyclePage() {
  const today = date.dateKey();
  const cfg = store.getCycle();
  const has = cycleUtil.hasParams(cfg);
  const info = has ? cycleUtil.analyze(cfg, today) : null;

  const day = editDay();
  const entry = store.getDiary(day) || { text: '', mood: '', body: '', tags: [], updatedAt: 0 };
  const tags = entry.tags || [];
  const stats = store.diaryStats(today);
  const q = String(state.diaryQuery || '').trim();
  const all = store.listDiary(200);
  const hit = q
    ? all.filter(
        (e) =>
          String(e.text || '').includes(q) ||
          (e.tags || []).join(' ').includes(q) ||
          e.date.includes(q) ||
          moodLabel(e.mood).includes(q) ||
          bodyLabel(e.body).includes(q)
      )
    : all;

  const strip = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - i);
    const k = ymdOf(d);
    const written = store.hasDiary(k);
    strip.push(
      `<button class="cal-day${written ? ' cal-on' : ''}${k === day ? ' cal-cur' : ''}" data-act="diary-day" data-date="${k}" title="${k}${written ? ' 写过了' : ' 空着'}">
        <span class="cal-num">${d.getDate()}</span><span class="cal-dot">${written ? '·' : ''}</span>
      </button>`
    );
  }

  const moodsHTML = store.MOODS.map(
    (m) =>
      `<button class="mood${entry.mood === m.key ? ' mood-on' : ''}" data-act="diary-mood" data-mood="${m.key}" aria-pressed="${entry.mood === m.key}">
        <span class="mood-emo">${m.emoji}</span><span class="mood-txt">${m.label}</span>
      </button>`
  ).join('');

  const bodiesHTML = store.BODIES.map(
    (b) =>
      `<button class="mood mood-body${entry.body === b.key ? ' mood-on' : ''}" data-act="diary-body" data-body="${b.key}" aria-pressed="${entry.body === b.key}">
        <span class="mood-emo">${b.emoji}</span><span class="mood-txt">${b.label}</span>
      </button>`
  ).join('');

  const tagsHTML = store.DIARY_TAGS.map(
    (t) => `<button class="tag-chip${tags.includes(t) ? ' tag-on' : ''}" data-act="diary-tag" data-tag="${t}">${t}</button>`
  ).join('');

  const listHTML = hit.length
    ? hit.slice(0, 40).map(diaryItem).join('')
    : `<p class="hint">${q ? '没找到，换个词试试。' : '还没有写过的日子，今天就从两句开始吧。'}</p>`;

  const infoHTML = info
    ? `<section class="card">
        <h2 class="card-head"><span class="card-icon">🌸</span><span class="card-title">${esc(info.headline)}</span></h2>
        <div class="chips">${info.chips
          .map((c) => `<div class="chip"><span class="chip-v">${esc(c.value)}</span><span class="chip-l">${esc(c.label)}</span></div>`)
          .join('')}</div>
        ${info.lines.map((l) => `<p class="line">${esc(l)}</p>`).join('')}
        <p class="hint">${esc(info.reference)}</p>
      </section>`
    : `<section class="card">
        <h2 class="card-head"><span class="card-icon">🌷</span><span class="card-title">小猪帮你记小日子</span></h2>
        <p class="line">${esc(cycleUtil.ASK_TEXT)}</p>
        <p class="hint">参数没齐之前，小猪不推算任何日期，只做温柔关心。</p>
      </section>`;

  return `<div class="wrap">
    ${hero('小日子', date.cnShort(today) + ' · 想写就写，小猪都接着')}

    <section class="card">
      <h2 class="card-head"><span class="card-icon">📖</span><span class="card-title">${day === today ? '今天的小日子' : date.cnShort(day) + ' 的小日子'}</span></h2>
      <div class="cal-strip">${strip.join('')}</div>
      <p class="hint">点日期翻回去补写；没写的日子留白也好看。</p>

      <p class="diary-label">今天什么心情</p>
      <div class="mood-row">${moodsHTML}</div>

      <p class="diary-label">身体感觉</p>
      <div class="mood-row">${bodiesHTML}</div>

      <textarea class="input diary-text" id="diary-text" data-date="${day}" rows="8" maxlength="4000" placeholder="今天有什么想留住的？课上听到的一句、食堂吃到的一口、琴房里的一个下午，写给自己，也写给小猪。">${esc(entry.text || '')}</textarea>
      <div class="diary-meta"><span id="diary-count">${(entry.text || '').length}</span> 字 · <span id="diary-saved">${entry.updatedAt ? '已存好' : '边写边存'}</span></div>

      <div class="chips">${tagsHTML}</div>

      <div class="btn-row">
        <button class="btn btn-mini" data-act="diary-save">记好这一天</button>
        <button class="btn btn-ghost btn-mini" data-act="diary-del" data-date="${day}">清掉这天</button>
        <button class="btn btn-ghost btn-mini" data-act="diary-export">导出全部</button>
      </div>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">📊</span><span class="card-title">写了多少</span></h2>
      <div class="chips">
        <div class="chip"><span class="chip-v">${stats.monthDays}</span><span class="chip-l">这个月写了几天</span></div>
        <div class="chip"><span class="chip-v">${stats.streak}</span><span class="chip-l">连着写</span></div>
        <div class="chip"><span class="chip-v">${stats.total}</span><span class="chip-l">总共几天</span></div>
        <div class="chip"><span class="chip-v">${stats.chars}</span><span class="chip-l">一共多少字</span></div>
      </div>
      <p class="hint">小猪只数日子，不催更；断几天也照样接着记。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">📚</span><span class="card-title">写过的日子${all.length ? '（' + all.length + '）' : ''}</span></h2>
      <div class="row">
        <input class="input" id="diary-q" value="${esc(q)}" placeholder="搜关键词：琴、食堂、累、朋友…" enterkeyhint="search">
        <button class="btn btn-mini" data-act="diary-search">找</button>
      </div>
      ${listHTML}
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🌸</span><span class="card-title">姨妈与身体</span></h2>
      ${info
        ? `<p class="line">${esc(info.headline)}</p>
      <div class="chips">${info.chips
        .map((c) => `<div class="chip"><span class="chip-v">${esc(c.value)}</span><span class="chip-l">${esc(c.label)}</span></div>`)
        .join('')}</div>
      ${info.lines.map((l) => `<p class="line">${esc(l)}</p>`).join('')}
      <p class="hint">${esc(info.reference)}</p>`
        : `<p class="line">${esc(cycleUtil.ASK_TEXT)}</p>
      <p class="hint">参数没齐之前，小猪不推算任何日期，只做温柔关心。</p>`}

      <div class="row"><label class="row-l" for="cycle-start">最近一次姨妈第一天</label>
        <input class="input" type="date" id="cycle-start" value="${esc(cfg.lastStart || '')}" max="${today}"></div>
      <div class="row"><label class="row-l" for="cycle-len">大概隔多少天来一次</label>
        <span class="row-r"><input class="input num" type="number" id="cycle-len" min="15" max="60" value="${esc(cfg.cycleLength || 28)}"><span class="unit">天</span></span></div>
      <div class="row"><label class="row-l" for="cycle-period">一般来几天</label>
        <span class="row-r"><input class="input num" type="number" id="cycle-period" min="2" max="12" value="${esc(cfg.periodLength || 5)}"><span class="unit">天</span></span></div>
      <div class="btn-row">
        <button class="btn btn-ghost btn-mini" data-act="cycle-save">小猪记住了</button>
        <button class="btn btn-ghost btn-mini" data-act="cycle-today">今天就是第一天</button>
      </div>
      <p class="hint">不知道周期就填 28，小猪先按 28 天记；报新日期后立刻重算。</p>
    </section>
  </div>`;
}

function diaryItem(e) {
  const text = String(e.text || '').replace(/\s+/g, ' ').trim();
  const snip = text.length > 72 ? text.slice(0, 72) + '…' : text;
  const tags = e.tags || [];
  return `<article class="diary-item">
    <button class="diary-open" data-act="diary-day" data-date="${e.date}">
      <span class="diary-line1">
        <span class="diary-date">${esc(date.cnShort(e.date))}</span>
        ${e.mood ? `<span class="diary-mood">${esc(moodEmoji(e.mood))}</span>` : ''}
        ${e.body ? `<span class="diary-body">${esc(bodyEmoji(e.body))}</span>` : ''}
      </span>
      ${snip ? `<span class="diary-snippet">${esc(snip)}</span>` : '<span class="diary-snippet diary-skip">（只记了心情）</span>'}
      ${tags.length ? `<span class="diary-tags">${tags.map((t) => '#' + esc(t)).join(' ')}</span>` : ''}
    </button>
    <button class="diary-del" data-act="diary-del" data-date="${e.date}" aria-label="删掉这天">×</button>
  </article>`;
}

/* ------------------------- 小故事 ------------------------- */

function badgeCardHTML() {
  const bs = store.getBadges();
  return `<section class="card">
    <h2 class="card-head"><span class="card-icon">🏅</span><span class="card-title">陪伴小勋章</span></h2>
    <div class="badges">
      ${bs
        .map(
          (b) => `<div class="badge ${b.unlocked ? 'badge-on' : ''}">
        <span class="badge-emoji">${b.unlocked ? b.emoji : '🔒'}</span>
        <span class="badge-meta">
          <span class="badge-name">${esc(b.name)}</span>
          <span class="badge-desc">${esc(b.desc)}</span>
          <span class="badge-prog">${b.unlocked ? '已解锁 · ' : ''}${b.progress}</span>
        </span>
      </div>`
        )
        .join('')}
    </div>
  </section>`;
}

function storyPage() {
  const today = date.dateKey();
  const story = storyUtil.current(today);
  const joke = jokeUtil.current(today);
  const done = store.getStoryDone(today);

  const storyCard = done
    ? `<section class="card">
        <h2 class="card-head"><span class="card-icon">☀️</span><span class="card-title">今天这篇看完啦</span></h2>
        <p class="line">小猪和小金毛今天也陪你笑过啦，故事里的小开心先收进口袋。</p>
        <p class="line">明天还有新故事和新笑话在等你，慢慢攒成一串好心情。</p>
        <button class="btn btn-ghost" data-act="tab" data-tab="home">回到今天的陪伴</button>
      </section>`
    : `<section class="card">
        <h2 class="card-head"><span class="card-icon">☀️</span><span class="card-title">《${esc(story.title)}》</span></h2>
        <p class="line story-body">${esc(story.body)}</p>
        <div class="btn-row">
          <button class="btn" data-act="story-done">今天这篇看完啦</button>
          <button class="btn btn-ghost" data-act="story-another">换一个故事</button>
        </div>
      </section>`;

  const jokeCard = `<section class="card">
      <h2 class="card-head"><span class="card-icon">😄</span><span class="card-title">每日一笑 · 小猪和小金毛日常</span></h2>
      <p class="joke-name">《${esc(joke.title)}》</p>
      <p class="line joke-body">${esc(joke.body)}</p>
      <div class="btn-row">
        <button class="btn btn-ghost" data-act="joke-another">换一个笑话</button>
      </div>
    </section>`;

  const softCard = `<section class="card">
      <h2 class="card-head"><span class="card-icon">🌿</span><span class="card-title">日常小提醒</span></h2>
      <p class="line">忙累了就起身活动两分钟，喝几口温温水，让肩膀松一松。</p>
      <p class="line">手干补一点护手霜、嘴唇干抹润唇，把自己照顾得舒服一点。</p>
      <p class="line">笑一笑、伸个懒腰，心情轻了，做事情也更有精神。</p>
      <p class="line">久坐就换个姿势、远眺一会儿，眼睛和腰背都歇口气。</p>
    </section>`;

  const SLEEP_TIPS = [
    '把今天没做完的事先搁一搁，天塌不下来，明天再慢慢弄。',
    '灯光调柔一点，手机放远些，让眼睛和脑子慢慢慢下来。',
    '做几次长长的呼吸：吸气、停一下、再慢慢吐出去。',
    '肩膀往上提一提再松开，把白天的紧绷一点点卸掉。',
    '想到烦心事就在心里说“明天再想”，现在先顾着舒服。',
    '窝进软和的位置，听一点轻轻的声音，节奏自然会慢。',
    '不用逼自己立刻睡着，放松躺着也是在好好休息。',
    '回想今天一件小小的开心事，带着笑意慢慢安静下来。',
    '手脚如果发凉就先捂暖，暖乎乎的更容易松下来。',
    '小猪和小金毛就在旁边陪着，安安静静，一点也不催你。'
  ];
  const sleepTipCard = `<section class="card">
      <h2 class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡前小建议</span></h2>
      <p class="card-sub">不赶时间，只让自己慢慢放松</p>
      <p class="line">${esc(dayPick(SLEEP_TIPS, 0))}</p>
      <p class="line">${esc(dayPick(SLEEP_TIPS, 1))}</p>
    </section>`;

  return `<div class="wrap">${hero('每日小故事', date.cnShort(today) + ' · 小猪 ＋ 小金毛')}${storyCard}${jokeCard}${badgeCardHTML()}${softCard}${sleepTipCard}</div>`;
}

/* ------------------------- 备忘 ------------------------- */

function memoPage() {
  const list = store.getMemos();
  const left = list.filter((m) => !m.done).length;

  const rows = list
    .map((m) => {
      const d = new Date(m.at);
      const time =
        d.getMonth() + 1 + '月' + d.getDate() + '日 ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      return `<div class="memo">
        <button class="memo-left" data-act="memo-toggle" data-id="${m.id}" aria-pressed="${m.done}">
          <span class="memo-box ${m.done ? 'memo-box-on' : ''}">${m.done ? '☑' : '☐'}</span>
          <span class="memo-body">
            <span class="memo-text ${m.done ? 'memo-done' : ''}">${esc(m.text)}</span>
            <span class="memo-time">${time}</span>
          </span>
        </button>
        <button class="memo-del" data-act="memo-del" data-id="${m.id}" aria-label="删除">删</button>
      </div>`;
    })
    .join('');

  return `<div class="wrap">
    ${hero('豆豆的备忘录', '要带的东西、要问老师的事，都先记这儿')}
    <section class="card">
      <h2 class="card-head"><span class="card-icon">✏️</span><span class="card-title">写一条</span></h2>
      <textarea class="ta" id="memo-input" maxlength="200" rows="3" placeholder="比如：明天带琴谱、买松香、问老师换弦的事"></textarea>
      <button class="btn" data-act="memo-add">小猪记下来</button>
    </section>
    <section class="card">
      <h2 class="card-head"><span class="card-icon">📝</span><span class="card-title">记着的（${left} 条没勾）</span></h2>
      ${rows || '<p class="hint">还空着，想写什么都可以。</p>'}
    </section>
    <p class="foot">这些只存在这台设备里，小猪不外传。</p>
  </div>`;
}

/* ------------------------- 记事本/设置 ------------------------- */

function settingsPage() {
  const prefs = store.getPrefs();
  const cfg = store.getCycle();
  const has = cycleUtil.hasParams(cfg);
  const wd = new Date().getDay();
  const sc = syncCfg();

  const dayRows = schedule.week().map((d) => {
    const isToday = d.wd === wd;
    const known = !!d.known;
    const firstTxt = known
      ? d.first === '08:00' ? '早八' : d.first === '10:00' ? '早十' : '上午没课'
      : '未填';
    const cls = known
      ? d.first === '08:00' ? 'early' : d.first === '10:00' ? 'mid' : 'free'
      : 'unknown';
    return `<div class="sched-row${isToday ? ' sched-today' : ''}${known ? '' : ' sched-unknown'}">
      <span class="sched-day">${esc(d.name)}${isToday ? '·今天' : ''}</span>
      <select class="input sched-sel" id="sched-first-${d.wd}" data-default="${d.first}" aria-label="${esc(d.name)}上午">
        <option value=""${d.first === '' ? ' selected' : ''}>上午没课</option>
        <option value="08:00"${d.first === '08:00' ? ' selected' : ''}>早八</option>
        <option value="10:00"${d.first === '10:00' ? ' selected' : ''}>早十</option>
      </select>
      <button class="sched-aft${d.afternoon ? ' sched-aft-on' : ''}" id="sched-aft-${d.wd}" data-act="sched-aft" data-on="${d.afternoon ? '1' : '0'}" data-default="${d.afternoon ? '1' : '0'}" aria-pressed="${d.afternoon}">${d.afternoon ? '下午有课' : '下午空'}</button>
      <input class="input sched-note" id="sched-note-${d.wd}" value="${esc(d.noteRaw || '')}" maxlength="40" placeholder="备注（可选）">
      <span class="pill pill-${cls} sched-pill">${firstTxt}</span>
    </div>`;
  }).join('');

  const schedFilled = schedule.hasCustom();
  const schedCount = schedule.filledCount();

  return `<div class="wrap">
    <header class="hero">
      <div class="hero-top">
        <button class="gear" data-act="tab" data-tab="home" aria-label="返回">‹</button>
        <h1 class="hero-hi">小猪小金毛的记事本</h1>
        <span class="gear-space"></span>
      </div>
      <p class="hero-date">固定参数直接沿用，不用反复问</p>
    </header>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🎨</span><span class="card-title">背景</span></h2>
      <p class="line">默认「每日轮换」：小猪和小金毛每天换一张 Q 版背景。</p>
      <p class="hint">想钉住某一张就点它；也可以直接换下一张。</p>
      <div class="themes">${store.THEMES.map(
        (t) => `<button class="theme-chip ${t.key === prefs.theme ? 'theme-chip-on' : ''}" data-act="theme" data-key="${t.key}">${esc(t.name)}</button>`
      ).join('')}</div>
      <button class="btn btn-ghost btn-mini" data-act="shuffle">换下一张</button>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">💧</span><span class="card-title">喝水</span></h2>
      <p class="line">每天 ${esc(prefs.waterGoal)} 杯温水：${esc(prefs.cups.join(' / '))}各一杯，小口慢喝。</p>
      <p class="line">常温或温的最好，少冰、不灌猛；出门随身带瓶水，想起来就抿一口。</p>
      <p class="line">天气热、出汗多或者空气干的时候，稍微多补两口，别等口渴才喝。</p>
      <p class="line">睡前只抿两口润润嘴就好，不喝一大杯，免得夜里起夜。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡觉 · 好好放松</span></h2>
      <p class="line">不规定几点必须躺下：觉得累、眼睛酸了，就慢慢把节奏放慢。</p>
      <p class="line">放下手机、调柔灯光，做几次深呼吸，让肩膀和眉头松开。</p>
      <p class="line">脑子里事多就先搁到明天，不用今晚全想明白；放松躺着也是休息。</p>
      <p class="line">想看每日小故事或笑话就点开，和两只小家伙轻松一会儿，再安心歇着。</p>
      <p class="line">手脚凉就先捂暖，窝舒服一点，小猪小金毛在旁边安静陪着你。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🧴</span><span class="card-title">护肤 · ${esc(prefs.skin)}</span></h2>
      <p class="line">温和洁面、无香精保湿修护、物理遮挡优先，步骤越简单越稳。</p>
      <p class="line">不刷酸、不去角质、不上功效猛药；换季和经期前后加强修护、少换新品。</p>
      <p class="line">天气干燥、湿度低时，少量多次补保湿和润唇，手脸都别让它绷着。</p>
      <p class="line">天热出汗就温和清洁、及时擦干，别让汗水闷着脸；防晒靠帽子伞比叠产品省事。</p>
      <p class="line">阴雨潮湿时简单护肤为主，少叠好几层，保持清爽不闷。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🍚</span><span class="card-title">口味</span></h2>
      <p class="line">避开：</p>
      <div class="tags">${prefs.avoid.map((t) => `<span class="tag tag-warm">${esc(t)}</span>`).join('')}</div>
      <p class="line">喜欢：</p>
      <div class="tags">${prefs.like.map((t) => `<span class="tag tag-light">${esc(t)}</span>`).join('')}</div>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">📅</span><span class="card-title">课表节奏${schedFilled ? ' · 已填 ' + schedCount + '/7 天' : ' · 还没填'}</span></h2>
      ${dayRows}
      <div class="btn-row">
        <button class="btn btn-mini" data-act="sched-save">豆豆记好了</button>
        <button class="btn btn-ghost btn-mini" data-act="sched-clear">清空我的填写</button>
      </div>
      <p class="hint">${schedFilled ? '按豆豆自己填的来，改完点「豆豆记好了」；想全部重排就点清空。' : '课表由豆豆自己定：上午早八/早十/没课、下午有没有课，再加一句备注；没填的日子首页只给作息提示，不替你猜。'}</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🌷</span><span class="card-title">小日子参数</span></h2>
      <p class="line">${has ? esc(cfg.lastStart + ' · 周期 ' + cfg.cycleLength + ' 天 · 经期 ' + cfg.periodLength + ' 天') : '还没记（小猪不推算日期）'}</p>
      <button class="btn btn-mini" data-act="tab" data-tab="cycle">去改参数</button>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🔄</span><span class="card-title">跨设备同步</span></h2>
      ${sc && sc.code
        ? `<p class="line">同步码：<strong class="code">${esc(sc.code)}</strong></p>
      <p class="hint">在另一台设备输入这串码，喝水、打卡、备忘录、小日子日记和周期参数都会跟过去。</p>
      <div class="btn-row">
        <button class="btn btn-mini" data-act="sync-now">立即同步</button>
        <button class="btn btn-ghost btn-mini" data-act="sync-copy">复制同步码</button>
      </div>
      <button class="btn btn-ghost btn-mini" data-act="sync-off">断开同步</button>`
        : `<p class="line">换手机、换浏览器都不丢：生成一串同步码，另一台设备输进去就接上了。</p>
      <button class="btn" data-act="sync-new">生成同步码</button>
      <div class="row"><label class="row-l" for="sync-code">已有同步码</label>
        <input class="input" id="sync-code" maxlength="10" placeholder="例如 K7QF2M9P" autocapitalize="characters"></div>
      <button class="btn btn-ghost btn-mini" data-act="sync-connect">用这个码连接</button>
      <p class="hint">数据存在服务端 Volume 里，只认这串码；不想同步就断开，本机数据照样在。</p>`}
      <div class="row"><label class="row-l" for="sync-secret">服务端口令</label>
        <input class="input" id="sync-secret" value="${esc((sc && sc.secret) || '')}" placeholder="服务端开启口令保护时填写，没有可留空"></div>
      <button class="btn btn-ghost btn-mini" data-act="sync-secret-save">保存口令</button>
      <p class="hint">口令是服务端统一的一道保护：填写后本机生成码、拉取、保存都会带上它；游戏存档 ddgame:v1 也随这份快照一起同步。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">💾</span><span class="card-title">本地备份</span></h2>
      <p class="line">导出一份 JSON 存到本机文件；换浏览器或清缓存前先备份，需要时一键还原。</p>
      <div class="btn-row">
        <button class="btn btn-mini" data-act="backup-export">导出全部 JSON</button>
        <button class="btn btn-ghost btn-mini" data-act="backup-import">导入还原</button>
      </div>
      <p class="hint">只保存本机记录、不另传别处；导入会覆盖当前记录，建议先导出旧备份。游戏存档请在游戏设置里单独导出。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🧹</span><span class="card-title">清空记忆</span></h2>
      <p class="line">喝水和打卡只记当天，备忘录和参数长期留着。</p>
      <button class="btn btn-ghost" data-act="clear">清掉小猪记的东西</button>
    </section>

    <p class="foot">小猪和小金毛，负责盯水、盯饭、盯睡觉、盯练琴。</p>
  </div>`;
}

/* ------------------------- 交互 ------------------------- */

let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function setTab(key) {
  if (key === 'game') {
    flushDiaryText();
    window.location.href = '/game.html';
    return;
  }
  if (state.tab === 'cycle') flushDiaryText();
  state.tab = key;
  try {
    history.replaceState(null, '', '#/' + key);
  } catch {
    /* file:// 下无所谓 */
  }
  window.scrollTo(0, 0);
  render();
}

/* 日记边写边存：不重渲染，免得光标跳走 */
let diaryTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || el.id !== 'diary-text') return;
  const count = document.getElementById('diary-count');
  const hint = document.getElementById('diary-saved');
  if (count) count.textContent = String(el.value.length);
  if (hint) hint.textContent = '正在记…';
  clearTimeout(diaryTimer);
  diaryTimer = setTimeout(() => {
    store.saveDiary(el.dataset.date || todayKey(), { text: el.value });
    if (hint) hint.textContent = '已存好';
  }, 500);
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const today = todayKey();

  if (act === 'tab') return setTab(el.dataset.tab);

  if (act === 'cup') {
    const before = store.waterCount(today);
    const water = store.toggleCup(today, el.dataset.index);
    const after = water.cups.filter(Boolean).length;
    render();
    if (after > before) toast(after >= 3 ? '3杯搞定！小金毛摇尾巴～' : '喝掉这一杯啦，小猪给你记上');
    else toast('改成没喝啦，小猪改过来了');
    return;
  }

  if (act === 'check') {
    store.toggleCheck(today, el.dataset.id);
    render();
    return;
  }

  /* ---- 课表：豆豆自己填 ---- */

  if (act === 'sched-aft') {
    const on = el.dataset.on === '1';
    el.dataset.on = on ? '0' : '1';
    el.classList.toggle('sched-aft-on', !on);
    el.textContent = on ? '下午空' : '下午有课';
    return;
  }

  if (act === 'sched-save') {
    const map = {};
    [0, 1, 2, 3, 4, 5, 6].forEach((wd) => {
      const sel = document.getElementById('sched-first-' + wd);
      const aft = document.getElementById('sched-aft-' + wd);
      const note = document.getElementById('sched-note-' + wd);
      const first = sel ? String(sel.value || '') : '';
      const afternoon = !!(aft && aft.dataset && aft.dataset.on === '1');
      const n = note ? String(note.value || '').trim() : '';
      // 只有她主动改过的天才记成「我的课表」，默认占位不替她拍板
      const firstChanged = !!sel && sel.dataset && sel.dataset.default !== undefined && sel.value !== sel.dataset.default;
      const aftChanged = !!aft && aft.dataset && aft.dataset.default !== undefined && aft.dataset.on !== aft.dataset.default;
      if (firstChanged || aftChanged || n) map[wd] = { first, afternoon, note: n };
    });
    store.setSchedule(map);
    schedule.setCustom(map);
    render();
    return toast(Object.keys(map).length ? '课表记住了，之后按豆豆填的来' : '清空了填写；没填的日子首页只提示、不替你猜');
  }

  if (act === 'sched-clear') {
    store.setSchedule({});
    schedule.setCustom({});
    render();
    return toast('已清空我的填写，首页不再替你猜');
  }

  if (act === 'cycle-save') {
    const start = (document.getElementById('cycle-start') || {}).value || '';
    if (!start) return toast('先选一下最近一次的第一天呀');
    const len = Number((document.getElementById('cycle-len') || {}).value) || 28;
    const per = Number((document.getElementById('cycle-period') || {}).value) || 5;
    store.setCycle({ lastStart: start, cycleLength: len, periodLength: per });
    render();
    return toast('小猪记好了，悄悄帮你算着');
  }

  if (act === 'cycle-today') {
    const el2 = document.getElementById('cycle-start');
    if (el2) el2.value = today;
    return toast('选好啦，点「小猪记住了」保存');
  }

  /* ---- 小日子 ---- */

  if (act === 'diary-day') {
    flushDiaryText();
    state.diaryDate = el.dataset.date;
    render();
    return;
  }

  if (act === 'diary-mood') {
    flushDiaryText();
    const day2 = editDay();
    const cur = store.getDiary(day2) || {};
    store.saveDiary(day2, { mood: cur.mood === el.dataset.mood ? '' : el.dataset.mood });
    render();
    return;
  }

  if (act === 'diary-body') {
    flushDiaryText();
    const day2 = editDay();
    const cur = store.getDiary(day2) || {};
    store.saveDiary(day2, { body: cur.body === el.dataset.body ? '' : el.dataset.body });
    render();
    return;
  }

  if (act === 'diary-tag') {
    flushDiaryText();
    const day2 = editDay();
    const cur = store.getDiary(day2) || { tags: [] };
    const tags = (cur.tags || []).slice();
    const t = el.dataset.tag;
    const i = tags.indexOf(t);
    if (i >= 0) tags.splice(i, 1);
    else tags.push(t);
    store.saveDiary(day2, { tags });
    render();
    return;
  }

  if (act === 'diary-save') {
    const ta = document.getElementById('diary-text');
    const text = ta ? ta.value : '';
    store.saveDiary(editDay(), { text });
    render();
    return toast(text.trim() ? '这一天记好啦' : '空着的先给你留着');
  }

  if (act === 'diary-del') {
    if (window.confirm('把这天的小日子清掉？')) {
      store.deleteDiary(el.dataset.date || editDay());
      render();
      toast('清掉了，这天又空出来啦');
    }
    return;
  }

  if (act === 'diary-search') {
    state.diaryQuery = String((document.getElementById('diary-q') || {}).value || '');
    render();
    return;
  }

  if (act === 'diary-export') {
    return exportDiary();
  }

  if (act === 'story-done') {
    const beforeBadges = store.unlockedKeys();
    store.setStoryDone(today, true);
    store.bumpStoryDone(today);
    const afterBadges = store.unlockedKeys();
    render();
    const newOne = afterBadges.filter((k) => !beforeBadges.includes(k));
    if (newOne.length) {
      const b = store.getBadges().find((x) => x.key === newOne[0]);
      toast(`🎉 解锁勋章 ${b.emoji} ${b.name}`);
    } else {
      toast('这篇看完啦，小开心收进口袋');
    }
    return;
  }

  if (act === 'story-another') {
    store.setStoryDone(today, false);
    storyUtil.another(today);
    render();
    return;
  }

  if (act === 'joke-another') {
    const beforeBadges = store.unlockedKeys();
    jokeUtil.another(today);
    store.bumpJokeView();
    const afterBadges = store.unlockedKeys();
    render();
    const newOne = afterBadges.filter((k) => !beforeBadges.includes(k));
    if (newOne.length) {
      const b = store.getBadges().find((x) => x.key === newOne[0]);
      toast(`🎉 解锁勋章 ${b.emoji} ${b.name}`);
    }
    return;
  }

  if (act === 'memo-add') {
    const box = document.getElementById('memo-input');
    const val = box ? box.value : '';
    if (!val.trim()) return toast('先写一句再存呀');
    store.addMemo(val);
    render();
    toast('小猪帮你记好了');
    const again = document.getElementById('memo-input');
    if (again) again.focus();
    return;
  }

  if (act === 'memo-toggle') {
    store.toggleMemo(el.dataset.id);
    render();
    return;
  }

  if (act === 'memo-del') {
    if (window.confirm('删掉这条？删了就找不回来了。')) {
      store.removeMemo(el.dataset.id);
      render();
      toast('删掉啦');
    }
    return;
  }

  if (act === 'ms-add') {
    if (typeof window.prompt !== 'function') return toast('请在浏览器里添加');
    const label = window.prompt('这个日子叫什么？（如：期末考试）');
    if (label == null) return;
    const dateStr = window.prompt('日期：格式 YYYY-MM-DD（如 2026-12-31）');
    if (dateStr == null) return;
    const before = store.getMilestones().length;
    store.addMilestone(label, dateStr);
    render();
    toast(store.getMilestones().length > before ? '记好啦，小猪帮你数着日子' : '日期格式不对，要用 YYYY-MM-DD');
    return;
  }

  if (act === 'ms-del') {
    store.removeMilestone(el.dataset.id);
    render();
    return;
  }

  if (act === 'wish-add') {
    const box = document.getElementById('wish-input');
    const v = box ? box.value : '';
    if (!v.trim()) return toast('先写一句想吃的再存');
    store.addWish(v);
    render();
    toast('小猪帮你记下啦');
    return;
  }

  if (act === 'wish-del') {
    store.removeWish(el.dataset.id);
    render();
    return;
  }

  if (act === 'moveToggle') {
    const day = todayKey();
    store.set('dd:move:' + day, !store.get('dd:move:' + day, false));
    render();
    toast('活动打卡记好啦，舒服就好');
    return;
  }

  if (act === 'tomatoToggle') {
    state.tomato.running = !state.tomato.running;
    render();
    return;
  }

  if (act === 'tomatoReset') {
    state.tomato.remain = state.tomato.focus;
    state.tomato.running = false;
    render();
    return;
  }

  if (act === 'tomatoQuick') {
    const m = Number(el.dataset.min);
    if (m >= 5 && m <= 90) {
      state.tomato.setMin = m;
      state.tomato.focus = m * 60;
      state.tomato.remain = m * 60;
      state.tomato.running = false;
      store.set('dd:tomatoSet', m);
      render();
      toast(`专注时长设为 ${m} 分钟`);
    }
    return;
  }

  if (act === 'tomatoSetApply') {
    const box = document.getElementById('tomato-min');
    const m = Number(box ? box.value : NaN);
    if (!Number.isFinite(m) || m < 5 || m > 90) return toast('时长请填 5–90 分钟之间');
    const mins = Math.floor(m);
    state.tomato.setMin = mins;
    state.tomato.focus = mins * 60;
    state.tomato.remain = state.tomato.focus;
    state.tomato.running = false;
    store.set('dd:tomatoSet', mins);
    render();
    toast(`专注时长设为 ${mins} 分钟`);
    return;
  }

  if (act === 'pledgeSave') {
    const box = document.getElementById('pledge-input');
    const v = box ? box.value : '';
    if (!v.trim()) return toast('先写一句今天的小约定');
    store.set('dd:pledge', { date: todayKey(), text: v.trim().slice(0, 40), done: false });
    render();
    toast('约定记下啦，今天慢慢做到');
    return;
  }

  if (act === 'pledgeDone') {
    const p = store.get('dd:pledge', { date: '', text: '', done: false });
    store.set('dd:pledge', { ...p, done: true });
    render();
    toast('兑现啦，为你开心');
    return;
  }

  if (act === 'foodAdd') {
    const kind = el.dataset.kind === 'avoid' ? 'avoid' : 'like';
    const box = document.getElementById('food-input');
    const v = box ? box.value : '';
    if (!v.trim()) return toast('先写一个口味或食物');
    const p = store.get('dd:foodPref', { like: [], avoid: [] });
    if (!Array.isArray(p.like)) p.like = [];
    if (!Array.isArray(p.avoid)) p.avoid = [];
    const tag = v.trim().slice(0, 16);
    if (!p[kind].includes(tag)) p[kind].push(tag);
    store.set('dd:foodPref', p);
    render();
    toast('记下啦');
    return;
  }

  if (act === 'foodDel') {
    const kind = el.dataset.kind === 'avoid' ? 'avoid' : 'like';
    const p = store.get('dd:foodPref', { like: [], avoid: [] });
    p[kind] = (p[kind] || []).filter((t) => t !== el.dataset.tag);
    store.set('dd:foodPref', p);
    render();
    return;
  }

  if (act === 'theme') {
    store.setPrefs({ theme: el.dataset.key });
    applyTheme();
    render();
    return toast('换成这套背景啦');
  }

  if (act === 'shuffle') {
    const next = (artIndexFor(store.getPrefs().theme) + 1) % DUO_ARTS.length;
    store.setPrefs({ theme: 'duo-' + (next + 1) });
    applyTheme();
    render();
    return toast('换成「' + DUO_NAMES[next] + '」啦');
  }

  if (act === 'sync-new') {
    fetch('/api/sync/new', { cache: 'no-store', headers: syncHeaders() })
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.ok || !j.code) {
          if (j && j.reason === 'bad-secret') return toast('服务端要求口令，请先在下方填写服务端口令');
          return toast('服务端存储没开，检查一下 Volume');
        }
        setSyncCfg({ code: j.code, secret: (syncCfg() || {}).secret, at: 0 });
        render();
        toast('同步码生成好啦，去另一台设备输入');
      })
      .catch(() => toast('网络不太顺，等会儿再试'));
    return;
  }

  if (act === 'sync-connect') {
    const input = document.getElementById('sync-code');
    const code = String((input && input.value) || '').trim().toUpperCase();
    if (!CODE_RE.test(code)) return toast('同步码是 6–10 位字母数字，再核对一下');
    setSyncCfg({ code, secret: (syncCfg() || {}).secret, at: 0 });
    render();
    return toast('连上了，正在拉另一台的数据…');
  }

  if (act === 'sync-now') return syncNow(false);

  if (act === 'sync-copy') {
    const c = syncCfg();
    if (!c || !c.code) return toast('还没有同步码');
    const done = () => toast('同步码已复制：' + c.code);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(c.code).then(done).catch(done);
    } else {
      done();
    }
    return;
  }

  if (act === 'sync-off') {
    setSyncCfg(null);
    render();
    return toast('已断开同步，本机数据还在');
  }

  if (act === 'sync-secret-save') {
    const input = document.getElementById('sync-secret');
    const secret = String((input && input.value) || '').trim();
    const c = syncCfg() || {};
    if (c.code) setSyncCfg({ code: c.code, secret, at: c.at || 0 });
    else if (secret) setSyncCfg({ code: '', secret, at: 0 });
    else setSyncCfg(null);
    render();
    toast(secret ? '服务端口令已保存' : '已清空服务端口令');
    if (syncCfg() && syncCfg().code) scheduleSync();
    return;
  }

  if (act === 'backup-export') return exportBackup();
  if (act === 'backup-import') return importBackup();

  if (act === 'clear') {
    if (window.confirm('清掉小猪的记忆？喝水、打卡、备忘录、参数都会清空（同步码会留着）。')) {
      store.clearAll();
      applyTheme();
      render();
      toast('清干净啦，小猪重新开始记');
      if (syncCfg()) scheduleSync(); // 让云端也同步成空的，别把旧记录带回来
    }
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (t && t.id === 'memo-input' && !e.shiftKey) {
    e.preventDefault();
    const val = t.value;
    if (!val.trim()) return toast('先写一句再存呀');
    store.addMemo(val);
    render();
    toast('小猪帮你记好了');
    const again = document.getElementById('memo-input');
    if (again) again.focus();
  }
});

const DUO_ARTS = ['/art/bg-ai1.jpg', '/art/bg-ai2.jpg', '/art/bg-ai3.jpg', '/art/bg-ai4.jpg'];
const DUO_NAMES = ['贴贴', '打盹', '散步', '暖饮'];

/** 未指定就用「今天第几张」：每天自动换一张，同一天不跳 */
function dayArtIndex() {
  const t = new Date();
  const d = Math.floor(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86400000);
  return ((d % DUO_ARTS.length) + DUO_ARTS.length) % DUO_ARTS.length;
}

function artIndexFor(theme) {
  const m = String(theme || '').match(/^duo-(\d)$/);
  if (m) return (Number(m[1]) - 1 + DUO_ARTS.length) % DUO_ARTS.length;
  return dayArtIndex();
}

function applyTheme() {
  const theme = store.getPrefs().theme || 'duo';
  const duo = String(theme).indexOf('duo') === 0;
  document.body.className = duo ? 'theme-duo' : 'theme-' + theme;
  if (duo) {
    document.documentElement.style.setProperty('--bg-art', 'url("' + DUO_ARTS[artIndexFor(theme)] + '")');
  } else {
    document.documentElement.style.removeProperty('--bg-art');
  }
}

/* ------------------------- 跨设备同步 ------------------------- */

const SYNC_KEY = 'dd:sync';
const SYNC_GAME_KEY = 'ddgame:v1'; // 与 game.html 同源共享的游戏存档键
const SYNC_VALUE_MAX = 256 * 1024; // 与后端单值上限对齐
const CODE_RE = /^[A-HJ-NP-Z2-9]{6,10}$/;

function syncCfg() {
  return store.get(SYNC_KEY, null) || null;
}

function setSyncCfg(cfg) {
  store.set(SYNC_KEY, cfg);
}

/** 同步请求头：带上服务端口令（未配置时为空，后端不校验） */
function syncHeaders() {
  const c = syncCfg() || {};
  return { 'content-type': 'application/json', 'x-sync-secret': c.secret || '' };
}

function syncAllowedKey(k) {
  return (k && k.indexOf('dd:') === 0 && k !== SYNC_KEY) || k === SYNC_GAME_KEY;
}

/** 把本机 dd: 记录与游戏存档打成一份快照（同步码/口令配置本身不进去） */
function snapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!syncAllowedKey(k)) continue;
      const v = localStorage.getItem(k);
      if (typeof v === 'string' && v.length <= SYNC_VALUE_MAX) out[k] = v;
    }
  } catch {
    /* 读不到就当空的 */
  }
  return out;
}

function restore(payload) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && syncAllowedKey(k)) keys.push(k);
    }
  } catch {
    /* 忽略 */
  }
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 忽略 */
    }
  });
  Object.keys(payload || {}).forEach((k) => {
    if (!syncAllowedKey(k) || typeof payload[k] !== 'string') return;
    try {
      localStorage.setItem(k, payload[k]);
    } catch {
      /* 忽略 */
    }
  });
}

/** 本地全量备份：复用 snapshot，导出成一份 JSON 文件（只含本机 dd: 记录，不含同步码） */
function exportBackup() {
  const payload = snapshot();
  const keys = Object.keys(payload);
  if (!keys.length) return toast('现在还没有可备份的记录');
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const data = { app: 'doudou-app', kind: 'local-backup', version: 1, exportedAt: d.toISOString(), keys: keys.length, payload };
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `豆豆本地备份-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { try { a.remove(); URL.revokeObjectURL(a.href); } catch { /* 忽略 */ } }, 1000);
    toast(`已导出 ${keys.length} 项本地记录`);
  } catch {
    toast('这个浏览器不让下载，换个方式试试');
  }
}

/** 从备份 JSON 还原：先校验结构，确认后覆盖本机记录（同步码保留） */
function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data = null;
      try { data = JSON.parse(String(reader.result)); } catch { return toast('文件不是有效的 JSON'); }
      const payload = data && typeof data === 'object' && !Array.isArray(data) && data.payload && typeof data.payload === 'object' && !Array.isArray(data.payload)
        ? data.payload
        : (data && typeof data === 'object' && !Array.isArray(data) ? data : null);
      if (!payload) return toast('备份格式不对，没有可还原的记录');
      const valid = Object.keys(payload).filter((k) => syncAllowedKey(k) && typeof payload[k] === 'string');
      if (!valid.length) return toast('备份里没有本机认识的记录');
      if (!window.confirm(`将导入 ${valid.length} 项记录，并覆盖本机现有的喝水、打卡、日记、备忘、课表和游戏进度（同步码保留）。确定还原吗？`)) return;
      restore(payload);
      store.ensureDefaults();
      applyTheme();
      render();
      toast('还原完成啦');
      if (syncCfg()) scheduleSync();
    };
    reader.onerror = () => toast('读取文件失败，再试一次');
    reader.readAsText(file, 'utf-8');
  });
  input.click();
}

async function syncNow(silent) {
  const cfg = syncCfg();
  if (!cfg || !cfg.code) {
    if (!silent) toast('还没有同步码，先生成一个');
    return;
  }
  try {
    const res = await fetch('/api/sync/load?code=' + encodeURIComponent(cfg.code), { cache: 'no-store', headers: syncHeaders() });
    const json = await res.json();
    const remoteAt = json && json.ok ? Number(json.savedAt || 0) : 0;

    if (json && json.ok && remoteAt > Number(cfg.at || 0) + 500) {
      restore(json.payload);
      setSyncCfg({ code: cfg.code, secret: cfg.secret, at: remoteAt });
      store.ensureDefaults();
      applyTheme();
      render();
      if (!silent) toast('已经同步另一台设备的记录');
      return;
    }

    const savedAt = Date.now();
    const push = await fetch('/api/sync/save', {
      method: 'POST',
      headers: syncHeaders(),
      body: JSON.stringify({ code: cfg.code, payload: snapshot(), savedAt })
    });
    const out = await push.json();
    if (out && out.ok) {
      setSyncCfg({ code: cfg.code, secret: cfg.secret, at: Number(out.updatedAt || savedAt) });
      if (!silent) toast('已经同步到服务端');
    } else if (!silent) {
      const why = out && out.reason === 'bad-secret' ? '服务端要求口令，请先在下方填写服务端口令' : ((out && out.reason) || '服务不可用');
      toast('同步失败：' + why);
    }
  } catch {
    if (!silent) toast('网络不太顺，等会儿再点一次');
  }
}

let syncTimer = null;
function scheduleSync() {
  if (!syncCfg()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow(true), 3000);
}

/* ------------------------- 启动 ------------------------- */

async function init() {
  store.ensureDefaults();
  schedule.setCustom(store.getSchedule()); // 豆豆填的课表优先
  applyTheme();
  const savedMin = Number(store.get('dd:tomatoSet', 0));
  if (savedMin >= 5 && savedMin <= 90) {
    state.tomato.setMin = Math.floor(savedMin);
    state.tomato.focus = Math.floor(savedMin) * 60;
    state.tomato.remain = state.tomato.focus;
  }
  state.tab = currentTab();
  state.lastPeriod = date.periodOfDay(new Date());
  render();

  setInterval(() => {
    const p = date.periodOfDay(new Date());
    if (p !== state.lastPeriod && state.tab === 'home') render();
    state.lastPeriod = p;
  }, 60 * 1000);

  setInterval(tomatoTick, 1000);

  try {
    const w = await loadWeather();
    state.weather = w.cities;
    state.weatherStatus = w.status;
    if (state.tab === 'home') render();
  } catch {
    state.weatherStatus = 'fail';
    if (state.tab === 'home') render();
  }

  // 回到前台时重算一次（跨时段、跨天）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.tab === 'home') render();
    if (document.visibilityState === 'hidden' && syncCfg()) syncNow(true);
  });

  // 任何本地数据变化 → 延迟推一次同步
  window.addEventListener('dd:changed', (e) => {
    if (!e || !e.detail || e.detail === SYNC_KEY) return;
    scheduleSync();
  });

  if (syncCfg()) syncNow(true);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

init();
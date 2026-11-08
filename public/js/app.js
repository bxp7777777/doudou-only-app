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
  { key: 'game', icon: '🎮', label: '养成' },
  { key: 'search', icon: '🔍', label: '找一找' }
];

const state = {
  tab: 'home',
  weather: [],
  weatherStatus: 'loading',
  lastPeriod: '',
  diaryDate: '',
  diaryQuery: '',
  tomato: { running: false, remain: 25 * 60, focus: 25 * 60, done: 0, setMin: 25 },
  toolsOpen: false,
  searchQuery: ''
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
      : state.tab === 'search'
      ? searchPage()
      : settingsPage();

  if (state.tab === 'story') setTimeout(loadFortune, 60);
  tabsEl.innerHTML = TABS.map(
    (t) => `<button class="tab ${state.tab === t.key ? 'on' : ''}" data-act="tab" data-tab="${t.key}"${state.tab === t.key ? ' aria-current="page"' : ''}>
      <span class="tab-icon" aria-hidden="true">${t.icon}</span><span class="tab-label">${t.label}</span>
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

function homeSoftCardHTML() {
  return `<section class="card"><h2 class="card-head"><span class="card-icon">🌿</span><span class="card-title">日常小提醒</span></h2>
  <p class="line">忙累了就起身活动两分钟，喝几口温温水，让肩膀松一松。</p>
  <p class="line">手干补一点护手霜、嘴唇干抹润唇，把自己照顾得舒服一点。</p>
  <p class="line">笑一笑、伸个懒腰，心情轻了，做事情也更有精神。</p>
  <p class="line">久坐就换个姿势、远眺一会儿，眼睛和腰背都歇口气。</p></section>`;
}
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
      <div class="hero-buddy">
        <div class="hero-mascots">
          <img class="hero-mascot m-pig" src="/art/pets/pig.jpg" alt="小猪" loading="lazy" onerror="this.remove()">
          <img class="hero-mascot m-dog" src="/art/pets/golden.jpg" alt="小金毛" loading="lazy" onerror="this.remove()">
        </div>
        <div class="hero-quote">${healLineInner()}</div>
      </div>
      <p class="hero-date">${esc(date.cn(today))} · ${esc(date.weekdayCN(now))} · ${esc(date.PERIOD_LABEL[period] || '')}</p>
      <p class="hero-note">${esc(homeNote(period))}</p>
      ${todaySummaryHTML(today, cycle)}
    </header>
    ${homeSoftCardHTML()}${modules.map(moduleHTML).join('')}
    ${careCardsHTML(now)}
    ${toolsDrawerHTML(now)}
    <p class="foot">小猪和小金毛都在这儿，不催不吼，只陪你。</p>
  </div>`;
}

/* 首屏摘要：今天还剩哪几件，一眼看清再往下滑 */
function todaySummaryHTML(today, cycle) {
  const water = store.getWater(today);
  const cups = (water.cups || []).filter(Boolean).length;
  const chk = store.getCheckin(today) || {};
  const keys = Object.keys(chk);
  const doneChk = keys.filter((k) => chk[k]).length;
  const diary = store.getDiary(today);
  const tomato = state.tomato || { running: false, remain: 0, done: 0 };
  const chips = [];
  chips.push({ key: 'water', on: cups >= 3, text: `💧 ${cups}/3`, label: `喝水 ${cups}/3 杯` });
  if (tomato.running) chips.push({ key: 'tomato', on: tomato.remain <= 0, text: `🍅 ${Math.max(0, Math.ceil(tomato.remain / 60))} 分`, label: '番茄钟进行中' });
  else chips.push({ key: 'tomato', on: tomato.done > 0, text: `🍅 ${tomato.done > 0 ? tomato.done + ' 个' : '未开始'}`, label: '番茄钟' });
  if (keys.length) chips.push({ key: 'check', on: doneChk === keys.length, text: `📌 ${doneChk}/${keys.length}`, label: '小习惯' });
  chips.push({ key: 'diary', on: !!(diary && diary.text), text: `📖 ${diary && diary.text ? '已写' : '未写'}`, label: '小日子' });
  if (cycle) chips.push({ key: 'cycle', on: false, text: `🌸 ${cycle.daysToNext >= 0 ? cycle.daysToNext + ' 天' : '晚 ' + Math.abs(cycle.daysToNext) + ' 天'}`, label: '距下次例假' });
  const left = chips.filter((c) => !c.on && c.key !== 'cycle').length;
  return `<div class="sum-bar" role="list">
    ${chips.map((c) => `<span class="sum-chip ${c.on ? 'on' : ''}" role="listitem" title="${esc(c.label)}">${esc(c.text)}</span>`).join('')}
    <span class="sum-hint">${left ? `还有 ${left} 件没做` : '今天都做完了'}</span>
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
    <div class="ms-form">
      <input id="ms-label" class="wish-input" maxlength="24" placeholder="叫什么（如：期末考试）">
      <input id="ms-date" class="wish-input" type="date">
      <button class="btn btn-mini" data-act="ms-add">＋ 记下</button>
    </div>
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
  '千里之行，始于足下。',
  '知人者智，自知者明。',
  '上善若水。',
  '大巧若拙。',
  '少则得，多则惑。',
  '慎终如始，则无败事。',
  '知足者富。',
  '柔弱者，生之徒。',
  '祸兮福之所倚。',
  '天下难事，必作于易。',
  '学而时习之，不亦说乎。',
  '三人行，必有我师。',
  '君子和而不同。',
  '不患人之不己知。',
  '逝者如斯夫。',
  '己所不欲，勿施于人。',
  '敏于事而慎于言。',
  '见贤思齐。',
  '岁寒，然后知松柏。',
  '工欲善其事，必先利其器。',
  '人无远虑，必有近忧。',
  '吾日三省吾身。',
  '温故而知新。',
  '君子坦荡荡。',
  '知之为知之，不知为不知。',
  '朝闻道，夕死可矣。',
  '敏而好学，不耻下问。',
  '士不可以不弘毅。',
  '任重而道远。',
  '老吾老以及人之老。',
  '穷则独善其身。',
  '达则兼济天下。',
  '富贵不能淫，贫贱不能移。',
  '生于忧患，死于安乐。',
  '得道者多助。',
  '尽信书，则不如无书。',
  '尽人事，听天命。',
  '静以修身，俭以养德。',
  '非淡泊无以明志。',
  '非宁静无以致远。',
  '勿以恶小而为之。',
  '勿以善小而不为。',
  '读书百遍，其义自见。',
  '腹有诗书气自华。',
  '博观而约取。',
  '厚积而薄发。',
  '不识庐山真面目。',
  '不畏浮云遮望眼。',
  '山重水复疑无路。',
  '柳暗花明又一村。',
  '不以物喜，不以己悲。',
  '先天下之忧而忧。',
  '长风破浪会有时。',
  '天生我材必有用。',
  '莫愁前路无知己。',
  '海内存知己。',
  '何当共剪西窗烛。',
  '一蓑烟雨任平生。',
  '人生如逆旅。',
  '也无风雨也无晴。',
  '小舟从此逝，江海寄余生。',
  '行到水穷处。',
  '坐看云起时。',
  '空山新雨后。',
  '月出惊山鸟。',
  '明月松间照。',
  '清泉石上流。',
  '采菊东篱下。',
  '悠然见南山。',
  '久在樊笼里。',
  '复得返自然。',
  '盛年不重来。',
  '及时当勉励。',
  '岁月不待人。',
  '非学无以广才。',
  '非志无以成学。',
  '海纳百川。',
  '有容乃大。',
  '壁立千仞。',
  '无欲则刚。',
  '退一步海阔天空。',
  '心静自然凉。',
  '水至清则无鱼。',
  '人至察则无徒。',
  '良药苦口。',
  '忠言逆耳。',
  '良禽择木而栖。',
  '不鸣则已，一鸣惊人。',
  '路遥知马力。',
  '日久见人心。',
  '近朱者赤。',
  '出淤泥而不染。',
  '橘生淮南则为橘。',
  '物以类聚。',
  '人以群分。',
  '过犹不及。',
  '欲速则不达。',
  '小不忍则乱大谋。',
  '凡事预则立。',
  '不预则废。',
  '知己知彼。',
  '兵贵神速。',
  '上兵伐谋。',
  '不战而屈人之兵。',
  '置之死地而后生。',
  '投之亡地然后存。',
  '将在外，君命有所不受。',
  '善战者，求之于势。',
  '形人而我无形。',
  '以正合，以奇胜。',
  '天时不如地利。',
  '地利不如人和。',
  '得人心者得天下。',
  '兴，百姓苦。',
  '亡，百姓苦。',
  '文章合为时而著。',
  '铁肩担道义。',
  '妙手著文章。',
  '为天地立心。',
  '为生民立命。',
  '为往圣继绝学。',
  '为万世开太平。',
  '博学之，审问之。',
  '慎思之，明辨之。',
  '笃行之。',
  '人一能之，己百之。',
  '人十能之，己千之。',
  '诚者，天之道也。',
  '君子成人之美。',
  '不成人之恶。',
  '以责人之心责己。',
  '以恕己之心恕人。',
  '处世让一步为高。',
  '退步即进步的张本。',
  '施恩不求报。',
  '与人方便，自己方便。',
  '量大福大。',
  '家和万事兴。',
  '宁静致远。',
  '淡泊明志。',
  '一粥一饭，当思来处。',
  '半丝半缕，恒念物力。',
  '宜未雨而绸缪。',
  '毋临渴而掘井。',
  '黎明即起。',
  '洒扫庭除。',
  '读书志在圣贤。',
  '为官心存君国。',
  '守分安命。',
  '顺时听天。',
  '人在世上，心要宽。',
  '吃得亏，坐一堆。',
  '忍一时风平浪静。',
  '让三分心平气和。',
  '量大者，福亦大。',
  '心宽一寸，路宽一丈。',
  '不争，故天下莫能与之争。',
  '知足常乐。',
  '能忍自安。',
  '吃亏是福。',
  '路虽远，行则将至。',
  '事虽难，做则必成。',
  '日日行，不怕千万里。',
  '常常做，不怕千万事。',
  '水滴石穿。',
  '绳锯木断。',
  '积土成山。',
  '风雨兴焉。',
  '积水成渊。',
  '蛟龙生焉。',
  '不积跬步，无以至千里。',
  '驽马十驾，功在不舍。',
  '锲而不舍，金石可镂。',
  '心之所向，素履以往。',
  '生如逆旅，一苇以航。',
  '世界以痛吻我。',
  '我却报之以歌。',
  '天空没有痕迹。',
  '但我已飞过。',
  '生如夏花之绚烂。',
  '死如秋叶之静美。',
  '把每一个黎明当作馈赠。',
  '你要爱荒野上的风声。',
  '胜过爱贫穷和思考。',
  '谁终将声震人间。',
  '必长久深自缄默。',
  '但凡不能杀死你的。',
  '终将使你更强大。',
  '一个人知道自己为什么而活。',
  '就可以忍受任何一种生活。',
  '在自己身上，克服这个时代。',
  '对未来的真正慷慨。',
  '是把一切献给现在。',
  '在隆冬，我终于知道。',
  '我身上有一个不可战胜的夏天。',
  '重要的不是治愈。',
  '而是带着病痛活下去。',
  '生活不是你活过的样子。',
  '而是你记住的样子。',
  '希望本无所谓有。',
  '无所谓无。',
  '这正如地上的路。',
  '其实地上本没有路。',
  '走的人多了。',
  '也便成了路。',
  '时间是一切财富中最宝贵的财富。',
  '耐心是一切聪明才智的基础。',
  '我们唯一恐惧的。',
  '就是恐惧本身。',
  '真正的勇敢。',
  '是认清生活真相后依然热爱。',
  '你若困于原地。',
  '不妨先走一步。',
  '慢一点也没关系。',
  '方向对了就不算绕路。',
  '没有一种努力是白费的。',
  '它只是还没到结算的时候。',
  '今天做不完的。',
  '就留给明天。',
  '天塌不下来。',
  '慢一点也没关系，路不会跑掉。',
  '今天能做完一件，就已经很好。',
  '手边放杯温水，想起就喝一口。',
  '累了就让肩膀沉下去，不必端着。',
  '可以什么都不做，坐着发一会儿呆也很好。',
  '如果今天很难，就先只过今天。',
  '不想说话的时候，安静也是可以的。',
  '想哭就哭，眼睛会自己好起来。',
  '睡不着的夜里，躺着也是在休息。',
  '冷了就加件衣服，不用和天气讲道理。',
  '吃饭慢慢吃，胃会舒服些。',
  '今天的太阳晒到哪儿，就暖到哪儿。',
  '手机可以先放远一点，世界不会因此走掉。',
  '需要人陪的时候，说一声就好。',
  '不想解释的时候，不解释也没关系。',
  '困了就睡，身体比你更清楚。',
  '起身的时候扶一下桌沿，慢半拍不丢人。',
  '有水的地方就多待一会儿。',
  '风吹过来的时候，可以停一停。',
  '不想笑就不笑，脸不用一直撑着。',
  '把窗帘拉开，光会自己进来。',
  '一块糖、一杯热水，都是正当的安慰。',
  '心里的结可以慢慢解，不急着今天。',
  '走到一半累了，就坐下来看看天。',
  '错了也没关系，人不是一次就学会的。',
  '今天不想联系谁，就先不联系。',
  '难受的时候，先照顾身体，再讲道理。',
  '把想说的话写下来，写给谁都行。',
  '有些事明天再想，也一样来得及。',
  '被夸的时候，可以大大方方收下。',
  '做得不够好的部分，也会被时间收走。',
  '不用每件事都做到满分，及格也算完成。',
  '喜欢的东西不必解释理由。',
  '一个人吃饭，也要好好摆一下碗。',
  '洗个热水澡，多站一会儿，水会替你放松。',
  '天冷了，袜子和热水袋都值得。',
  '想休息的时候就休息，不用等到熬不住。',
  '你的好，不需要被谁认证。',
  '想见谁就去见，别等有空。',
  '今天只做喜欢的事，也不算浪费。',
  '心里发紧的时候，试着慢慢呼气。',
  '把要做的事分成很小的步，走一步算一步。',
  '有人愿意听你说话，这件事本身就很好。',
  '不喜欢的人和事，可以离远一点。',
  '不用把自己塞进别人的时间表里。',
  '想哭的夜里，把枕头抱紧一点。',
  '答应别人的事太多时，可以先放过自己。',
  '你不需要一直很坚强，松下来也是可以的。',
  '事情没按计划走，也常常有别的路。',
  '把手边的水喝完，再去做下一件事。',
  '眼睛累了，就让它们看看远处。',
  '坐太久了，站起来走两步，哪怕只是走到窗边。',
  '今天如果没有力气，就先照顾基本的那几样。',
  '头发乱一点也没关系。',
  '衣服舒服最重要，好看是附赠的。',
  '有人不喜欢你，不代表你不好。',
  '不必急着变得更好，现在的你已经很努力。',
  '允许自己有一天什么都不想。',
  '心里乱的时候，可以把桌面收一收。',
  '写得慢、做得慢，都不耽误到达。',
  '有情绪的时候，先别做决定。',
  '想安静一会儿，就把门轻轻关上。',
  '你可以只回一句“我看到了”。',
  '天气不好，也可以把一天过好。',
  '饿了就吃，不必等到饭点。',
  '实在累了，就把今天的事挪到明天。',
  '不用把每句话都接住，沉默也是回应。',
  '今天不想努力，就当作在充电。',
  '把自己裹进被子里，也是一种照顾。',
  '一个人待着不孤单，那是自己的时间。',
  '难受的时候，热的东西比道理管用。',
  '委屈可以说出来，不必自己消化。',
  '你值得被人好好对待，包括被自己。',
  '睡前把灯调暗，让一天慢慢收尾。',
  '想被抱一下，就去找那只小狗。',
  '想法乱飞的时候，先把它们写在纸上。',
  '不想参加的局，可以不去。',
  '眼泪不丢人，它是身体在帮忙。',
  '今天没做成的事，明天还在那儿等你。',
  '不必把所有责任都接过来。',
  '需要帮助的时候，开口是勇敢。',
  '别人的情绪，不必都由你负责。',
  '你已经扛了很多，可以放下一些。',
  '疲惫的时候，允许自己效率低一点。',
  '想退缩的时候，先休息，再决定。',
  '听一点喜欢的歌，让屋子有点声音。',
  '把今天的小开心记一句，日子会有痕。',
  '手冷了，就搓一搓，或者握住一杯热的。',
  '难过不必立刻好起来。',
  '可以一边难过，一边把饭吃完。',
  '生活里的小事，做完一件就有一件的踏实。',
  '不完美的一天，也值得被好好结束。',
  '你不必每天都进步。',
  '觉得撑不住的时候，靠一靠也可以。',
  '想说话的时候，我在这儿。',
  '想一个人待着的时候，我也在这儿。',
  '可以慢，可以停，可以绕路。',
  '有些难受会自己过去，不用你赶它。',
  '把肩膀放松，呼吸会顺一点。',
  '累的时候，不用还笑着。',
  '今天的你，就是今天的你，够了。',
  '不必和谁比较，各自的节奏不一样。',
  '身边有热水、有软的东西，就先靠着。',
  '说出来会轻一点，不说也尊重你。',
  '需要被理解的时候，找一个愿意听的人。',
  '睡不着就听一会儿安静的声音。',
  '把明天要做的事，只写一件。',
  '今天的光很淡，也还是光。',
  '难受的时候，可以把手放在心口，慢慢呼吸。',
  '你不是麻烦，你是需要被照顾的人。',
  '休息不是奖励，是必需。',
  '想放弃的念头来了，先陪它坐一会儿。',
  '有些答案要等，不必今天就有。',
  '别人走得快，你可以按自己的速度。',
  '把窗户开一条缝，让房间换一口新鲜的空气。',
  '困了就先睡，剩下的事明早再说。',
  '不迁怒，不贰过。',
  '君子求诸己。',
  '小人求诸人。',
  '德不孤，必有邻。',
  '言必信，行必果。',
  '与朋友交，言而有信。',
  '过而不改，是谓过矣。',
  '学而不思则罔。',
  '思而不学则殆。',
  '知之者不如好之者。',
  '好之者不如乐之者。',
  '不愤不启，不悱不发。',
  '举一隅不以三隅反。',
  '质胜文则野。',
  '文胜质则史。',
  '文质彬彬，然后君子。',
  '君子周而不比。',
  '小人比而不周。',
  '君子喻于义。',
  '小人喻于利。',
  '见义不为，无勇也。',
  '德之不修，学之不讲。',
  '闻义不能徙，不善不能改。',
  '是吾忧也。',
  '三人行，必有我师焉。',
  '择其善者而从之。',
  '其不善者而改之。',
  '多闻阙疑。',
  '慎言其余。',
  '多见阙殆。',
  '慎行其余。',
  '禄在其中矣。',
  '不降其志，不辱其身。',
  '邦有道，则仕。',
  '邦无道，则可卷而怀之。',
  '老者安之，朋友信之，少者怀之。',
  '君子欲讷于言。',
  '而敏于行。',
  '无友不如己者。',
  '过则勿惮改。',
  '父母在，不远游。',
  '游必有方。',
  '事父母几谏。',
  '见志不从。',
  '又敬不违。',
  '劳而不怨。',
  '君子有三戒。',
  '少之时，血气未定。',
  '戒之在色。',
  '及其壮也。',
  '血气方刚，戒之在斗。',
  '及其老也，血气既衰。',
  '戒之在得。',
  '君子有三畏。',
  '畏天命，畏大人。',
  '畏圣人之言。',
  '生而知之者上也。',
  '学而知之者次也。',
  '困而学之，又其次也。',
  '困而不学，民斯为下矣。',
  '不患寡而患不均。',
  '不患贫而患不安。',
  '既来之，则安之。',
  '远人不服，则修文德以来之。',
  '天下有道，则礼乐征伐自天子出。',
  '天下无道，则礼乐征伐自诸侯出。',
  '君子不以言举人。',
  '不以人废言。',
  '小人之过也必文。',
  '君子之过也，如日月之食焉。',
  '过也，人皆见之。',
  '更也，人皆仰之。',
  '不知命，无以为君子。',
  '不知礼，无以立也。',
  '不知言，无以知人也。',
  '穷不失义，达不离道。',
  '得志，泽加于民。',
  '不得志，修身见于世。',
  '穷则独善其身，达则兼善天下。',
  '大人者，不失其赤子之心。',
  '爱人者，人恒爱之。',
  '敬人者，人恒敬之。',
  '君子以仁存心。',
  '以礼存心。',
  '仁者爱人。',
  '有礼者敬人。',
  '仰不愧于天。',
  '俯不怍于人。',
  '君子有三乐。',
  '父母俱存，兄弟无故。',
  '仰不愧于天，俯不怍于人。',
  '得天下英才而教育之。',
  '人皆可以为尧舜。',
  '道在迩而求诸远。',
  '事在易而求诸难。',
  '人人亲其亲，长其长。',
  '天下平。',
  '老吾老，以及人之老。',
  '幼吾幼，以及人之幼。',
  '天下可运于掌。',
  '以力服人者，非心服也。',
  '以德服人者，中心悦而诚服也。',
  '得道者多助，失道者寡助。',
  '寡助之至，亲戚畔之。',
  '多助之至，天下顺之。',
  '君子深造之以道。',
  '欲其自得之也。',
  '自得之，则居之安。',
  '居之安，则资之深。',
  '资之深，则取之左右逢其原。',
  '博学而详说之。',
  '将以反说约也。',
  '有为者辟若掘井。',
  '掘井九轫而不及泉。',
  '犹为弃井也。',
  '夫志，气之帅也。',
  '气，体之充也。',
  '持其志，无暴其气。',
  '我善养吾浩然之气。',
  '其为气也，至大至刚。',
  '以直养而无害。',
  '则塞于天地之间。',
  '心之官则思。',
  '思则得之，不思则不得也。',
  '先立乎其大者。',
  '则其小者弗能夺也。',
  '人之相识，贵在相知。',
  '人之相知，贵在知心。',
  '以文常会友。',
  '唯德自成邻。',
  '君子交绝，不出恶声。',
  '忠臣去国，不洁其名。',
  '上交不谄，下交不渎。',
  '君子之交淡如水。',
  '小人之交甘如醴。',
  '君子淡以亲。',
  '小人甘以绝。',
  '彼无故以合者。',
  '则无故以离。',
  '不能容人者无亲。',
  '无亲者尽人。',
  '便宜不可占尽。',
  '聪明不可用尽。',
  '凡事留一线。',
  '日后好相见。',
  '话不可说尽。',
  '事不可做绝。',
  '用心计较般般错。',
  '退步思量事事宽。',
  '常将有日思无日。',
  '莫待无时思有时。',
  '由俭入奢易。',
  '由奢入俭难。',
  '积善之家，必有余庆。',
  '积不善之家，必有余殃。',
  '一善染心，万劫不朽。',
  '千灯一盏，万古不灭。',
  '见善则迁。',
  '有过则改。',
  '修身齐家治国平天下。',
  '格物致知。',
  '诚意正心。',
  '知止而后有定。',
  '定而后能静。'
];;;;;
const PERSONA_TAGS = [
  { t: '细心', d: '总能留意到细节' },
  { t: '爱笑', d: '笑起来很有感染力' },
  { t: '会听人说话', d: '让人愿意讲心里话' },
  { t: '认真', d: '答应的事会放在心上' },
  { t: '慢热但专一', d: '认定了就很稳' },
  { t: '温柔', d: '说话让人放松' },
  { t: '有韧性', d: '难的时候也撑得住' },
  { t: '口是心非', d: '嘴上说没事，其实很在意' },
  { t: '护短', d: '自己人受了委屈会替人出头' },
  { t: '会记住小事', d: '别人随口说的话也记着' },
  { t: '安静', d: '不吵不闹，但一直在' },
  { t: '爱较真', d: '喜欢的东西会钻到底' }
];

/* 「关心型」小卡：只在真的需要时才出现，不进抽屉 */
function backupCardHTML() {
  return '<section class="card"><h2 class="card-head"><span class="card-icon">🗂️</span><span class="card-title">备份与恢复</span></h2>'
    + '<p class="card-sub">导出成一份文件存好；换手机、清缓存前先导一次。</p>'
    + '<div class="btn-row"><button class="btn" type="button" data-act="backup-export">导出备份</button>'
    + '<button class="btn btn-ghost" type="button" data-act="backup-import">从文件恢复</button></div></section>';
}

function careCardsHTML(now) {
  return [birthdayBlessingHTML(), careHintHTML(), comfortHTML()].join('');
}

/* 其余附加小卡收进一张折叠抽屉：首页只留当段时间的主信息 */
function toolsDrawerHTML(now) {
  const body = [
    moodTrendCardHTML(),
    milestoneCardHTML(),
    wishCardHTML(),
    moveCardHTML(now),
    tomatoCardHTML(),
    pledgeCardHTML(now),
    foodPrefCardHTML(),
    backupCardHTML()
  ].join('');
  return `<section class="card tools-card">
    <details id="tools-drawer" ${state.toolsOpen ? 'open' : ''}>
      <summary class="tools-sum">
        <span class="card-icon" aria-hidden="true">🧰</span>
        <span class="card-title">更多小工具</span>
        <span class="tools-count">心情 · 日子 · 番茄</span>
        <span class="tools-chevron" aria-hidden="true">▾</span>
      </summary>
      <div class="tools-body">${body}</div>
    </details>
  </section>`;
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
const NOT_TODAY = [
  '今天不必回完所有消息。',
  '今天不必把每一件事都做完。',
  '今天不必笑着应付不想理的人。',
  '今天不必解释自己的选择。',
  '今天不必为休息找理由。',
  '今天不必和谁比进度。',
  '今天不必硬着头皮应下不情愿的事。',
  '今天不必把话说得漂亮。',
  '今天不必追着别人的情绪跑。',
  '今天不必马上回电话。',
  '今天不必今天就想明白。',
  '今天不必把房间收拾干净。',
  '今天不必每条朋友圈都看。',
  '今天不必保持体面。',
  '今天不必吃不想吃的东西。',
  '今天不必等一个人回复。',
  '今天不必证明自己很努力。',
  '今天不必回那句让你不舒服的话。',
  '今天不必计划明天。',
  '今天不必把情绪说清楚。',
  '今天不必出席不想去的场合。',
  '今天不必假装没事。',
  '今天不必一直在线。',
  '今天不必做到最好。',
  '今天不必把每件事都做好。',
  '今天不必回应所有期待。',
  '今天不必完美地开场。',
  '今天不必把情绪收得很整齐。',
  '今天不必替别人做决定。',
  '今天不必强撑着陪聊。',
  '今天不必把话说圆。',
  '今天不必今天就有答案。',
  '今天不必一一解释。',
  '今天不必把计划全部执行。',
  '今天不必笑着点头。',
  '今天不必把疲惫藏好。',
  '今天不必参加不想去的饭局。',
  '今天不必对谁都随和。',
  '今天不必马上振作。',
  '今天不必追进度。',
  '今天不必和人比勤快。',
  '今天不必把自己排在最后。',
  '今天不必接住别人的坏情绪。',
  '今天不必留在不舒服的对话里。',
  '今天不必假装感兴趣。',
  '今天不必回复每条评论。',
  '今天不必把家收拾到位。',
  '今天不必做完所有家务。',
  '今天不必解释为什么迟到。',
  '今天不必解释为什么拒绝。',
  '今天不必勉强吃撑。',
  '今天不必硬着头皮应酬。',
  '今天不必向谁汇报心情。',
  '今天不必保持高效率。',
  '今天不必做得比昨天多。',
  '今天不必照别人的时间表。',
  '今天不必把小事放大。',
  '今天不必一个人扛。',
  '今天不必今天就道歉。',
  '今天不必现在就原谅。',
  '今天不必主动找话题。',
  '今天不必在群里发言。',
  '今天不必把话说得动听。',
  '今天不必对冒犯保持礼貌。',
  '今天不必体面。',
  '今天不必看起来很好。',
  '今天不必懂事。',
  '今天不必先顾别人。',
  '今天不必把难过打包藏起来。',
  '今天不必假装无所谓。',
  '今天不必表现得从容。',
  '今天不必一个人消化。',
  '今天不必把消息回得很快。',
  '今天不必事事周到。',
  '今天不必先道歉。',
  '今天不必把自己说得很差。',
  '今天不必替谁圆场。',
  '今天不必在所有群里都在。',
  '今天不必让自己被所有人喜欢。',
  '今天不必温顺。',
  '今天不必把兴趣让别人评价。',
  '今天不必今天就做出成绩。',
  '今天不必把时间填满。',
  '今天不必感到内疚。',
  '今天不必为拒绝找理由。',
  '今天不必今天就懂事。',
  '今天不必替未来担忧。',
  '今天不必把生活过得漂亮。',
  '今天不必迎合。',
  '今天不必压抑食欲。',
  '今天不必勉强睡着。',
  '今天不必逼自己想开。',
  '今天不必立刻放下。',
  '今天不必强颜欢笑。',
  '今天不必维持人设。',
  '今天不必对所有人开放。',
  '今天不必报备行程。',
  '今天不必解释自己的作息。',
  '今天不必把喜欢藏起来。',
  '今天不必答应所有请求。',
  '今天不必因为休息而愧疚。',
  '今天不必把眼泪忍回去。',
  '今天不必今天就整理清楚。',
  '今天不必跟自己较劲。',
  '今天不必把日程排满。',
  '今天不必看着别人发光就着急。',
  '今天不必勉强合群。',
  '今天不必在意外人的评价。',
  '今天不必回应冷言冷语。',
  '今天不必把伤口展示给人看。',
  '今天不必今天就被理解。',
  '今天不必把所有关系维护好。',
  '今天不必做那个懂事的人。',
  '今天不必时刻在线。',
  '今天不必把今天过得很有意义。',
  '今天不必强行开心。',
  '今天不必对任何人交代。',
  '今天不必先想别人的难处。',
  '今天不必把话说得周全。',
  '今天不必跟不喜欢的人寒暄。',
  '今天不必把疲惫说得轻描淡写。',
  '今天不必替别人的选择负责。',
  '今天不必把标准定得那么高。',
  '今天不必逼自己社交。',
  '今天不必回应每一个请求。',
  '今天不必一次说完所有话。',
  '今天不必证明自己。',
  '今天不必把小事记很久。',
  '今天不必把每段关系都留住。',
  '今天不必努力被看见。',
  '今天不必对坏消息秒回。',
  '今天不必把今天用完。',
  '今天不必解释为什么想独处。',
  '今天不必跟着别人的速度。',
  '今天不必把日子过得有成果。',
  '今天不必立刻变好。',
  '今天不必对过去交代。',
  '今天不必迎合气氛。',
  '今天不必把话说满。',
  '今天不必马上就懂事。',
  '今天不必假装不难过。',
  '今天不必配合谁的情绪。',
  '今天不必把生活安排妥帖。',
  '今天不必一个人撑着。',
  '今天不必把失败藏起来。',
  '今天不必着急证明努力。',
  '今天不必把疲惫忍住。',
  '今天不必去比较。',
  '今天不必勉强回应热情。',
  '今天不必立刻做决定。',
  '今天不必把今天填满。',
  '今天不必被期待推着走。',
  '今天不必解释沉默。',
  '今天不必把每件事都回应。',
  '今天不必先顾别人的方便。',
  '今天不必向谁交代自己的选择。',
  '今天不必把生活过得像答卷。',
  '今天不必对无关的人微笑。',
  '今天不必把难过折算成道理。',
  '今天不必陪着谁演。',
  '今天不必把情绪收好再说话。',
  '今天不必今天就把自己修好。',
  '今天不必对自己要求严格。',
  '今天不必成为谁的依靠。',
  '今天不必把今天过成一百分。',
  '今天不必看起来有精神。',
  '今天不必迎合谁的标准。',
  '今天不必把关系看得比身体重。',
  '今天不必今天就想通。',
  '今天不必把所有事排进日程。',
  '今天不必对冷落解释。',
  '今天不必压抑想哭的冲动。',
  '今天不必立刻回复关心。',
  '今天不必假装自己不累。',
  '今天不必把想说的话过滤三遍。',
  '今天不必对讨厌的事礼貌。',
  '今天不必在饭桌上谈工作。',
  '今天不必把私人时间让出去。',
  '今天不必维持成熟的形象。',
  '今天不必在一句话里解释清楚自己。',
  '今天不必迎合别人的时间。',
  '今天不必对昨天后悔。',
  '今天不必把今天熬完。',
  '今天不必对谁保持耐心。',
  '今天不必把难过压下去。',
  '今天不必独自承担。',
  '今天不必把计划补回来。',
  '今天不必做完 “应该”的事。',
  '今天不必把心情说成没事。',
  '今天不必回应那句刺人的话。',
  '今天不必把生活过成别人的期待。',
  '今天不必假装听得懂。',
  '今天不必答应所有好意。',
  '今天不必强打精神。',
  '今天不必把话说得滴水不漏。',
  '今天不必今天就想明白人生。',
  '今天不必把责任全揽在身上。',
  '今天不必对被冷落作出反应。',
  '今天不必把糟心事讲成笑话。',
  '今天不必替沉默道歉。'
];;
const SIGN_TIPS = [
  '今日宜：早一点关灯。',
  '今日忌：硬扛。',
  '今日宜：把水杯放在手边。',
  '今日忌：逼自己笑。',
  '今日宜：穿宽松的衣服。',
  '今日忌：熬夜看完那部剧。',
  '今日宜：晒十分钟太阳。',
  '今日忌：一次做三件事。',
  '今日宜：慢慢吃一顿热的。',
  '今日忌：替所有人负责。',
  '今日宜：让屋子换一口新鲜空气。',
  '今日忌：饿着肚子开会。',
  '今日宜：听一首老歌。',
  '今日忌：把话憋回去。',
  '今日宜：走一段没有目的的路。',
  '今日忌：跟不舒服的人多聊。',
  '今日宜：只挑一件做完就收工。',
  '今日忌：把一天排得太满。',
  '今日宜：把明天要穿的衣服摆好。',
  '今日忌：在人前解释自己。',
  '今日宜：早半小时上床。',
  '今日忌：为了显得合群去赴约。',
  '今日宜：给在意的人发一句话。',
  '今日忌：把手机带上床。',
  '今日宜：只收拾眼前这一小块。',
  '今日忌：空腹喝浓茶。',
  '今日宜：换个姿势坐着。',
  '今日忌：冷着不添衣。',
  '今日宜：看一眼远处的树。',
  '今日忌：用别人的标准量自己。',
  '今日宜：把手机调成静音。',
  '今日忌：把难听的话放在心上。',
  '今日宜：喝一口温水再继续。',
  '今日忌：困了还靠咖啡撑。',
  '今日宜：洗一个久一点的热水澡。',
  '今日忌：一个人消化所有情绪。',
  '今日宜：晒晒被子，晚上会更好睡。',
  '今日忌：一口气收完整个房间。',
  '今日宜：在楼下站一会儿。',
  '今日忌：盯着屏幕到眼睛发酸。',
  '今日宜：把要说的话说短。',
  '今日忌：把“不”咽回去。',
  '今日宜：承认今天有点累。',
  '今日忌：替别人的情绪买单。',
  '今日宜：答应自己早点休息。',
  '今日忌：在深夜做决定。',
  '今日宜：把计划砍掉一半。',
  '今日忌：把旧事翻出来算账。',
  '今日宜：摸摸小狗的头。',
  '今日忌：为了让谁满意而勉强。',
  '今日宜：把鞋换成舒服的那双。',
  '今日忌：错过一顿饭。',
  '今日宜：看一眼窗外的天。',
  '今日忌：把自己排在最后。',
  '今日宜：吃饱了再说别的。',
  '今日忌：用忙来证明自己有用。',
  '今日宜：把委屈写下来。',
  '今日忌：在饿的时候谈事。',
  '今日宜：允许自己发会儿呆。',
  '今日忌：把委屈讲成笑话。',
  '今日宜：把闹钟往前拨十分钟。',
  '今日忌：为了体面硬撑。',
  '今日宜：在阳台上深呼吸。',
  '今日忌：喝完最后一口冷掉的咖啡。',
  '今日宜：把待办划掉两件。',
  '今日忌：在风口站着说话。',
  '今日宜：多吃一口青菜。',
  '今日忌：把伞借给自己以外的人。',
  '今日宜：把喜欢的杯子找出来用。',
  '今日忌：看太多别人的生活。',
  '今日宜：给自己倒一杯热的。',
  '今日忌：用“应该”要求自己。',
  '今日宜：听听雨声。',
  '今日忌：在情绪里下判断。',
  '今日宜：把房间灯调暗一点。',
  '今日忌：把休息当成奖励。',
  '今日宜：跟熟人打个招呼。',
  '今日忌：一个人扛完整场。',
  '今日宜：早一点结束今天。',
  '今日忌：在夜里反复复盘。',
  '今日宜：把没回的消息放到明天。',
  '今日忌：假装没事。',
  '今日宜：蹲下来歇三十秒。',
  '今日忌：赶在最后一秒起床。',
  '今日宜：转转脖子，别一直低着。',
  '今日忌：把窗帘一直拉着。',
  '今日宜：午饭后走一走。',
  '今日忌：用小屏幕撑一整天。',
  '今日宜：把湿头发吹干再睡。',
  '今日忌：憋着不上厕所。',
  '今日宜：拿一件外套放到门边。',
  '今日忌：拿身体换进度。',
  '今日宜：看一张旧照片。',
  '今日忌：在饭桌上谈工作。',
  '今日宜：把想做的事写一行。',
  '今日忌：把难过压到看不见。',
  '今日宜：给花浇点水。',
  '今日忌：靠糖撑过下午。',
  '今日宜：把桌子上的杂物推远。',
  '今日忌：把话说满。',
  '今日宜：安静地坐五分钟。',
  '今日忌：在累的时候逞强。',
  '今日宜：笑一笑。',
  '今日忌：一口气爬很多层楼。',
  '今日宜：吃点水果。',
  '今日忌：跟昨天的自己算旧账。',
  '今日宜：把腿伸直。',
  '今日忌：把关心说成指责。',
  '今日宜：揉一揉手腕。',
  '今日忌：在别人的节奏里跑。',
  '今日宜：想睡就睡。',
  '今日忌：把想哭忍回去。',
  '今日宜：把音乐放小一点。',
  '今日忌：洗完头不吹就睡。',
  '今日宜：在纸上写下三件小确幸。',
  '今日忌：把小事攒成大事。',
  '今日宜：这杯水喝完再起身。',
  '今日忌：对最亲的人没耐心。',
  '今日宜：跟自己说一句“够了”。',
  '今日忌：连轴转到忘记喝水。',
  '今日宜：把今天要做的事写在纸上。',
  '今日忌：在小事上消耗自己。',
  '今日宜：给自己留一点空白时间。',
  '今日忌：为了省时间跳过吃饭。',
  '今日宜：出门走一小段路。',
  '今日忌：用忙碌挡住感受。',
  '今日宜：吃点带叶子的菜。',
  '今日忌：在睡前处理工作。',
  '今日宜：洗完澡早点睡。',
  '今日忌：把话忍到心里发酵。',
  '今日宜：把手边的水喝完。',
  '今日忌：一个人硬撑到底。',
  '今日宜：给绿植浇水。',
  '今日忌：在朋友圈比较生活。',
  '今日宜：听听风声。',
  '今日忌：为了面子多喝一杯。',
  '今日宜：把脚泡热。',
  '今日忌：把手机带进卫生间刷半小时。',
  '今日宜：把头抬起来看看天。',
  '今日忌：在情绪上头时回消息。',
  '今日宜：坐得离屏幕远一点。',
  '今日忌：把重复的事做到完美。',
  '今日宜：吃一颗糖。',
  '今日忌：替别人着急。',
  '今日宜：把加湿器打开。',
  '今日忌：在光线暗的地方看手机。',
  '今日宜：揉一揉后颈。',
  '今日忌：靠抱怨撑一整天。',
  '今日宜：用喜欢的杯子喝水。',
  '今日忌：把不舒服说成还行。',
  '今日宜：整理一下抽屉。',
  '今日忌：空腹出门。',
  '今日宜：把音量调低两格。',
  '今日忌：在会议里憋着不上厕所。',
  '今日宜：给朋友回一句晚安。',
  '今日忌：独自把复杂的事想完。',
  '今日宜：把袜子换成厚的。',
  '今日忌：把关心变成说教。',
  '今日宜：今天早点收工。',
  '今日忌：为了显得专业不休息。',
  '今日宜：在椅子上靠十分钟。',
  '今日忌：把今天没做的事想三遍。',
  '今日宜：把未读消息清一小块。',
  '今日忌：在饭点排队生气。',
  '今日宜：吃热的早餐。',
  '今日忌：把委屈攒进被子里。',
  '今日宜：走过一片有树的地方。',
  '今日忌：拿别人的错误惩罚自己。',
  '今日宜：把喜欢的外套穿上。',
  '今日忌：在深夜下单。',
  '今日宜：洗一个不长不短的澡。',
  '今日忌：一口气爬很多级台阶。',
  '今日宜：把窗户擦亮。',
  '今日忌：把咖啡当水喝。',
  '今日宜：把昨天没睡够的补回来。',
  '今日忌：在争吵里证明对错。',
  '今日宜：安静听别人把话说完。',
  '今日忌：用“好的”答应不情愿的请求。',
  '今日宜：给自己一个明确的休息时间。',
  '今日忌：把沉默当解决问题。',
  '今日宜：把待办按轻重排一次。',
  '今日忌：在疲惫时开车。',
  '今日宜：写一句今天想记住的事。',
  '今日忌：把心事说给不在意的人。',
  '今日宜：把手上的事收个尾。',
  '今日忌：为了合群熬夜。',
  '今日宜：跟心里的人打个招呼。',
  '今日忌：吃凉掉的晚饭。',
  '今日宜：喝一杯带温度的水。',
  '今日忌：把手机放在枕边。',
  '今日宜：在楼下坐一会儿。',
  '今日忌：在阳台吹很久的风。',
  '今日宜：把书翻开一页就好。',
  '今日忌：把今天和别人的高光对比。',
  '今日宜：摸摸自己的头。',
  '今日忌：忘了喝水。',
  '今日宜：今天的账明天再算。',
  '今日忌：把想说的关心压成沉默。',
  '今日宜：把眼睛闭上一分钟。',
  '今日忌：在最后十分钟赶完所有事。'
];;;;;
const SIGN_LUCK = ['🍊', '🌟', '☁️', '🌙', '🧸', '🫧', '🌷', '🍑', '🍀', '🦋', '🧶', '🍯'];

function daySeed(now) {
  const t = now || new Date();
  return t.getFullYear() * 372 + (t.getMonth() + 1) * 31 + t.getDate();
}

const FORTUNE_SIGN = 'cancer';
function fortuneLead(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  const m = s.match(/^[^。！？]{8,}[。！？]/);
  const lead = m ? m[0] : s;
  return lead.length > 64 ? lead.slice(0, 62) + '…' : lead;
}
function clipText(s, n) {
  const t = String(s || '').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
}
async function loadFortune() {
  const el = document.getElementById('signFortune');
  const extra = document.getElementById('signFortuneExtra');
  if (!el) return;
  try {
    const r = await fetch('/api/horoscope?sign=' + FORTUNE_SIGN, { headers: { Accept: 'application/json' } });
    const d = await r.json();
    if (!d || !d.ok || !d.summary) throw new Error('empty');
    el.textContent = fortuneLead(d.summary);
    if (el.dataset) el.dataset.state = 'ok';
    if (extra) {
      const aspects = [];
      if (d.love) aspects.push('感情 ' + clipText(d.love, 18));
      if (d.work) aspects.push('工作 ' + clipText(d.work, 18));
      if (d.money) aspects.push('钱 ' + clipText(d.money, 18));
      const luck = [];
      if (d.luckyColor) luck.push('幸运色 ' + d.luckyColor);
      if (d.luckyNumber) luck.push('幸运数 ' + d.luckyNumber);
      if (d.nobleSign) luck.push('贵人 ' + d.nobleSign);
      extra.innerHTML =
        (aspects.length ? '<p class="sign-aspects">' + esc(aspects.join('　')) + '</p>' : '') +
        (luck.length ? '<div class="sign-pills">' + luck.map((x) => '<span class="sign-pill">' + esc(x) + '</span>').join('') + '</div>' : '');
      extra.hidden = !extra.innerHTML;
    }
  } catch (e) {
    el.textContent = '今天不预测运气，只提醒一句：慢一点也没关系。';
    if (el.dataset) el.dataset.state = 'fallback';
    if (extra) { extra.innerHTML = ''; extra.hidden = true; }
  }
}
function dailySignCardHTML() {
  const seed = daySeed();
  const tip = SIGN_TIPS[seed % SIGN_TIPS.length];
  const notIdx = (seed * 7 + 3) % NOT_TODAY.length;
  return `<section class="card sign-card">
    <h2 class="card-head"><span class="card-icon">♋</span><span class="card-title">巨蟹座 · 今日小提示</span></h2>
    <p class="line">${esc(tip)}</p>
    <p class="line sign-fortune" id="signFortune" data-state="loading">今日运势加载中……</p>
    <div class="sign-extra" id="signFortuneExtra" hidden></div>
    <p class="line sign-not">今天不必：${esc(NOT_TODAY[notIdx]).replace(/^今天不必/, '')}</p>
  </section>`;
}

const HEAL_NEXT_KEY = 'doudou_heal_next';
function healIndex() {
  const di = Math.floor(Date.now() / 86400000);
  let off = 0;
  try {
    const raw = JSON.parse(localStorage.getItem(HEAL_NEXT_KEY) || '{}');
    off = raw.day === di ? Number(raw.n) || 0 : 0;
  } catch (e) { off = 0; }
  return ((di + off) % HEAL_LINES.length + HEAL_LINES.length) % HEAL_LINES.length;
}
function healLineInner() {
  return '<p class="hq-label">🌱 今日一句<button type="button" class="hq-next" data-act="heal-next" aria-label="换一句">换一句</button></p><p class="hq-body">' + esc(HEAL_LINES[healIndex()]) + '</p>';
}
function nextHeal() {
  const di = Math.floor(Date.now() / 86400000);
  let off = 0;
  try { const raw = JSON.parse(localStorage.getItem(HEAL_NEXT_KEY) || '{}'); off = raw.day === di ? Number(raw.n) || 0 : 0; } catch (e) {}
  try { localStorage.setItem(HEAL_NEXT_KEY, JSON.stringify({ day: di, n: off + 1 })); } catch (e) {}
  const body = document.querySelector('.hero-quote .hq-body');
  if (body) body.textContent = HEAL_LINES[healIndex()];
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
      <h2 class="card-head"><span class="card-icon">🌸</span><span class="card-title">例假与身体</span>${info ? `<span class="sum-chip">${esc(date.cnShort(info.nextKey))} · ${info.daysToNext >= 0 ? '还有 ' + info.daysToNext + ' 天' : '晚了 ' + Math.abs(info.daysToNext) + ' 天'}</span>` : ''}</h2>
      ${info
        ? `<p class="line">${esc(info.headline)}</p>
      <div class="chips">${info.chips
        .map((c) => `<div class="chip"><span class="chip-v">${esc(c.value)}</span><span class="chip-l">${esc(c.label)}</span></div>`)
        .join('')}</div>
      ${info.lines.map((l) => `<p class="line">${esc(l)}</p>`).join('')}
      <p class="hint">${esc(info.reference)}</p>`
        : `<p class="line">${esc(cycleUtil.ASK_TEXT)}</p>
      <p class="hint">参数没齐之前，小猪不推算任何日期，只做温柔关心。</p>`}

      <div class="row"><label class="row-l" for="cycle-start">最近一次例假第一天</label>
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
    '小猪和小金毛就在旁边陪着，安安静静，一点也不催你。',
    '睡前把明天的水杯和要带的东西先放好，早上会轻省一点。',
    '今天没做完的清单，写下来就交给明天，别在脑子里过夜。',
    '肩膀绕两圈，脖子慢慢转一转，坐一天的僵会松一些。',
    '觉得心里堵，就把那句话写在备忘录里，写完就放下。',
    '被子里先把手脚焐暖，人暖了困意才来得快。',
    '如果今天很难，就先谢谢自己撑到了这会儿。',
    '声音调到最小，雨声似的白噪比寂静更好入睡。',
    '明早要练琴的话，睡前把手霜涂好，指甲也顺手修一修。'
  ];
  const sleepTipCard = `<section class="card">
      <h2 class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡前小建议</span></h2>
      <p class="card-sub">不赶时间，只让自己慢慢放松</p>
      <p class="line">${esc(dayPick(SLEEP_TIPS, 0))}</p>
      <p class="line">${esc(dayPick(SLEEP_TIPS, 1))}</p>
    </section>`;

  return `<div class="wrap">${hero('每日小故事', date.cnShort(today) + ' · 小猪 ＋ 小金毛')}${personalityTagHTML()}${dailySignCardHTML()}${sleepTipCard}${storyCard}${jokeCard}${badgeCardHTML()}</div>`;
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

function searchResultsHTML(q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return '<p class="hint">输入一个词：小日子、备忘、想吃清单、重要日子会一起找出来。</p>';
  const hit = (s) => String(s === null || s === undefined ? '' : s).toLowerCase().indexOf(needle) >= 0;
  const groups = [];

  const diary = store
    .listDiary(4000)
    .filter((e) => hit(e.text) || hit(e.date) || (e.tags || []).some(hit) || hit(moodLabel(e.mood)) || hit(bodyLabel(e.body)));
  if (diary.length) {
    groups.push({
      emoji: '🌸',
      name: '小日子',
      rows: diary.slice(0, 30).map((e) => ({
        text: String(e.text || '').trim() || '（这天只记了心情）',
        meta: [e.date, moodLabel(e.mood), bodyLabel(e.body), (e.tags || []).map((t) => '#' + t).join(' ')]
          .filter(Boolean)
          .join(' · '),
        act: 'search-diary',
        date: e.date
      }))
    });
  }

  const memos = store.getMemos().filter((m) => hit(m.text));
  if (memos.length) {
    groups.push({
      emoji: '📝',
      name: '备忘',
      rows: memos.slice(0, 30).map((m) => ({ text: m.text, meta: m.done ? '已完成' : '待办', act: 'search-memo' }))
    });
  }

  const wishes = store.getWishes().filter((w) => hit(w.text));
  if (wishes.length) {
    groups.push({ emoji: '🍡', name: '想吃清单', rows: wishes.slice(0, 30).map((w) => ({ text: w.text, meta: '想吃', act: 'search-home' })) });
  }

  const miles = store.getMilestones().filter((m) => hit(m.label) || hit(m.date));
  if (miles.length) {
    const today = todayKey();
    groups.push({
      emoji: '📌',
      name: '重要日子',
      rows: miles.slice(0, 30).map((m) => {
        const left = daysBetween(today, m.date);
        return {
          text: m.label,
          meta: m.date + (left > 0 ? ' · 还有 ' + left + ' 天' : left === 0 ? ' · 就是今天' : ''),
          act: 'search-home'
        };
      })
    });
  }

  if (!groups.length) return '<p class="hint">没找到「' + esc(q) + '」。换个词试试，或者先在小日子/备忘里记一句。</p>';

  return groups
    .map(
      (g) => `<div class="search-group">
      <p class="search-group-name">${g.emoji} ${esc(g.name)} · ${g.rows.length}</p>
      ${g.rows
        .map(
          (r) => `<button class="search-row" data-act="${r.act}"${r.date ? ' data-date="' + esc(r.date) + '"' : ''}>
        <span class="search-text">${esc(r.text.length > 90 ? r.text.slice(0, 90) + '…' : r.text)}</span>
        <span class="search-meta">${esc(r.meta)}</span>
      </button>`
        )
        .join('')}
    </div>`
    )
    .join('');
}

function searchPage() {
  const q = state.searchQuery || '';
  return `<div class="wrap">
    ${hero('找一找', '小日子 / 备忘 / 想吃 / 重要日子，一次搜完')}
    <section class="card">
      <div class="row">
        <input class="input" id="global-q" value="${esc(q)}" placeholder="搜关键词：琴、食堂、生日、蛋糕…" enterkeyhint="search" autocomplete="off">
      </div>
      <div id="search-results">${searchResultsHTML(q)}</div>
    </section>
  </div>`;
}

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
      <div class="divider-dots">✦</div>
      <p class="line">夜间模式</p>
      <p class="hint">默认跟随手机：白天浅色、晚上暗色；也可以固定一种。</p>
      <div class="themes">${['auto', 'light', 'dark'].map(
        (m) => `<button class="theme-chip ${prefs.dark === m ? 'theme-chip-on' : ''}" data-act="dark" data-mode="${m}">${ { auto: '跟随系统', light: '浅色', dark: '暗色' }[m] }</button>`
      ).join('')}</div>
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
  if (typeof el.setAttribute === 'function' && !(el.getAttribute && el.getAttribute('role'))) {
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
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
let searchTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el) return;
  if (el.id === 'global-q') {
    state.searchQuery = el.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const box = document.getElementById('search-results');
      if (box) box.innerHTML = searchResultsHTML(el.value);
    }, 140);
    return;
  }
  if (el.id !== 'diary-text') return;
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

  if (act === 'search-diary') {
    state.diaryDate = el.dataset.date || todayKey();
    setTab('cycle');
    return;
  }
  if (act === 'search-memo') return setTab('memo');
  if (act === 'search-home') return setTab('home');

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
    const labelBox = document.getElementById('ms-label');
    const dateBox = document.getElementById('ms-date');
    const label = String((labelBox && labelBox.value) || '').trim();
    const dateStr = String((dateBox && dateBox.value) || '').trim();
    if (!label) return toast('先写一下这个日子叫什么呀');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return toast('先选一下日期呀');
    const before = store.getMilestones().length;
    store.addMilestone(label, dateStr);
    render();
    toast(store.getMilestones().length > before ? '记好啦，小猪帮你数着日子' : '这条好像重复了，看看列表里是不是已经有了');
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

  if (act === 'dark') {
    const mode = el.dataset.mode === 'light' || el.dataset.mode === 'dark' ? el.dataset.mode : 'auto';
    store.setPrefs({ dark: mode });
    applyTheme();
    render();
    return toast({ auto: '夜间模式跟随手机', light: '一直用浅色', dark: '一直用暗色' }[mode]);
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
        syncNow(true); // 先把本机数据推上去，另一台输码才有东西可接
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
    toast('连上了，正在拉另一台的数据…');
    // 生成码/连接码本身不会触发 dd:changed，这里必须主动拉一次
    return syncNow(false);
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

  if (act === 'heal-next') return nextHeal();
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

/* 折叠抽屉：重新渲染时保持展开状态 */
document.addEventListener(
  'toggle',
  (e) => {
    const t = e.target;
    if (t && t.id === 'tools-drawer') state.toolsOpen = !!t.open;
  },
  true
);

const DUO_ARTS = ['/art/bg-ai1.jpg', '/art/bg-ai2.jpg', '/art/bg-ai3.jpg', '/art/bg-ai4.jpg'];
const DUO_NAMES = ['贴贴', '打盹', '散步', '暖饮'];

/** 未指定就用「今天第几张」：每天自动换一张，同一天不跳 */
function dayArtIndex() {
  const t = new Date();
  const d = Math.floor(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86400000);
  return ((d % DUO_ARTS.length) + DUO_ARTS.length) % DUO_ARTS.length;
}

try {
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => {
      if ((store.getPrefs().dark || 'auto') === 'auto') applyDark();
    };
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }
} catch {
  /* 老浏览器没有 matchMedia，忽略 */
}

function artIndexFor(theme) {
  const m = String(theme || '').match(/^duo-(\d)$/);
  if (m) return (Number(m[1]) - 1 + DUO_ARTS.length) % DUO_ARTS.length;
  return dayArtIndex();
}

function darkActive() {
  const mode = store.getPrefs().dark || 'auto';
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  } catch {
    return false;
  }
}

function applyDark() {
  const on = darkActive();
  try {
    document.documentElement.setAttribute('data-dark', on ? '1' : '0');
  } catch {
    /* 极简环境没有 setAttribute，忽略 */
  }
  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#161214' : '#fdf3f0');
  } catch {
    /* 忽略 */
  }
}

function applyTheme() {
  applyDark();
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
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
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
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
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
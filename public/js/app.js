import * as date from './date.js';
import * as store from './store.js';
import * as plan from './plan.js';
import * as cycleUtil from './cycle.js';
import * as storyUtil from './story.js';
import * as jokeUtil from './joke.js';
import * as schedule from './schedule.js';
import { load as loadWeather } from './weather.js';
import * as music from './music.js';

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
  musicSleepTimer: null,
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
    ${modules.map(moduleHTML).join('')}
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
  '有人稳稳陪着你，慢慢来也没关系',
  '今天也认真生活了，给自己一点掌声',
  '累了就歇一会儿，不用一直绷着',
  '你不需要时刻完美，被喜欢的是真实的你',
  '把一件小事做好，今天就不算白费',
  '柔软一点也没关系，你值得被好好对待',
  '往前走就好，方向慢慢会清晰',
  '今天有点丧也没事，明天再说',
  '不用跟谁比进度，你的节奏就很好',
  '难的时候先照顾身体，别的往后放',
  '你照顾别人的样子很好，也记得照顾自己',
  '允许自己不想说话，安静也是休息',
  '一件小事做完了就值得高兴一会儿',
  '慢慢吃饭、慢慢走路，日子会稳下来',
  '不高估今天，不低估自己',
  '先喝口水，再去想那些烦心事',
  '早饭吃热的，胃会替你说谢谢',
  '坐久了就站起来走两步',
  '眼睛干就看看远处那棵树',
  '脖子转两圈，别一直低头',
  '今天可以少喝一杯冰的',
  '手凉就捂一会儿，别硬撑着',
  '吃饭别看手机，吃完再说',
  '累了先躺十分钟，不用愧疚',
  '晚上泡个脚，睡觉会沉一些',
  '肩膀放松，它不是用来扛所有事的',
  '今天穿厚一点，风比昨天凉',
  '记得吃点绿的，不是为了减肥',
  '水杯放在看得见的地方',
  '三顿饭按时吃，比什么都管用',
  '别空着肚子喝咖啡',
  '饿了就吃，不用等一个整点',
  '走楼梯也行，能走就不算懒',
  '腰不舒服就靠一会儿',
  '感冒刚开始，多睡一觉',
  '今天少说一句话，多喝一口水',
  '出门带纸，带着会安心',
  '药按时吃，别想起来才吃',
  '洗个热水澡，人會轻一点',
  '头发吹干再睡',
  '别咬着牙做事，牙会疼',
  '深呼吸三次，再决定要不要生气',
  '手指累了就张开再握紧',
  '天气干燥，涂点护手霜',
  '身体说停的时候，就停一下',
  '不喝酒也很好，热水也能暖人',
  '眼睛酸了就把屏幕调暗',
  '吃点甜的也没关系，别过量',
  '坐直一点，气会顺一些',
  '今天早点关灯',
  '出门前看看天气，别冻着',
  '鞋别太硬，脚舒服了人才松',
  '午睡别超过二十分钟',
  '头疼先喝水，再看要不要吃药',
  '把外套穿上，别为了好看挨冻',
  '饭前洗手，这件事值得坚持',
  '冰箱里的东西记得吃完',
  '带个保温杯，随时能喝温的',
  '别忍着不去厕所',
  '今天走够三千步就很好',
  '别一直靠在椅背上，坐正一点',
  '吃慢一点，饱的信号来得晚',
  '体力不好就分两次做',
  '冷的时候搓搓手心',
  '别在空调风口坐太久',
  '一碗热汤能治好半个晚上',
  '睡前把明天的水倒好',
  '今天不必走出去，走到阳台也算',
  '洗把脸，人会清醒一点',
  '别空腹吃止痛药',
  '脚肿了就把腿垫高',
  '情绪差的时候先吃点东西',
  '别用熬夜换效率',
  '身体的账，最后都要还的',
  '累了就说累，别装作没事',
  '有太阳就晒五分钟',
  '别怕早睡，事情明天还在',
  '困了就闭眼，不用强撑到整点',
  '今天可以把一件事挪到明天',
  '中午趴十分钟，下午会好过',
  '别用冷水洗头',
  '吃点水果，别只吃零食',
  '胃不舒服就吃软的',
  '走路慢一点，别老赶',
  '别站在风口打电话',
  '肩膀酸就换个姿势',
  '今天少喝一杯酒',
  '感冒别硬扛，早点歇',
  '记得剪指甲，小事也让人舒服',
  '眼睛累了就别看小字',
  '吃饭别急，咽下去再说下一口',
  '今天可以不做完，明天接着',
  '别让自己饿太久',
  '热毛巾敷一下眼睛',
  '睡够了，脾气会好一半',
  '身体舒服的时候，人也好说话',
  '别在半夜做决定，人太累了',
  '手边常备一张纸巾',
  '今天可以不出门，也不算浪费',
  '出门穿双好走的鞋',
  '别一直憋着不说话，慢慢讲',
  '早上起来先喝半杯温水',
  '累的时候少刷一会儿手机',
  '冷的时候别硬撑着不穿',
  '洗澡水温别太高',
  '被窝凉就先用热水袋',
  '刷牙时慢慢来，别应付',
  '吃饭时坐好，别边走边吃',
  '一天里至少有一顿是热的',
  '别空着肚子出门',
  '不舒服就早说，别等严重',
  '走路时抬头看看天',
  '用眼四十分钟就歇一歇',
  '睡前一小时别灌水',
  '别为了省时间跳过早饭',
  '胃不好就少吃辣',
  '今天要不要试试早半小时睡',
  '稍微动一动，身体会给你回应',
  '汗出来了记得补水',
  '指甲长了会分心，剪了',
  '坐着别翘腿，久了会不舒服',
  '照顾好自己不是懒',
  '洗澡后抹点身体乳，冬天不痒',
  '枕头太高就换一个',
  '晚上少吃一点，睡得稳',
  '别用零食当午饭',
  '吃完别马上躺下',
  '眼睛痒别揉，洗一下',
  '今天可以只做三件事',
  '别老看时间，会越看越急',
  '事情堆着就先挑一件',
  '把大任务切成十五分钟一块',
  '先做五分钟，剩下的自然会来',
  '不想写就先写一句',
  '桌子收一收，脑子会清楚点',
  '别等状态好才开始',
  '完成比完美更值钱',
  '先做最难的那件，后面都轻',
  '一天只定一个重点',
  '碎片时间别全刷手机',
  '做一半也比零强',
  '今天可以拒绝一件不重要的事',
  '想不出来就先走开十分钟',
  '清单上划掉一条，人会舒服',
  '别把明天的活提前做',
  '做不完就记下来，别硬记在脑子里',
  '先把最容易的那件干掉',
  '定时器比自制力可靠',
  '允许自己做得慢',
  '一次只做一件事',
  '不要一边工作一边回消息',
  '打开电脑前先想清楚做什么',
  '把手机上那个最耗人的应用藏起来',
  '今天不必推进，稳住也算',
  '别人催你时，也可以说你排着队',
  '不会就是不会，不用假装',
  '把注意力收回来，一次一件',
  '先解决能解决的那部分',
  '工具不好用就换一个',
  '做事情累的是切换，不是做事',
  '今天不用证明给谁看',
  '开头难就先把开头写烂',
  '把明天要用的东西摆好',
  '想学的东西，今天看十分钟',
  '一分钟也算开始',
  '效率差的时候别自责',
  '把难的任务放到上午',
  '别边做边骂自己',
  '做完了再评价',
  '今天可以只收尾不开新坑',
  '细节抠不完就交出去',
  '别用忙碌掩盖不想做的事',
  '连做三件小事，会顺起来',
  '把房间里的一样东西归位',
  '烦的时候就整理桌面',
  '手机上删掉一个入口',
  '出门前把包收拾好',
  '一次性做完一类事',
  '今天允许自己用笨办法',
  '不想做的事，先做十分钟试试',
  '先写下"接下来做什么"，再开始',
  '记不住就用笔记',
  '别让计划比事情还多',
  '做事情的时候关掉音乐',
  '状态不好就降低标准',
  '能一次做完的就一次做完',
  '一天里留一段什么都不做的时间',
  '今天不加班也可以',
  '做完就完事，不用反复检查十遍',
  '把手机放远一点，十分钟就够',
  '别把闲聊当成休息',
  '休息的时候真的休息',
  '消息不必秒回',
  '一次只回一个人',
  '想不出怎么回就晚点回',
  '不用抢着解释自己',
  '不同意也可以笑着说',
  '拒绝的时候不必给三个理由',
  '被误解了也可以不辩解',
  '今天的社交额度用完了就回家',
  '想说的事，慢慢说清楚',
  '不想去的饭局可以不去',
  '聊天累了就安静一会儿',
  '不必每句话都接',
  '有人说话难听，不必接住',
  '把想说的话先写在备忘录',
  '先照顾自己再照顾别人',
  '不用人人都喜欢你',
  '想哭就哭，别忍回身体里',
  '今天错了就认，不用演',
  '需要帮忙就开口',
  '别人情绪不好不是你的错',
  '跟人相处，留一步给彼此',
  '不想说话就少说两句',
  '争不赢的就不争了',
  '一句"再说吧"也很好用',
  '关系里不用一直让步',
  '被夸了就收下，说声谢谢',
  '今天可以只跟一个人说真心话',
  '不开心的时候，不必强颜欢笑',
  '不必对所有人都热情',
  '把你放在心上的，那几个就够',
  '有话当面说，别憋成疙瘩',
  '别人怎么想你，管不到',
  '想亲近的人，主动一点',
  '聊得来就多聊，聊不来就少聊',
  '不用替别人做决定',
  '今天可以安静地当个听的人',
  '被冷落了也没关系，人都有自己的事',
  '原谅是给自己松绑',
  '不用跟谁比谁更累',
  '今晚不解释也可以',
  '沉默有时比道歉更有用',
  '不合适的事，早点说清楚',
  '今天可以不聚会',
  '一个人吃饭也很好',
  '有人陪时珍惜，没人陪时也不慌',
  '不用为了合群改掉自己',
  '把手机静音一小时',
  '一个人待着不算孤僻',
  '今天听听窗外的声音',
  '独处时才发现自己想什么',
  '想清楚再回答也没关系',
  '有些事不用说给别人听',
  '安静下来，答案自己会浮上来',
  '今天可以不出声',
  '一个人走路也很好',
  '不用随时在线',
  '把想说的话写给自己',
  '发呆十分钟，脑子会清',
  '没人打扰的时间很贵',
  '今天少看别人的生活',
  '不用跟别人汇报你在做什么',
  '你不需要一直有产出',
  '偶尔什么都不做，也是一种照顾',
  '和自己吃饭时也认真吃',
  '一个人也有仪式感',
  '屋子里放一点光',
  '把喜欢的歌听完整',
  '今天可以什么都不安排',
  '不用为独处找理由',
  '睡前不用刷到困才睡',
  '一个人也可以过得很好',
  '安静不等于孤独',
  '今天可以只陪自己',
  '流泪不是软弱，是排出去',
  '不用把所有话都咽下去',
  '想不通就先别想',
  '低落的时候少做决定',
  '情绪来了就让它来',
  '难过可以有一个具体的时间',
  '写下来，人就会轻一点',
  '今天允许自己不开心',
  '不用急着振作',
  '哭完喝口水，再想下一步',
  '不必对情绪讲道理',
  '烦躁时先动一动身体',
  '抱怨完就收尾',
  '心里堵就找个人说',
  '难过的时候先吃点热的',
  '今天可以少做一点，多歇一点',
  '不开心也不用解释',
  '把情绪当成天气，会过去的',
  '不用一直坚强',
  '委屈就说出来，别攒着',
  '难受的时候可以先躺下',
  '今天不必像没事一样',
  '允许自己慢半拍',
  '心情不好时别做重要决定',
  '想哭的夜里，明天会好一点',
  '愤怒的时候先写下来，再删掉',
  '情绪过去了，你还在',
  '今天可以躲一会儿',
  '不用为难过道歉',
  '你不需要马上变好',
  '把"我没事"换成"我有点累"',
  '害怕的时候先做一件小事',
  '焦虑时先写清单，再挑一件',
  '今天可以什么都不解决',
  '有些情绪就是需要时间',
  '不用反复检查自己的话有没有说错',
  '允许自己反复',
  '今天难过就难过，明天再说',
  '难受不一定要人知道',
  '你能撑到这里已经很不错',
  '心情可以慢慢来',
  '把注意力放回手边这件事',
  '今天少吃一点情绪，多吃一口饭',
  '别跟自己较劲了',
  '烦的时候把窗户打开',
  '把"我应该"换成"我可以"',
  '难受的时候不必讲道理',
  '给情绪一个出口，别堵',
  '想说什么就说，别绕三圈',
  '今天不必讨好任何人',
  '心情不好也能干活，只是慢一点',
  '难过是正常的，不用治',
  '把今天的烦恼写在纸上折起来',
  '今天的难，明天看会小一点',
  '不必把自己说得很惨',
  '开心的时候允许自己大声笑',
  '今天有好吃的就多吃一口',
  '看到喜欢的东西可以停下来看看',
  '天上的云今天很好看',
  '路上有猫就摸一下',
  '把一杯茶喝完再起身',
  '阳光照进来时就坐一会儿',
  '今天听一首完整的歌',
  '穿一件喜欢的衣服',
  '吃饭时慢慢嚼，尝出味道',
  '把窗户擦干净，屋里会亮',
  '今天买一朵花也不奢侈',
  '把喜欢的句子抄下来',
  '洗完澡那一会儿最舒服',
  '被子晒过更好睡',
  '今天走一条没走过的路',
  '好吃的留一点给明天',
  '闻一闻饭菜的香味',
  '把桌子上的灰擦掉',
  '一杯冰水也能让人清醒',
  '今天可以说一句"我很喜欢"',
  '把东西放回原位，心里也整齐',
  '雨天就听雨，别赶路',
  '今天的风里有一点甜',
  '把手机壳擦干净',
  '换一条毛巾，人也清爽',
  '看到好句子就记下来',
  '今天的太阳落在肩上',
  '把喜欢的颜色穿在身上',
  '吃饭时给自己留一口爱吃的',
  '把灯换成暖色',
  '今天可以早点洗澡',
  '把窗台上的植物转个方向',
  '听到喜欢的歌就多听一遍',
  '今天可以整理一下相册',
  '衣服洗完晾出去，看一眼',
  '走累了就找地方坐一会儿',
  '今天可以慢慢喝完一杯水',
  '看到小狗摇尾巴就开心一下',
  '把被子抖一抖再盖上',
  '今天可以只吃想吃的',
  '把手机调成静音，听一会儿安静',
  '花开了就多看一眼',
  '今天的光斜斜的很好看',
  '把喜欢的杯子用起来',
  '吃饭时关掉电视',
  '今天可以走慢一点回家',
  '把指甲剪整齐，心情会好一点',
  '洗完头等它自然干',
  '今天可以说一句"谢谢"',
  '早上起来把窗帘拉开',
  '买一个喜欢的面包当早餐',
  '把鞋子摆整齐',
  '今天可以听完一整张专辑',
  '看到照片里的人在笑，你也笑一下',
  '把房间里最乱的一块收拾干净',
  '今天可以提前十分钟出门',
  '吃饭时给自己倒一杯水',
  '换一件干净的床单',
  '今天可以什么都不买',
  '把喜欢的东西放在看得见的地方',
  '天气好就把窗开一条缝',
  '今天可以走一段路不戴耳机',
  '喝一口热汤，胃先暖',
  '把用不上的东西送出去',
  '今天可以早一点开灯',
  '闻到饭香就饿了，这是好事',
  '把今天的日期写下来',
  '今天可以跟一个人说你很好',
  '把明天的衣服先拿出来',
  '吃饭时不要站着',
  '看到奇怪的云就拍一张',
  '今天可以给花浇点水',
  '洗完手擦干，别糊弄自己',
  '把喜欢的歌设成闹钟',
  '今天可以多吃一点水果',
  '走路时踩一踩阳光',
  '把头发梳整齐，人精神',
  '今天可以换一只杯子',
  '看到猫伸懒腰就学一下',
  '把袋子里的东西倒出来整理',
  '今天可以不吃剩菜',
  '听到雨声就慢一点',
  '把拖鞋摆正',
  '今天可以只做一件家务',
  '把电池充满，明天不慌',
  '今天可以坐窗边吃饭',
  '看到落叶就捡一片',
  '把毛巾挂好，别堆着',
  '今天可以说一句"辛苦了"',
  '喝水时放下手机',
  '把今天要花的钱算一下',
  '今天可以只散一小会儿步',
  '看到镜子里的自己，点点头',
  '把窗户关好，屋里暖',
  '今天可以不吃夜宵',
  '看着汤冒热气，等一会儿',
  '把杯子洗干净，明天好用',
  '今天可以换一条路走',
  '看到好看的晚霞就停下来',
  '把垃圾顺手带下楼',
  '今天可以早点铺床',
  '听到楼下有人聊天，很生活',
  '把今天的好事记一条',
  '今天可以不用回复所有消息',
  '把明天的早饭想好',
  '看到孩子在跑，会想笑',
  '把鞋带系紧一点',
  '今天可以少看一会屏幕',
  '听着锅里的声音，饭快好了',
  '把今天的地扫一遍',
  '今天可以不吃很饱',
  '看到花店就进去看看',
  '把外套挂在门口',
  '今天可以慢慢走回家',
  '听到好听的敲门声也开心',
  '把今天的花费写下来',
  '今天可以看一集就关',
  '看到空杯子就去洗',
  '把明天的闹钟调晚十分钟',
  '今天可以不吃早饭以外的东西',
  '听到锅盖响就知道水开了',
  '把手机充电器放固定位置',
  '今天可以绕远一点回家',
  '看到别人的猫也打招呼',
  '把今天的照片留一张',
  '今天可以什么都不晒',
  '听到风大的声音就关窗',
  '把湿毛巾晾出去',
  '今天可以只在阳台待一会儿',
  '看到灯亮了就觉得安全',
  '把桌上的水渍擦掉',
  '今天可以不吃甜的了',
  '听到音乐就轻轻点脚',
  '把明天的便当想好',
  '今天可以说一句"我在"',
  '看到花开了就告诉别人',
  '把门口的鞋收进来',
  '今天可以早点关电脑',
  '听到雨停了就开窗',
  '把今天的小烦恼写下来',
  '今天可以不吃凉的',
  '看到干净的杯子心情好',
  '把明天的会议写在纸上',
  '今天可以早一点出门',
  '听到楼下卖早饭的声音',
  '把今天穿的衣服挂好',
  '今天可以不吃到撑',
  '看到熟悉的街就安心',
  '把明天的水杯灌满',
  '今天可以早一点洗头',
  '听到潮声就慢下来',
  '把今天要做的一件小事写下来',
  '今天可以不用一直坐着',
  '看到窗外的鸟就出神一下',
  '把指甲修一修',
  '今天可以不吃辣',
  '听到孩子们放学的声音',
  '把明天的路先想好',
  '今天可以走过一家书店再进去',
  '看到结账的队伍就等等',
  '把找零放进零钱罐',
  '今天可以吃一顿热的',
  '听到远处的车声就想起家',
  '把今天的垃圾倒掉',
  '今天可以不吃剩饭',
  '看到锅里冒泡就知道好了',
  '把毛巾换一条新的',
  '今天可以早点结束一天',
  '听到门锁响就松一口气',
  '把明天的包收好',
  '今天可以不吃很咸',
  '看到喜欢的东西先放着',
  '把今天没做的事记下来',
  '今天可以少说一句气话',
  '听到电话就别急着接',
  '把明天的衣服想好',
  '今天可以不吃太晚',
  '看到镜子里的人累了就让他歇',
  '把今天做的都看一遍',
  '今天可以什么都不检查',
  '听到门外的脚步就当作邻居',
  '把明天的期待写一句',
  '今天可以不急着回消息',
  '看到窗上的水汽就画一笔',
  '把今天的暖手宝充上',
  '今天可以少看一会儿新闻',
  '听到冰箱嗡嗡响也安心',
  '把明天的咖啡豆磨好',
  '今天可以不吃到很晚',
  '看到桌上的影子发呆',
  '把今天的账记一笔',
  '今天可以少买一样东西',
  '听到空调声就当白噪音',
  '把明天的闹钟设一个温柔的',
  '今天可以不吃凉的菜',
  '看到旧照片就翻一会儿',
  '把今天的鞋擦一下',
  '今天可以少刷十个视频',
  '听到钟声就抬头看看'
];
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
    musicCardHTML(),
    tomatoCardHTML(),
    dailyTuneCardHTML(),
    pledgeCardHTML(now),
    foodPrefCardHTML(),
    backupCardHTML()
  ].join('');
  return `<section class="card tools-card">
    <details id="tools-drawer" ${state.toolsOpen ? 'open' : ''}>
      <summary class="tools-sum">
        <span class="card-icon" aria-hidden="true">🧰</span>
        <span class="card-title">更多小工具</span>
        <span class="tools-count">心情 · 日子 · 番茄 · 音乐</span>
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
];
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
  '今晚早点躺平，明天才有力气去做喜欢的事。',
  '今天能出门走走就走走，回来会松快一些。',
  '把要做的事写下来，脑子会轻一点。',
  '有点情绪就先照顾身体：喝口水、吃口热的。',
  '别在深夜做决定，睡醒再看也许就没那么难。',
  '想拒绝就拒绝，不用把每件事都接下来。',
  '今天学会的一点小事，也在慢慢攒本事。',
  '和人闹别扭了，先把自己哄好再说。',
  '喝水的时候顺手放下手机，一分钟就能缓过来。',
  '坐久了把肩膀转两圈，脖子会松。',
  '今天出门前看一眼天气，别穿少了。',
  '不太饿也吃一点，胃空着人容易烦。',
  '心里堵就下楼走一圈，风会带走一点。',
  '任务太多就先挑一件，做完这一件再说。',
  '眼睛干就闭一会儿，比滴眼药水管用。',
  '把手机的提示音关掉，世界安静很多。',
  '今天有太阳就晒五分钟，人会暖起来。',
  '别在情绪最满的时候回消息，等十分钟。',
  '吃饭别站着吃，坐下来会吃得舒服。',
  '听到不中听的，可以先不接话。',
  '今天可以不解释那么多，说一句就够了。',
  '手凉就焐一会儿，别一直敲键盘。',
  '睡前把明天的水杯倒好，早上不用忙。',
  '有个小事拖着，就先做五分钟，剩下的会跟上。',
  '别拿熬夜补白天没做完的事。',
  '今天穿一件舒服的衣服，比好看重要。',
  '把“我应该”换成“我可以”，话会轻一些。',
  '想不通的事先记下来，过两天再看。',
  '房间乱就先收桌面一角，够了。',
  '今天不用对所有邀请都说好。',
  '被人误解也别急着证明，时间会说。',
  '有点烦就洗手，水温会把情绪带走。',
  '一个任务做完了就停三分钟，再接下一个。',
  '今天可以不吃夜宵，胃会谢谢你。',
  '出门带一包纸，用到的时候不慌。',
  '声音大的人不一定有道理，你可以慢慢讲。',
  '今天只回必要的消息，其余明天再说。',
  '奶茶少一点糖，身体轻一点。',
  '别把工作带进被窝，床只留给睡觉。',
  '今天走一段路不戴耳机，听听周围。',
  '有不开心就先吃点东西，别空腹硬扛。',
  '把要紧的事写在纸上，脑子会空出来。',
  '今天可以不把话说满，留一点余地。',
  '天冷就加一条围巾，脖子暖了不容易感冒。',
  '做累了就趴在桌上十分钟，不算偷懒。',
  '别在半夜整理回忆，人会越整理越沉。',
  '今天可以少看一会儿别人的生活。',
  '吃饭时把剧关掉，味道会更清楚。',
  '有个想法先写下来，不写会忘。',
  '今天可以早点关灯，躺着也算休息。',
  '手机充上电，人也去洗个热水澡。',
  '别让一件事占满一整天，还有别的。',
  '今天可以只完成一件，也值得高兴。',
  '眼睛累就看远处六十秒，不用久。',
  '想说“不”的时候，就说“这次不行”。',
  '把不喜欢的事排在前面做完，后面会轻。',
  '今天可以不吃很饱，留着肚子吃喜欢的。',
  '洗完手擦干，别让皮肤一直湿着。',
  '情绪低的时候先别做决定，隔一天再说。',
  '今天把要做的事写三条，就三条。',
  '别和昨天比，和上周比更公平。',
  '有个小毛病拖了很久，今天去查一下也行。',
  '今天可以不热闹，安静也是一种过法。',
  '把桌上的杯子洗了，看着就舒服。',
  '有人让你不舒服，可以先走开。',
  '今天少喝一杯冰的，胃会稳一点。',
  '把要紧的日子在日历上标一下。',
  '别一边吃饭一边改方案，两件都做不好。',
  '今天可以不加班，事情明天还在。',
  '把常用的东西放回原位，找起来快。',
  '有点紧张就慢慢呼吸，四下再说话。',
  '今天可以只做家务，不做事。',
  '听到好消息就笑一下，不用忍着。',
  '睡前把手机放远，人会更早困。',
  '把明天要穿的衣服拿出来，早上省事。',
  '今天可以不吃很辣的，明天胃舒服。',
  '别在饿的时候逛超市，会买多。',
  '有个事拿不定，问一个人就够。',
  '今天可以早点吃饭，早点收工。',
  '把窗开一条缝，屋里会换气。',
  '心情不好就别硬撑笑，安静也行。',
  '今天可以不整理，乱一点也没关系。',
  '洗完头吹干再睡，别湿着躺。',
  '把待办里那条不再重要的删掉。',
  '今天可以少吃一顿零食，多喝一杯水。',
  '有人夸你就收下，别急着否认。',
  '累了先躺十分钟，再决定要不要干。',
  '别在晚上列明天的长清单，会睡不好。',
  '今天可以把一件事挪到后天。',
  '把票据和纸收进一个抽屉，心里整齐。',
  '有点冷就起来倒杯热水，顺手动一动。',
  '今天可以不发朋友圈，留着也没什么。',
  '别在同一个地方反复找，先放一放。',
  '把今天花掉的钱看一眼，不用算很细。',
  '今天可以只出门一次，够用就行。',
  '有个小目标实现了，就记下来。',
  '别在情绪里做长期规划，看不准。',
  '今天可以慢一点吃饭，嚼完再咽。',
  '屋子黑就先开灯，别摸黑做事。',
  '有人问你意见，可以说“我还没想好”。',
  '今天可以不吃早饭以外的加餐。',
  '把明天最重要的那件事写一张纸贴墙上。',
  '心里乱就先洗个澡，出来会清楚一点。',
  '今天可以只说三句话，剩下用点头。',
  '把水杯放在手边，想起来就喝一口。',
  '今天有一点困就早点睡，不用撑到整点。',
  '事情做不完就先停，明天的手更稳。',
];
const SIGN_LUCK = ['🍊', '🌟', '☁️', '🌙', '🧸', '🫧', '🌷', '🍑', '🍀', '🦋', '🧶', '🍯'];

function daySeed(now) {
  const t = now || new Date();
  return t.getFullYear() * 372 + (t.getMonth() + 1) * 31 + t.getDate();
}

function dailySignCardHTML() {
  const seed = daySeed();
  const tip = SIGN_TIPS[seed % SIGN_TIPS.length];
  return `<section class="card sign-card">
    <h2 class="card-head"><span class="card-icon">♋</span><span class="card-title">巨蟹座 · 今日小提示</span></h2>
    <p class="line">${esc(tip)}</p>
    <p class="line sign-not">今天不必：${esc(NOT_TODAY[seed % NOT_TODAY.length]).replace(/^今天不必/, '')}</p>
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

/* ------------------------- 音乐氛围（纯合成，零音频文件）+ 今日一曲（纯文案） ------------------------- */

function musicCardHTML() {
  const prefs = music.getPrefs();
  const playing = music.isPlaying();
  const playingKey = music.currentKey();
  const cur = music.presetByKey(playingKey || prefs.preset);
  const presetChips = music.PRESETS.map((p) => {
    const on = (playing ? playingKey : prefs.preset) === p.key;
    return `<button class="tomato-quick" type="button" data-act="music-preset" data-key="${p.key}" title="${esc(p.desc)}">${p.emoji} ${esc(p.name)}${on ? ' ✓' : ''}</button>`;
  }).join('');
  const vols = [0.2, 0.4, 0.6, 0.8, 1.0]
    .map((v, i) => `<button class="btn btn-mini" type="button" data-act="music-vol" data-level="${v}" aria-pressed="${Math.abs(prefs.volume - v) < 0.01}">${i + 1}</button>`)
    .join('');
  const sleepOpts = [15, 30, 45]
    .map((m) => `<button class="btn btn-mini" type="button" data-act="music-sleep" data-min="${m}">${m}′定时</button>`)
    .join('');
  return `<section class="card">
  <h2 class="card-head"><span class="card-icon">🎵</span><span class="card-title">音乐氛围 · ${esc(cur.emoji)} ${esc(cur.name)}</span></h2>
  <p class="card-sub">${esc(cur.desc)}；浏览器实时合成，不加载音频文件、不占仓库体积</p>
  <div class="chips" style="flex-wrap:wrap;gap:6px">${presetChips}</div>
  <div class="btn-row" style="margin-top:8px">
    <button class="btn ${playing ? 'btn-ghost' : ''}" data-act="music-play">${playing ? '暂停氛围声' : '播放氛围声'}</button>
    <button class="btn btn-ghost btn-mini" data-act="music-autofocus" aria-pressed="${prefs.autoFocus}">番茄联动：${prefs.autoFocus ? '开' : '关'}</button>
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap">
    <span class="hint" style="margin:0">音量 1小–5大</span>${vols}
  </div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
    <span class="hint" style="margin:0">睡前定时</span>${sleepOpts}
  </div>
  <p class="hint">点过一次播放声音才会出来；暂停即停，切到小游戏也不互相干扰。</p>
  </section>`;
}

function dailyTuneCardHTML() {
  const day = todayKey();
  const tune = music.currentTune(day);
  const done = music.isTuneDone(day);
  const fav = music.isFav(tune.idx);
  const rec = music.presetByKey(tune.rec);
  return `<section class="card">
  <h2 class="card-head"><span class="card-icon">🎼</span><span class="card-title">今日一曲 · 纯文案</span></h2>
  <p class="joke-name">《${esc(tune.title)}》</p>
  <p class="line">${esc(tune.vibe)}</p>
  <p class="card-sub">适合：${esc(tune.scene)} · ${esc(tune.note)}</p>
  <div class="btn-row" style="margin-top:8px">
    <button class="btn btn-ghost btn-mini" data-act="music-rec" data-key="${tune.rec}">配一点：${rec.emoji}${esc(rec.name)}</button>
    <button class="btn btn-ghost btn-mini" data-act="tune-another">换一首意境</button>
    <button class="btn btn-ghost btn-mini" data-act="tune-fav" aria-pressed="${fav}">${fav ? '♥ 已收藏' : '♡ 收藏'}</button>
    <button class="btn btn-mini" data-act="tune-done">${done ? '✓ 今天已听' : '今天听一记'}</button>
  </div>
  <p class="hint">累计听记 ${music.tuneDoneCount()} 天 · 收藏 ${music.favList().length} 首；只存文字意境，不联网找歌。</p>
  </section>`;
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
    music.stop(400);
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

  return `<div class="wrap">${hero('每日小故事', date.cnShort(today) + ' · 小猪 ＋ 小金毛')}${storyCard}${jokeCard}${badgeCardHTML()}${softCard}${dailySignCardHTML()}${personalityTagHTML()}${sleepTipCard}</div>`;
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
    if (state.tomato.running && music.getPrefs().autoFocus && !music.isPlaying()) {
      music.start(music.getPrefs().focusPreset || 'focus');
    }
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

  /* ---- 音乐氛围 ---- */
  if (act === 'music-play') {
    if (music.isPlaying()) {
      music.stop(500);
      toast('氛围声先歇一会儿');
    } else {
      music.start(music.getPrefs().preset);
      toast('轻轻的氛围声陪你');
    }
    render();
    return;
  }

  if (act === 'music-preset') {
    const key = el.dataset.key;
    music.setPref({ preset: key });
    if (music.isPlaying()) music.start(key);
    render();
    return;
  }

  if (act === 'music-vol') {
    const v = Number(el.dataset.level);
    if ([0.2, 0.4, 0.6, 0.8, 1.0].includes(v)) {
      music.setPref({ volume: v });
      music.applyVolume();
      render();
    }
    return;
  }

  if (act === 'music-autofocus') {
    music.setPref({ autoFocus: !music.getPrefs().autoFocus });
    render();
    toast(music.getPrefs().autoFocus ? '番茄开始时自动陪一点氛围声' : '番茄联动已关');
    return;
  }

  if (act === 'music-sleep') {
    const m = Number(el.dataset.min);
    music.setPref({ sleepMin: m });
    if (!music.isPlaying()) music.start('calm');
    if (state.musicSleepTimer) clearTimeout(state.musicSleepTimer);
    state.musicSleepTimer = setTimeout(() => {
      music.stop(900);
      toast('定时到啦，声音慢慢停下，晚安');
    }, m * 60000);
    render();
    toast(`${m} 分钟后轻轻停下`);
    return;
  }

  if (act === 'music-rec') {
    const key = el.dataset.key;
    music.setPref({ preset: key });
    music.start(key);
    render();
    return;
  }

  if (act === 'tune-another') {
    music.anotherTune(today);
    render();
    return;
  }

  if (act === 'tune-fav') {
    const tune = music.currentTune(today);
    const added = music.toggleFav(tune.idx);
    render();
    toast(added ? '收藏好啦，下次翻得快一些' : '已取消收藏');
    return;
  }

  if (act === 'tune-done') {
    if (music.isTuneDone(today)) {
      toast('今天已经记过啦');
      return;
    }
    music.markTuneDone(today);
    render();
    toast('今天的意境收进口袋啦');
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
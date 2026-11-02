import * as date from './date.js';
import * as store from './store.js';
import * as plan from './plan.js';
import * as cycleUtil from './cycle.js';
import * as storyUtil from './story.js';
import * as schedule from './schedule.js';
import { load as loadWeather } from './weather.js';

const appEl = document.getElementById('app');
const tabsEl = document.getElementById('tabs');

const TABS = [
  { key: 'home', icon: '🏠', label: '今陪伴' },
  { key: 'cycle', icon: '🌸', label: '小日子' },
  { key: 'story', icon: '🌙', label: '小故事' },
  { key: 'memo', icon: '📝', label: '备忘' },
  { key: 'game', icon: '🎮', label: '养成' }
];

const state = {
  tab: 'home',
  weather: [],
  weatherStatus: 'loading',
  lastPeriod: '',
  diaryDate: '',
  diaryQuery: ''
};

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) {
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
}

function todayKey() {
  return date.dateKey(new Date());
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
    <header class="hero">
      <div class="hero-top">
        <h1 class="hero-hi">${esc(plan.greeting(period))}</h1>
        <button class="gear" data-act="tab" data-tab="settings" aria-label="设置">⚙️</button>
      </div>
      <p class="hero-date">${esc(date.cn(today))} · ${esc(date.weekdayCN(now))} · ${esc(date.PERIOD_LABEL[period] || '')}</p>
      <p class="hero-note">小猪盯吃喝，小金毛摇尾巴～</p>
    </header>
    ${modules.map(moduleHTML).join('')}
    ${store.hasDiary(today) ? '' : `<section class="card">
      <h2 class="card-head"><span class="card-icon">📖</span><span class="card-title">今天的小日子还空着</span></h2>
      <p class="line">两句也行，小猪给你留着空，写完自己会存。</p>
      <button class="btn btn-ghost btn-mini" data-act="tab" data-tab="cycle">去写两句</button>
    </section>`}
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
      <p class="nn">${esc(m.nn || '晚安豆豆大王')}</p>
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

function storyPage() {
  const today = date.dateKey();
  const story = storyUtil.current(today);
  const done = store.getStoryDone(today);

  const body = done
    ? `<section class="card">
        <h2 class="card-head"><span class="card-icon">🌛</span><span class="card-title">晚安豆豆大王</span></h2>
        <p class="line">23:30前放下手机，梦里有小猪和小金毛。</p>
        <p class="line">明天小猪还来盯你喝水、吃饭、练琴。</p>
        <button class="btn btn-ghost" data-act="tab" data-tab="home">回到今天的陪伴</button>
      </section>`
    : `<section class="card">
        <h2 class="card-head"><span class="card-icon">🌙</span><span class="card-title">《${esc(story.title)}》</span></h2>
        <p class="line story-body">${esc(story.body)}</p>
        <p class="nn">晚安豆豆大王</p>
        <div class="btn-row">
          <button class="btn" data-act="story-done">讲完啦，去睡觉</button>
          <button class="btn btn-ghost" data-act="story-another">换一个故事</button>
        </div>
        <p class="hint">讲完就不再发长消息，只留一句晚安。</p>
      </section>

      <section class="card">
        <h2 class="card-head"><span class="card-icon">⏰</span><span class="card-title">睡前小节奏</span></h2>
        <p class="line">${esc(store.getPrefs().storyAt)} 小猪讲故事，讲完就放下手机。</p>
        <p class="line">${esc(store.getPrefs().sleepAt)} 前睡着，睡前只抿两口温水。</p>
        <p class="line">手干了补护手霜、嘴唇干抹润唇，别敷面膜熬时间。</p>
      </section>`;

  return `<div class="wrap">${hero('睡前小故事', date.cnShort(today) + ' · 小猪 ＋ 小金毛')}${body}</div>`;
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
      <h2 class="card-head"><span class="card-icon">🏫</span><span class="card-title">学校与天气</span></h2>
      <p class="line">${esc(prefs.school)} · 在食堂吃，不推具体菜。</p>
      <p class="line">天气看 ${esc(prefs.cities.map((c) => c.name).join(' / '))}，只用来提醒温差、湿度、下雨带伞。</p>
      <p class="hint">数据来自 Open-Meteo，绕过后端代理，前端不暴露任何 key。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">💧</span><span class="card-title">喝水</span></h2>
      <p class="line">每天 ${esc(prefs.waterGoal)} 杯温水：${esc(prefs.cups.join(' / '))}各一杯，睡前只抿两口。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡觉</span></h2>
      <p class="line">${esc(prefs.sleepAt)} 前放下手机入睡。</p>
      <p class="line">${esc(prefs.storyAt)} 左右讲故事，讲完立刻催睡。</p>
    </section>

    <section class="card">
      <h2 class="card-head"><span class="card-icon">🧴</span><span class="card-title">护肤 · ${esc(prefs.skin)}</span></h2>
      <p class="line">温和洁面、无香精保湿修护、物理遮挡优先。</p>
      <p class="line">不刷酸、不去角质、不上功效猛药；换季和经期前后加强修护、少换新品。</p>
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
      <p class="hint">数据存在服务端 Volume 里，只认这串码，没有账号密码；不想同步就断开，本机数据照样在。</p>`}
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
    store.setStoryDone(today, true);
    render();
    return;
  }

  if (act === 'story-another') {
    store.setStoryDone(today, false);
    storyUtil.another(today);
    render();
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
    fetch('/api/sync/new', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j || !j.ok || !j.code) return toast('服务端存储没开，检查一下 Volume');
        setSyncCfg({ code: j.code, at: 0 });
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
    setSyncCfg({ code, at: 0 });
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

const DUO_ARTS = ['/art/bg-q1.svg', '/art/bg-q2.svg', '/art/bg-q3.svg', '/art/bg-q4.svg'];
const DUO_NAMES = ['贴贴', '打盹', '散步', '点心'];

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
const CODE_RE = /^[A-HJ-NP-Z2-9]{6,10}$/;

function syncCfg() {
  return store.get(SYNC_KEY, null) || null;
}

function setSyncCfg(cfg) {
  store.set(SYNC_KEY, cfg);
}

/** 把本机所有 dd: 数据打成一份快照（同步码本身不进去） */
function snapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf('dd:') !== 0 || k === SYNC_KEY) continue;
      const v = localStorage.getItem(k);
      if (typeof v === 'string' && v.length <= 20000) out[k] = v;
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
      if (k && k.indexOf('dd:') === 0 && k !== SYNC_KEY) keys.push(k);
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
    if (k.indexOf('dd:') !== 0 || k === SYNC_KEY || typeof payload[k] !== 'string') return;
    try {
      localStorage.setItem(k, payload[k]);
    } catch {
      /* 忽略 */
    }
  });
}

async function syncNow(silent) {
  const cfg = syncCfg();
  if (!cfg || !cfg.code) {
    if (!silent) toast('还没有同步码，先生成一个');
    return;
  }
  try {
    const res = await fetch('/api/sync/load?code=' + encodeURIComponent(cfg.code), { cache: 'no-store' });
    const json = await res.json();
    const remoteAt = json && json.ok ? Number(json.savedAt || 0) : 0;

    if (json && json.ok && remoteAt > Number(cfg.at || 0) + 500) {
      restore(json.payload);
      setSyncCfg({ code: cfg.code, at: remoteAt });
      store.ensureDefaults();
      applyTheme();
      render();
      if (!silent) toast('已经同步另一台设备的记录');
      return;
    }

    const savedAt = Date.now();
    const push = await fetch('/api/sync/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: cfg.code, payload: snapshot(), savedAt })
    });
    const out = await push.json();
    if (out && out.ok) {
      setSyncCfg({ code: cfg.code, at: Number(out.updatedAt || savedAt) });
      if (!silent) toast('已经同步到服务端');
    } else if (!silent) {
      toast('同步失败：' + ((out && out.reason) || '服务不可用'));
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
  state.tab = currentTab();
  state.lastPeriod = date.periodOfDay(new Date());
  render();

  setInterval(() => {
    const p = date.periodOfDay(new Date());
    if (p !== state.lastPeriod && state.tab === 'home') render();
    state.lastPeriod = p;
  }, 60 * 1000);

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
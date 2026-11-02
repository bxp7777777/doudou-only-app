/* 浏览器版本地存储：和小程序里同一套 key，换成 localStorage */

export const K = {
  prefs: 'dd:prefs',
  cycle: 'dd:cycle',
  cycleAsk: 'dd:cycle:ask',
  storyLast: 'dd:story:last',
  storyDone: 'dd:story:done:',
  water: 'dd:water:',
  checkin: 'dd:checkin:',
  memo: 'dd:memo',
  schedule: 'dd:schedule'
};

export const CHECK_ITEMS = [
  { id: 'water', label: '喝水3杯' },
  { id: 'meal', label: '三餐按时温热' },
  { id: 'sleep', label: '23:30前睡' },
  { id: 'qin', label: '练琴30分钟' },
  { id: 'move', label: '久坐起身活动' },
  { id: 'eyes', label: '护眼/拉伸一次' },
  { id: 'mood', label: '心情一句话' }
];

export const DEFAULT_CYCLE = { lastStart: '', cycleLength: 28, periodLength: 5 };

export const DEFAULT_PREFS = {
  name: '豆豆大王',
  school: '广西艺术学院',
  waterGoal: 3,
  cups: ['上午', '午后', '晚间'],
  sleepAt: '23:30',
  storyAt: '23:00',
  skin: '敏感肌',
  theme: 'duo',
  cities: [
    { key: 'nanning', name: '南宁', note: '学校' },
    { key: 'shenzhen', name: '深圳', note: '家里' }
  ],
  avoid: ['榴莲', '臭豆腐', '螺蛳粉', '气味重的发酵腌制类'],
  like: ['清爽', '颜色好看', '造型可爱', '温热好入口']
};

export const THEMES = [
  { key: 'duo', name: '每日轮换' },
  { key: 'duo-1', name: '贴贴' },
  { key: 'duo-2', name: '打盹' },
  { key: 'duo-3', name: '散步' },
  { key: 'duo-4', name: '点心' },
  { key: 'xuanzhi', name: '宣纸暖粉' },
  { key: 'qingzhu', name: '青竹' },
  { key: 'chenwu', name: '晨雾' },
  { key: 'wanxia', name: '晚霞' }
];

export function get(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function set(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式可能写不进去，不影响页面 */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('dd:changed', { detail: key }));
    }
  } catch {
    /* 触发失败就算了，同步是锦上添花 */
  }
}

export function ensureDefaults() {
  if (!get(K.prefs, null)) {
    set(K.prefs, DEFAULT_PREFS);
    return;
  }
  if (!get(K.cycle, null)) set(K.cycle, DEFAULT_CYCLE);

  // 旧版默认是「宣纸暖粉」，新版默认换成「贴贴」；她自己挑过的其他主题不动
  const prefs = get(K.prefs, {});
  if (!prefs.themeV2) {
    const theme = !prefs.theme || prefs.theme === 'xuanzhi' ? 'duo' : prefs.theme;
    set(K.prefs, { ...DEFAULT_PREFS, ...prefs, theme, themeV2: true });
  }
}

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...get(K.prefs, {}) };
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...(patch || {}) };
  set(K.prefs, next);
  return next;
}

export function getCycle() {
  return { ...DEFAULT_CYCLE, ...get(K.cycle, {}) };
}

export function setCycle(cfg) {
  const next = { ...getCycle(), ...(cfg || {}) };
  set(K.cycle, next);
  return next;
}

/* ---------------- 喝水 ---------------- */

export function getWater(day) {
  const val = get(K.water + day, null);
  if (val && Array.isArray(val.cups) && val.cups.length === 3) return val;
  return { cups: [false, false, false] };
}

export function toggleCup(day, index) {
  const w = getWater(day);
  const i = Number(index);
  if (i >= 0 && i < 3) w.cups[i] = !w.cups[i];
  set(K.water + day, w);
  return w;
}

export function waterCount(day) {
  return getWater(day).cups.filter(Boolean).length;
}

/* ---------------- 打卡 ---------------- */

export function getCheckin(day) {
  const base = {};
  CHECK_ITEMS.forEach((it) => {
    base[it.id] = false;
  });
  return Object.assign(base, get(K.checkin + day, {}) || {});
}

export function toggleCheck(day, id) {
  const c = getCheckin(day);
  if (Object.prototype.hasOwnProperty.call(c, id)) c[id] = !c[id];
  set(K.checkin + day, c);
  return c;
}

export function checkinList(day) {
  const state = getCheckin(day);
  return CHECK_ITEMS.map((it) => ({
    id: it.id,
    label: it.label,
    done: !!state[it.id],
    mark: state[it.id] ? '☑' : '☐'
  }));
}

/* ---------------- 备忘录 ---------------- */

export function getMemos() {
  const list = get(K.memo, []);
  return Array.isArray(list) ? list : [];
}

export function addMemo(text) {
  const t = String(text || '').trim();
  if (!t) return getMemos();
  const list = getMemos();
  list.unshift({
    id: String(Date.now()) + Math.random().toString(36).slice(2, 6),
    text: t,
    done: false,
    at: Date.now()
  });
  const next = list.slice(0, 200);
  set(K.memo, next);
  return next;
}

export function toggleMemo(id) {
  const list = getMemos().map((m) => (m.id === id ? { ...m, done: !m.done } : m));
  set(K.memo, list);
  return list;
}

export function removeMemo(id) {
  const list = getMemos().filter((m) => m.id !== id);
  set(K.memo, list);
  return list;
}

/* ---------------- 故事 ---------------- */

export function getStoryDone(day) {
  return !!get(K.storyDone + day, false);
}

export function setStoryDone(day, flag) {
  set(K.storyDone + day, !!flag);
}

/* ---------------- 课表（豆豆自己填） ---------------- */

export function getSchedule() {
  const s = get(K.schedule, null);
  return s && typeof s === 'object' && !Array.isArray(s) ? s : {};
}

export function setSchedule(map) {
  const clean = {};
  Object.keys(map || {}).forEach((wd) => {
    const c = map[wd];
    if (!c || typeof c !== 'object') return;
    const first = c.first === '08:00' || c.first === '10:00' ? c.first : '';
    const afternoon = !!c.afternoon;
    const note = String(c.note || '').trim().slice(0, 40);
    if (!first && !afternoon && !note) return;
    clean[String(wd)] = { first, afternoon, note };
  });
  set(K.schedule, clean);
  return clean;
}

/* ---------------- 小日子（日记） ---------------- */

const DIARY_PREFIX = 'dd:diary:';
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

export const MOODS = [
  { key: 'happy', emoji: '😄', label: '开心' },
  { key: 'ok', emoji: '🙂', label: '还可以' },
  { key: 'flat', emoji: '😐', label: '一般' },
  { key: 'low', emoji: '😔', label: '有点低落' },
  { key: 'bad', emoji: '😣', label: '难受' }
];

export const BODIES = [
  { key: 'strong', emoji: '💪', label: '很有力气' },
  { key: 'normal', emoji: '🙂', label: '正常' },
  { key: 'tired', emoji: '🥱', label: '有点累' },
  { key: 'lie', emoji: '🛌', label: '想躺着' },
  { key: 'sick', emoji: '🤒', label: '不太舒服' }
];

export const DIARY_TAGS = ['上课', '练琴', '食堂', '天气', '朋友', '家里', '买东西', '胡思乱想', '护肤', '其他'];

export function diaryKey(day) {
  return DIARY_PREFIX + day;
}

export function getDiary(day) {
  const e = get(diaryKey(day), null);
  return e && typeof e === 'object' ? e : null;
}

/** 空内容就删掉这天，不留空壳 */
export function saveDiary(day, patch) {
  const cur = getDiary(day) || { text: '', mood: '', body: '', tags: [], updatedAt: 0 };
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  next.text = String(next.text || '').slice(0, 4000);
  next.tags = Array.isArray(next.tags) ? next.tags.filter((t) => DIARY_TAGS.includes(t)).slice(0, 8) : [];
  const empty = !next.text.trim() && !next.mood && !next.body && !next.tags.length;
  if (empty) {
    try {
      localStorage.removeItem(diaryKey(day));
    } catch {
      /* 忽略 */
    }
    return null;
  }
  set(diaryKey(day), next);
  return next;
}

export function listDiary(limit = 80) {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(DIARY_PREFIX)) continue;
      const v = get(k, null);
      if (v && typeof v === 'object' && k.length > DIARY_PREFIX.length) {
        out.push({ date: k.slice(DIARY_PREFIX.length), ...v });
      }
    }
  } catch {
    /* 忽略 */
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit);
}

export function deleteDiary(day) {
  try {
    localStorage.removeItem(diaryKey(day));
  } catch {
    /* 忽略 */
  }
}

export function hasDiary(day) {
  const e = getDiary(day);
  return !!e && (!!(e.text || '').trim() || !!e.mood || !!(e.tags || []).length);
}

/** 月份天数、连续天数（今天没写就从昨天数）、总字数、总天数 */
export function diaryStats(today) {
  const all = listDiary(4000);
  const month = String(today).slice(0, 7);
  const monthDays = all.filter((e) => e.date.startsWith(month) && String(e.text || '').trim()).length;
  const written = new Set(
    all.filter((e) => String(e.text || '').trim() || e.mood || (e.tags || []).length).map((e) => e.date)
  );
  const cursor = new Date(today + 'T00:00:00');
  if (!written.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (written.has(ymd(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const chars = all.reduce((n, e) => n + String(e.text || '').length, 0);
  return { monthDays, streak, chars, total: written.size };
}

export function clearAll() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // 同步码留着，否则清档就等于把跨设备这条线掐了
      if (k && k.startsWith('dd:') && k !== 'dd:sync') keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 忽略 */
  }
  ensureDefaults();
}
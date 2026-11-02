const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 2026-11-02 */
function dateKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

/** 2026-11-02 -> Date(本地零点) */
function parseKey(key) {
  const p = String(key || '').split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** to - from，单位天 */
function dayDiff(fromKey, toKey) {
  const a = parseKey(fromKey).getTime();
  const b = parseKey(toKey).getTime();
  return Math.round((b - a) / 86400000);
}

function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** 11月2日 */
function cn(key) {
  const d = parseKey(key);
  return d.getMonth() + 1 + '月' + d.getDate() + '日';
}

/** 11月2日 周一 */
function cnShort(key) {
  const d = parseKey(key);
  return d.getMonth() + 1 + '月' + d.getDate() + '日 周' + '日一二三四五六'.charAt(d.getDay());
}

function weekdayCN(d) {
  return WEEK[(d || new Date()).getDay()];
}

function minutesOf(d) {
  const x = d || new Date();
  return x.getHours() * 60 + x.getMinutes();
}

/**
 * 时段划分（当地时间）
 * deepnight 00:00-05:00 / morning 05:00-11:00 / noon 11:00-14:00 /
 * afternoon 14:00-17:30 / evening 17:30-21:30 / late 21:30-23:00 /
 * bedtime 23:00-23:30 / sleep 23:30-24:00
 */
function periodOfDay(now) {
  const m = minutesOf(now);
  if (m < 300) return 'deepnight';
  if (m < 660) return 'morning';
  if (m < 840) return 'noon';
  if (m < 1050) return 'afternoon';
  if (m < 1290) return 'evening';
  if (m < 1380) return 'late';
  if (m < 1410) return 'bedtime';
  return 'sleep';
}

const PERIOD_LABEL = {
  deepnight: '深夜',
  morning: '上午',
  noon: '午间',
  afternoon: '午后',
  evening: '晚间',
  late: '夜里',
  bedtime: '睡前',
  sleep: '该睡了'
};

export {
  WEEK,
  pad,
  dateKey,
  parseKey,
  dayDiff,
  addDays,
  cn,
  cnShort,
  weekdayCN,
  minutesOf,
  periodOfDay,
  PERIOD_LABEL
};

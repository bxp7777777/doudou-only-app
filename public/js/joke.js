import * as date from './date.js';
import * as store from './store.js';
import JOKES from './jokes.js';

function dayIndex(key) {
  return Math.floor(date.parseKey(key).getTime() / 86400000);
}

/** 按日期轮换一条每日一笑，尽量不和上一条重复 */
function pick(todayKey) {
  const today = todayKey || date.dateKey();
  const n = JOKES.length;
  let idx = ((dayIndex(today) % n) + n) % n;
  const last = store.get(store.K.jokeLast, null);
  if (last && typeof last.idx === 'number' && last.idx === idx && last.key !== today) {
    idx = (idx + 1) % n;
  }
  const joke = JOKES[idx];
  store.set(store.K.jokeLast, { key: today, idx: idx });
  return { idx: idx, total: n, title: joke.title, body: joke.body };
}

/** 手动换一个：往后顺延，不回到同一条 */
function another(todayKey) {
  const today = todayKey || date.dateKey();
  const n = JOKES.length;
  const last = store.get(store.K.jokeLast, null);
  let idx = last && typeof last.idx === 'number' ? (last.idx + 1) % n : dayIndex(today) % n;
  const joke = JOKES[idx];
  store.set(store.K.jokeLast, { key: today, idx: idx });
  return { idx: idx, total: n, title: joke.title, body: joke.body };
}

/** 同一天再进来时取回当天那条 */
function current(todayKey) {
  const today = todayKey || date.dateKey();
  const last = store.get(store.K.jokeLast, null);
  if (last && last.key === today && typeof last.idx === 'number' && JOKES[last.idx]) {
    const j = JOKES[last.idx];
    return { idx: last.idx, total: JOKES.length, title: j.title, body: j.body };
  }
  return pick(today);
}

export { pick, another, current, dayIndex };

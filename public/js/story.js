import * as date from './date.js';
import * as store from './store.js';
import STORIES from './stories.js';

function dayIndex(key) {
  return Math.floor(date.parseKey(key).getTime() / 86400000);
}

/** 按日期轮换，保证和上一次讲的不同 */
function pick(todayKey) {
  const today = todayKey || date.dateKey();
  const n = STORIES.length;
  let idx = ((dayIndex(today) % n) + n) % n;
  const last = store.get(store.K.storyLast, null);
  if (last && typeof last.idx === 'number' && last.idx === idx && last.key !== today) {
    idx = (idx + 1) % n;
  }
  const story = STORIES[idx];
  store.set(store.K.storyLast, { key: today, idx: idx });
  return { idx: idx, total: n, title: story.title, body: story.body };
}

/** 手动换一个：往后顺延，不回到同一个 */
function another(todayKey) {
  const today = todayKey || date.dateKey();
  const n = STORIES.length;
  const last = store.get(store.K.storyLast, null);
  let idx = last && typeof last.idx === 'number' ? (last.idx + 1) % n : dayIndex(today) % n;
  const story = STORIES[idx];
  store.set(store.K.storyLast, { key: today, idx: idx });
  return { idx: idx, total: n, title: story.title, body: story.body };
}

/** 同一天再进来时取回当天那条，保持连续 */
function current(todayKey) {
  const today = todayKey || date.dateKey();
  const last = store.get(store.K.storyLast, null);
  if (last && last.key === today && typeof last.idx === 'number' && STORIES[last.idx]) {
    const s = STORIES[last.idx];
    return { idx: last.idx, total: STORIES.length, title: s.title, body: s.body };
  }
  return pick(today);
}

export { pick, another, current, dayIndex };

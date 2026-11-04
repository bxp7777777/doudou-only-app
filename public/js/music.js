/* 音乐氛围模块：
 * 1) 纯合成白噪音/柔音垫，零音频文件、零版权素材；
 * 2) 「今日一曲」纯文案板块（不出声），按日轮换、可换、可收藏、可打卡；
 * 3) 配置统一写 dd:music 前缀，复用现有云端快照自动同步。
 * 注意：本文件的纯数据/纯函数可在 Node 测试里直接 import；
 *       发声器只在浏览器点击后惰性创建 AudioContext，顶层绝不触碰 window。
 */
import * as store from './store.js';
import * as date from './date.js';

export const M_KEYS = {
  prefs: 'dd:music',
  tuneLast: 'dd:music:tune:last',
  tuneLog: 'dd:music:tune:log',
  favs: 'dd:music:fav'
};

/* ------------------------- 合成预设（纯数据，不含任何音频文件） ------------------------- */

export const PRESETS = [
  { key: 'rain', emoji: '🌧️', name: '细雨', desc: '窗边小雨，适合看书、写作业', kind: 'noise', freq: 1150, q: 0.55, swell: false, crackle: false, band: false },
  { key: 'ocean', emoji: '🌊', name: '海浪', desc: '潮水缓缓起落，放松肩颈', kind: 'noise', freq: 640, q: 0.7, swell: true, crackle: false, band: false },
  { key: 'campfire', emoji: '🔥', name: '篝火', desc: '轻轻噼啪，夜里有人陪', kind: 'noise', freq: 880, q: 0.8, swell: false, crackle: true, band: false },
  { key: 'forest', emoji: '🌲', name: '林间风', desc: '树叶沙沙，清爽安静', kind: 'noise', freq: 1550, q: 1.4, swell: true, crackle: false, band: true },
  { key: 'focus', emoji: '🎧', name: '专注薄嗡', desc: '很轻的底色，陪番茄钟沉下心', kind: 'pad', freqs: [174.61, 196.00] },
  { key: 'calm', emoji: '🌙', name: '助眠柔音', desc: '低柔长音，睡前慢慢放轻', kind: 'pad', freqs: [110.00, 138.59] }
];

export function presetByKey(key) {
  return PRESETS.find((p) => p.key === key) || PRESETS[0];
}

/* ------------------------- 偏好配置（dd:music，自动进云端快照） ------------------------- */

export const DEFAULT_PREFS = {
  preset: 'rain',
  volume: 0.6,
  autoFocus: true,
  focusPreset: 'focus',
  sleepMin: 0
};

export function getPrefs() {
  const raw = store.get(M_KEYS.prefs, null);
  return Object.assign({}, DEFAULT_PREFS, raw && typeof raw === 'object' ? raw : {});
}

export function setPref(patch) {
  const next = Object.assign({}, getPrefs(), patch || {});
  store.set(M_KEYS.prefs, next);
  return next;
}

/* ------------------------- 今日一曲（纯文案，不出声；原创意境短句，不引用版权曲目） ------------------------- */

export const DAILY_TUNES = [
  { title: '窗边细雨', vibe: '雨丝贴着玻璃慢慢滑，心里也跟着静下来。', scene: '写作业、看书、整理笔记时', note: '配细雨声，把节奏放慢一点。', rec: 'rain' },
  { title: '潮水起落', vibe: '一涨一落之间，肩颈悄悄松开。', scene: '累了、紧张了想放松时', note: '跟着呼吸，吸气像涨潮、呼气像退潮。', rec: 'ocean' },
  { title: '小堆篝火', vibe: '火光暖黄，噼啪声里有人陪着。', scene: '晚上独处、写日记时', note: '音量调小一点，像坐在旁边烤火。', rec: 'campfire' },
  { title: '林间有风', vibe: '树叶沙沙作响，空气是凉的、清的。', scene: '脑子发闷、想透气时', note: '想象自己站在树荫下，深呼吸三口。', rec: 'forest' },
  { title: '灯下专注', vibe: '世界被收进一盏小灯，只做眼前这一件事。', scene: '番茄钟开始专注时', note: '先定一个 25 分钟，做完再奖励自己。', rec: 'focus' },
  { title: '入夜柔光', vibe: '声音越来越低，身体一点点往下沉。', scene: '睡前半小时', note: '定时让它自己停下，别熬到困才躺。', rec: 'calm' },
  { title: '午后小雨', vibe: '外面潮润润的，屋里正好慢慢忙。', scene: '午后犯困、不想出门时', note: '先喝口温水，再开始下一件小事。', rec: 'rain' },
  { title: '远海平线', vibe: '海平线很远，烦心事也显得小了。', scene: '心里有点乱、需要拉开距离时', note: '听一会儿再决定要不要处理那件事。', rec: 'ocean' },
  { title: '暖炉小夜', vibe: '不用说话，被一点暖意裹着就很好。', scene: '情绪低落、想被陪着时', note: '对自己温柔一点，今天已经很努力。', rec: 'campfire' },
  { title: '清晨山林', vibe: '露水还在叶子上，新的一天很轻。', scene: '早起、想把状态调清爽时', note: '伸个懒腰，先喝半杯温水。', rec: 'forest' },
  { title: '书桌一角', vibe: '桌面干净，注意力就有地方落脚。', scene: '复习、做题、写论文时', note: '把手机放远，先做完 20 分钟。', rec: 'focus' },
  { title: '枕畔月色', vibe: '灯调暗了，思绪也不再追着跑。', scene: '躺床准备入睡时', note: '脑子里的事先写下，交给明天。', rec: 'calm' },
  { title: '屋檐滴水', vibe: '滴答声有规律，像有人轻轻打节拍。', scene: '静坐、发呆、放空时', note: '允许自己什么都不做一小会儿。', rec: 'rain' },
  { title: '浪边静坐', vibe: '浪花反复来又走，焦虑被一点点带走。', scene: '考试前紧张、心跳快时', note: '慢吸四秒、缓呼六秒，重复五轮。', rec: 'ocean' },
  { title: '旧毛衣与热茶', vibe: '毛茸茸的暖，适合裹住疲惫。', scene: '降温、手脚发凉时', note: '先把手脚捂暖，再坐回桌前。', rec: 'campfire' },
  { title: '竹林微风', vibe: '风穿过竹子，一节一节都是清的。', scene: '嗓子干、心情躁时', note: '小口抿温水，顺便远眺一会儿。', rec: 'forest' },
  { title: '一段攻坚', vibe: '难点虽慢，推进一点是一点。', scene: '卡壳、需要死磕时', note: '拆成小动作，完成一个就打个勾。', rec: 'focus' },
  { title: '轻轻靠岸', vibe: '不需要立刻睡着，放松躺着也算休息。', scene: '入睡困难、翻来覆去时', note: '不评价自己有没有睡着，放松就好。', rec: 'calm' },
  { title: '秋雨敲窗', vibe: '凉意透进来，刚好适合安静做事。', scene: '下班/下课后独自留一点时间时', note: '先把白天的累卸下来再吃东西。', rec: 'rain' },
  { title: '海边黄昏', vibe: '天色慢慢变暖，什么都可以缓一缓。', scene: '傍晚、想给自己一段缓冲时', note: '饭后慢走两分钟，别立刻坐下。', rec: 'ocean' },
  { title: '火堆旁的话', vibe: '想说的话不用急着说出口，先在心里暖一暖。', scene: '有点委屈、想被接住时', note: '写两笔进小日子，说出来会轻一些。', rec: 'campfire' },
  { title: '晨雾穿过树', vibe: '视野朦胧时，先看清最近的一步就够。', scene: '方向不明确、想太多时', note: '别规划太远，先完成今天最小一件事。', rec: 'forest' },
  { title: '静音自习室', vibe: '周围很静，笔尖和呼吸成为主角。', scene: '需要高度专注的任务时', note: '关掉无关页面，给自己一个番茄钟。', rec: 'focus' },
  { title: '睡意漫上来', vibe: '眼皮变重时，就顺着倦意躺平。', scene: '深夜还醒着、想催自己入睡时', note: '把手机放远些，灯光再调暗一点。', rec: 'calm' },
  { title: '雨后天青', vibe: '雨停之后空气干净，心里也透亮些。', scene: '难过过后慢慢恢复时', note: '先照顾身体：温水、热饭、早睡。', rec: 'rain' },
  { title: '潮汐日记', vibe: '情绪和潮水一样有涨落，不用和它对抗。', scene: '心情起伏、自我否定时', note: '这一阵会过去，不必逼自己立刻好起来。', rec: 'ocean' },
  { title: '星火点点', vibe: '很小的温暖也能攒成一片光。', scene: '记录当天一件小开心时', note: '睡前回想一件值得笑的小事。', rec: 'campfire' },
  { title: '风过草坡', vibe: '草叶起伏像呼吸，人也跟着松弛。', scene: '久坐僵硬、想活动前热身时', note: '起身拉伸两下，颈肩慢慢松开。', rec: 'forest' },
  { title: '稳扎稳打', vibe: '不求快，把基础打牢就很踏实。', scene: '练习技能、重复打磨时', note: '慢练比硬练有用，错了再来一遍。', rec: 'focus' },
  { title: '夜航归航', vibe: '外头再黑，也知道自己要往哪儿靠。', scene: '对未来有点慌、需要安定感时', note: '把近期目标缩小到今天可执行的一步。', rec: 'calm' },
  { title: '细雨补觉', vibe: '雨声白蒙蒙，适合补一个短午觉。', scene: '午休 20 分钟时', note: '别睡太久，醒了喝口水更清爽。', rec: 'rain' },
  { title: '海风送凉', vibe: '热意被吹散，思路也清爽起来。', scene: '午后燥热、注意力涣散时', note: '离开座位两分钟，洗把脸再回来。', rec: 'ocean' },
  { title: '围炉小叙', vibe: '和自己好好说说话，不责怪、不催促。', scene: '复盘一天、写小日子时', note: '先写做到的，再写想调整的。', rec: 'campfire' },
  { title: '松林慢步', vibe: '脚步放缓，杂念被枝叶滤掉一些。', scene: '散步、放松、换脑子时', note: '抬头远眺，让眼睛也歇口气。', rec: 'forest' },
  { title: '稳步前行', vibe: '每天一小步，离想要的结果更近一点。', scene: '长期准备、坚持练习时', note: '看连续天数，比看总进度更提气。', rec: 'focus' },
  { title: '深呼一口气', vibe: '胸腔松开，心跳不必那么急。', scene: '睡前做呼吸放松时', note: '吸气三秒、呼气六秒，重复八次。', rec: 'calm' },
  { title: '夜雨窗前', vibe: '安静只属于此刻，明天的事明天再说。', scene: '晚上收尾、停止刷手机时', note: '手头事先存好，慢慢进入休息状态。', rec: 'rain' },
  { title: '潮汐守恒', vibe: '付出和休息要像潮水一样交替。', scene: '连轴转、有点透支时', note: '今天允许自己提前收个尾。', rec: 'ocean' },
  { title: '微光续航', vibe: '吃口热的、歇一小会儿，电量就回来了。', scene: '傍晚疲惫、想吃点东西时', note: '温热七分饱，别用冰饮顶。', rec: 'campfire' },
  { title: '和风备忘', vibe: '把杂乱的想法逐条理顺，风就顺了。', scene: '整理待办、列计划时', note: '先写必须做的三件，其余排后面。', rec: 'forest' }
];

function dayIndex(key) {
  const k = key || date.dateKey();
  const t = date.parseKey(k);
  return Math.floor(t.getTime() / 86400000);
}

function tuneView(idx, total) {
  const item = DAILY_TUNES[((idx % total) + total) % total];
  return { idx, total, title: item.title, vibe: item.vibe, scene: item.scene, note: item.note, rec: item.rec };
}

/** 当天固定一首；跨天轮换；首次取篇写入 last */
export function currentTune(dayKey) {
  const today = dayKey || date.dateKey();
  const n = DAILY_TUNES.length;
  const last = store.get(M_KEYS.tuneLast, null);
  if (last && last.key === today && typeof last.idx === 'number' && DAILY_TUNES[last.idx]) {
    return tuneView(last.idx, n);
  }
  let idx = dayIndex(today) % n;
  store.set(M_KEYS.tuneLast, { key: today, idx });
  return tuneView(idx, n);
}

/** 手动换一首：向后顺延，不重复当前这首 */
export function anotherTune(dayKey) {
  const today = dayKey || date.dateKey();
  const n = DAILY_TUNES.length;
  const last = store.get(M_KEYS.tuneLast, null);
  let idx = last && typeof last.idx === 'number' ? (last.idx + 1) % n : dayIndex(today) % n;
  store.set(M_KEYS.tuneLast, { key: today, idx });
  return tuneView(idx, n);
}

/* ------------------------- 今日一曲：打卡日志 + 收藏（纯本地偏好，随 dd: 同步） ------------------------- */

export function markTuneDone(dayKey) {
  const today = dayKey || date.dateKey();
  const log = store.get(M_KEYS.tuneLog, { days: [] });
  if (!Array.isArray(log.days)) log.days = [];
  if (!log.days.includes(today)) log.days.push(today);
  store.set(M_KEYS.tuneLog, { days: log.days });
  return log.days.length;
}

export function isTuneDone(dayKey) {
  const today = dayKey || date.dateKey();
  const log = store.get(M_KEYS.tuneLog, { days: [] });
  return Array.isArray(log.days) && log.days.includes(today);
}

export function tuneDoneCount() {
  const log = store.get(M_KEYS.tuneLog, { days: [] });
  return Array.isArray(log.days) ? log.days.length : 0;
}

export function favList() {
  const favs = store.get(M_KEYS.favs, []);
  return Array.isArray(favs) ? favs : [];
}

export function isFav(idx) {
  return favList().includes(Number(idx));
}

export function toggleFav(idx) {
  const n = Number(idx);
  const favs = favList();
  const i = favs.indexOf(n);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(n);
  store.set(M_KEYS.favs, favs);
  return i < 0;
}

/* ========================= 浏览器侧：WebAudio 纯合成发声器（惰性、可静默降级） ========================= */

let ctx = null;
let master = null;
let active = null; // { key, kind, base, stopNodes() }

function audioSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
}

function ensureCtx() {
  if (!audioSupported()) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
      master = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

let sharedNoise = null;
function getNoiseBuffer(c) {
  if (sharedNoise) return sharedNoise;
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.025 * white) / 1.025;
    d[i] = last * 3.4;
  }
  sharedNoise = buf;
  return buf;
}

function stopNodes() {
  if (active && typeof active.stopNodes === 'function') {
    try { active.stopNodes(); } catch (err) { /* 忽略已释放节点 */ }
  }
  active = null;
}

function startNoise(p, level) {
  const c = ctx;
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = p.band ? 'bandpass' : 'lowpass';
  filter.frequency.value = p.freq;
  filter.Q.value = p.q || 0.6;
  const g = c.createGain();
  g.gain.value = 0.0001;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start();

  const extra = [];
  if (p.swell) {
    const lfo = c.createOscillator();
    lfo.frequency.value = 1 / 9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = level * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    lfo.start();
    extra.push(lfo);
  }
  let crackleTimer = null;
  if (p.crackle) {
    crackleTimer = setInterval(() => {
      if (!ctx) return;
      try {
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        const og = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 170 + Math.random() * 280;
        og.gain.setValueAtTime(0.0001, t);
        og.gain.exponentialRampToValueAtTime(level * 0.12, t + 0.005);
        og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        o.connect(og);
        og.connect(master);
        o.start(t);
        o.stop(t + 0.06);
      } catch (err) { /* 忽略单个噼啪声失败 */ }
    }, 430);
  }
  g.gain.setTargetAtTime(Math.max(0.01, level), c.currentTime, 0.7);

  return {
    key: p.key,
    kind: 'noise',
    base: level,
    stopNodes() {
      if (crackleTimer) clearInterval(crackleTimer);
      extra.forEach((n) => { try { n.stop(); } catch (err) {} });
      try { src.stop(); } catch (err) {}
      try { src.disconnect(); } catch (err) {}
    }
  };
}

function startPad(p, level) {
  const c = ctx;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 860;
  const g = c.createGain();
  g.gain.value = 0.0001;
  filter.connect(g);
  g.connect(master);
  const oscs = (p.freqs || []).map((freq, i) => {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const og = c.createGain();
    og.gain.value = i === 0 ? 1 : 0.55;
    o.connect(og);
    og.connect(filter);
    o.start();
    return o;
  });
  g.gain.setTargetAtTime(Math.max(0.01, level), c.currentTime, 1.4);

  return {
    key: p.key,
    kind: 'pad',
    base: level,
    stopNodes() {
      oscs.forEach((o) => { try { o.stop(); } catch (err) {} });
    }
  };
}

/** 播放指定预设；不支持音频的环境静默返回 false */
export function start(key) {
  const c = ensureCtx();
  if (!c) return false;
  stopNodes();
  const p = presetByKey(key);
  const vol = Number(getPrefs().volume);
  const safeVol = Number.isFinite(vol) ? Math.min(1, Math.max(0.2, vol)) : 0.6;
  const level = p.kind === 'pad' ? 0.05 : 0.16;
  active = p.kind === 'pad' ? startPad(p, level) : startNoise(p, level);
  try { master.gain.setTargetAtTime(safeVol, c.currentTime, 0.5); } catch (err) {}
  return true;
}

/** 淡出停止；fadeMs 毫秒内柔和收声 */
export function stop(fadeMs = 500) {
  if (!ctx || !master || !active) return;
  const old = active;
  active = null;
  try {
    master.gain.setTargetAtTime(0.0001, ctx.currentTime, Math.max(0.04, fadeMs / 1000 / 3));
  } catch (err) {}
  setTimeout(() => old && old.stopNodes(), fadeMs + 260);
}

export function isPlaying() {
  return !!active;
}

export function currentKey() {
  return active ? active.key : null;
}

/** 实时调音量：主增益跟随用户偏好；节点增益保持音色基础电平 */
export function applyVolume() {
  if (!ctx || !master) return;
  const vol = Number(getPrefs().volume);
  const safeVol = Number.isFinite(vol) ? Math.min(1, Math.max(0.2, vol)) : 0.6;
  try { master.gain.setTargetAtTime(safeVol, ctx.currentTime, 0.12); } catch (err) {}
}

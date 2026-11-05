/* 养成小游戏冒烟测试：抽出 game.html 内联脚本，在最小 DOM 桩里跑一遍启动流程 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const FILE = path.join(process.cwd(), 'public', 'game.html');
if (!fs.existsSync(FILE)) {
  console.error('❌ 找不到 public/game.html');
  process.exit(1);
}
const html = fs.readFileSync(FILE, 'utf8');

const problems = [];
const check = (ok, msg) => {
  if (!ok) problems.push(msg);
};

/* ---------- DOM 桩 ---------- */

const mem = new Map();
const store = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  }
};

class El {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.innerHTML = '';
    this.textContent = '';
    this.innerText = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.children = [];
    this.childNodes = [];
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => '' };
    this.classList = {
      _set: new Set(),
      add(...c) {
        c.forEach((x) => this._set.add(x));
      },
      remove(...c) {
        c.forEach((x) => this._set.delete(x));
      },
      toggle(c) {
        if (this._set.has(c)) {
          this._set.delete(c);
          return false;
        }
        this._set.add(c);
        return true;
      },
      contains: (c) => this.classList._set.has(c)
    };
    this.className = '';
    this.parentNode = null;
    this.offsetWidth = 320;
    this.offsetHeight = 200;
    this.clientWidth = 320;
    this.clientHeight = 200;
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }
  addEventListener() {}
  removeEventListener() {}
  appendChild(el) {
    this.children.push(el);
    el.parentNode = this;
    return el;
  }
  insertBefore(el) {
    return this.appendChild(el);
  }
  removeChild(el) {
    this.children = this.children.filter((x) => x !== el);
    return el;
  }
  remove() {}
  setAttribute() {}
  getAttribute() {
    return null;
  }
  removeAttribute() {}
  hasAttribute() {
    return false;
  }
  querySelector() {
    return new El();
  }
  querySelectorAll() {
    return [];
  }
  closest() {
    return new El();
  }
  focus() {}
  blur() {}
  click() {}
  scrollIntoView() {}
  getBoundingClientRect() {
    return { top: 0, left: 0, width: 320, height: 200, right: 320, bottom: 200 };
  }
  animate() {
    return { cancel() {}, finish() {}, addEventListener() {} };
  }
  getContext() {
    return { fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {} };
  }
  set onload(fn) {}
}

const nodes = new Map();
const getNode = (id) => {
  if (!nodes.has(id)) nodes.set(id, new El());
  return nodes.get(id);
};

const docHandlers = [];
const winHandlers = [];
const documentStub = {
  readyState: 'complete',
  getElementById: getNode,
  querySelector: (sel) => getNode('sel:' + sel),
  querySelectorAll: () => [],
  createElement: (t) => new El(t),
  createElementNS: (ns, t) => new El(t),
  createTextNode: (t) => ({ textContent: t }),
  getElementsByTagName: () => [],
  getElementsByClassName: () => [],
  addEventListener: (type, fn) => docHandlers.push([type, fn]),
  removeEventListener() {},
  body: new El('body'),
  documentElement: new El('html'),
  head: new El('head'),
  title: '萌宠养成'
};

const listeners = {};
const windowStub = {
  innerWidth: 390,
  innerHeight: 844,
  devicePixelRatio: 2,
  location: { href: 'http://localhost/game.html', hash: '', search: '', hostname: 'localhost', protocol: 'http:' },
  history: { pushState() {}, replaceState() {} },
  document: documentStub,
  localStorage: store,
  sessionStorage: store,
  navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() }, language: 'zh-CN' },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 0),
  cancelAnimationFrame: (id) => clearTimeout(id),
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener: (type, fn) => winHandlers.push([type, fn]),
  removeEventListener() {},
  alert() {},
  confirm: () => true,
  prompt: () => '',
  scrollTo() {},
  open() {},
  performance: { now: () => Date.now() },
  AudioContext: class {
    constructor() {
      this.currentTime = 0;
      this.destination = {};
      this.state = 'running';
    }
    createOscillator() {
      return { type: '', frequency: { value: 440, setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {} };
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
};
windowStub.window = windowStub;

globalThis.window = windowStub;
globalThis.document = documentStub;
globalThis.localStorage = store;
globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;
globalThis.getComputedStyle = windowStub.getComputedStyle;
globalThis.performance = windowStub.performance;
globalThis.alert = () => {};
// Node 24 自带只读 navigator，不去覆盖它；游戏里用到的地方（如复制）只在点击时触发

/* ---------- 抽出内联脚本并执行 ---------- */

const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
check(scripts.length > 0, 'game.html 里没有内联脚本');
const code = scripts.join('\n;\n');
fs.writeFileSync(path.join(process.env.TEMP || '.', 'game-inline-check.js'), code, 'utf8');
console.log('内联脚本', code.length, '字符，', code.split('\n').length, '行');

let threw = null;
try {
  vm.runInThisContext(code, { filename: 'game-inline.js' });
} catch (err) {
  threw = err;
}
check(!threw, '启动脚本抛异常：' + (threw && (threw.stack || threw.message)));

/* 触发 DOMContentLoaded / load */
for (const [type, fn] of [...docHandlers, ...winHandlers]) {
  if (type === 'DOMContentLoaded' || type === 'load') {
    try {
      fn({ type });
    } catch (err) {
      threw = threw || err;
      check(false, `事件 ${type} 回调抛异常：${err.message}`);
    }
  }
}

await new Promise((r) => setTimeout(r, 120));

/* ---------- 内容检查 ---------- */

const text = html;
const required = [
  ['金币', '资源栏金币'],
  ['钻石', '资源栏钻石'],
  ['经验果', '经验果'],
  ['体力', '体力/挑战次数'],
  ['猪猪', '招牌小猪'],
  ['金毛', '招牌小金毛'],
  ['柴犬', '种族柴犬'],
  ['橘猫', '种族橘猫'],
  ['垂耳兔', '种族垂耳兔'],
  ['仓鼠', '种族仓鼠'],
  ['熊猫', '种族熊猫'],
  ['狐狸', '种族狐狸'],
  ['绵羊', '种族绵羊'],
  ['水獭', '种族水獭'],
  ['小龙', '种族小龙'],
  ['小凤', '种族小凤'],
  ['SSR', '稀有度 SSR'],
  ['进化', '进化系统'],
  ['升星', '升星系统'],
  ['装备', '装备系统'],
  ['羁绊', '羁绊系统'],
  ['亲密度', '亲密度'],
  ['爬塔', '爬塔模式'],
  ['竞技场', '竞技场'],
  ['奇遇', '奇遇事件'],
  ['图鉴', '图鉴'],
  ['成就', '成就系统'],
  ['转生', '转生'],
  ['签到', '七日签到'],
  ['存档', '存档导出/导入'],
  ['离线', '离线收益']
];
for (const [needle, label] of required) check(text.includes(needle), `缺「${label}」（${needle}）`);

const rendered = [...nodes.entries()]
  .map(([id, el]) => [id, (el.innerHTML || '').length + (el.textContent || '').length])
  .sort((a, b) => b[1] - a[1]);
check(rendered.length > 0 && rendered[0][1] > 200, '启动后没有任何容器渲染出内容');
if (rendered[0]) console.log('最大渲染容器:', rendered[0][0], rendered[0][1], '字符');

/* 数据量：宠物 ≥20、成就 200、奇遇 ≥50 */
function countArray(name) {
  const start = text.indexOf('const ' + name + ' = [');
  if (start < 0) return -1;
  const end = text.indexOf('\n];', start);
  const block = text.slice(start, end < 0 ? undefined : end);
  return (block.match(/^ {2}\{/gm) || []).length;
}
const pets = countArray('PETS');
const achs = countArray('ACHIEVEMENTS');
const encs = countArray('ENCOUNTERS');
console.log('宠物', pets, '· 成就', achs, '· 奇遇', encs);
check(pets >= 20, `宠物不足 20：${pets}`);
check(achs === 200, `成就应为 200：实际 ${achs}`);
check(encs >= 50, `奇遇不足 50：${encs}`);
check(text.includes('ddgame'), '存档没用 ddgame 前缀');
check(text.includes('musicStyle'), '游戏缺背景音乐风格字段');
check(text.includes('setMusicStyle'), '游戏缺风格切换函数');

/* ⭐ 设为主宠只做重排：不能把同一只同时塞进前排和后排（旧写法会重复，主页出现两只一样的） */
if (typeof globalThis.createPet === 'function' && typeof globalThis.setMain === 'function') {
  for (const id of ['pig', 'golden', 'shiba', 'fox', 'rabbit']) globalThis.createPet(id, { autoDeploy: true });
  const team0 = globalThis.getTeamPets().map((p) => p.uid);
  check(team0.length === 5, '上阵 5 只后队伍应为 5 只，实际 ' + team0.length);
  const target = team0[1];
  globalThis.setMain(target);
  const team1 = globalThis.getTeamPets().map((p) => p.uid);
  check(team1[0] === target, '设为主宠后应排到第一位');
  check(new Set(team1).size === team1.length, '设为主宠后队伍出现重复：' + team1.join(','));
  check(team1.length === team0.length, '设为主宠后队伍数量应保持不变');
}

/* 透明底抠图：立绘优先 art/pets/<id>.png（四周无白边），缺失才退回 .jpg；40 只必须都有 png */
if (typeof globalThis.petArtCandidates === 'function') {
  const cand = globalThis.petArtCandidates('pig');
  check(cand[0] === 'art/pets/pig.png', '立绘应优先透明底 PNG，实际 ' + cand[0]);
  check(cand[1] === 'art/pets/pig.jpg', 'PNG 缺失时应回退 JPG，实际 ' + cand[1]);
  check(globalThis.petArtCandidates('__none__').length === 0, '未登记立绘不应返回候选链');
  const artDir = path.join(process.cwd(), 'public', 'art', 'pets');
  const ids = ['pig', 'golden', 'shiba', 'orange', 'rabbit', 'hamster', 'panda', 'fox', 'sheep', 'otter', 'dragon', 'phoenix', 'turtle', 'bee', 'owl', 'deer', 'koi', 'lion', 'unicorn', 'goat', 'gull', 'flysquirrel', 'sparrow', 'moth', 'albatross', 'penguin', 'seal', 'arcticfox', 'polarbear', 'walrus', 'koala', 'flamingo', 'octopus', 'mushroom', 'bat', 'lynx', 'alpaca', 'mole', 'jellyfish', 'peacock'];
  const missing = ids.filter((id) => !fs.existsSync(path.join(artDir, id + '.png')));
  check(missing.length === 0, '缺少抠图 PNG：' + missing.join(','));
  // 立绘统一 640×640：低于这个尺寸在 2x 屏会发虚，高了白白増体积
  const badSize = ids.filter((id) => {
    const buf = fs.readFileSync(path.join(artDir, id + '.png'));
    return buf.readUInt32BE(16) !== 640 || buf.readUInt32BE(20) !== 640;
  });
  check(badSize.length === 0, '抠图 PNG 尺寸应为 640×640：' + badSize.join(','));
  check(text.includes('.home-pet-img{border-radius:50%;object-fit:cover;background:transparent'), '主页主宠头像不应再铺奶白底（抠图后会在四周露白）');
  // 小怪 / Boss 走同一套候选链：透明底 PNG 优先，缺图自动回退 JPG
  if (typeof globalThis.mobArtCandidates === 'function' && typeof globalThis.bossArtCandidates === 'function') {
    const mc = globalThis.mobArtCandidates('aurora_wolf');
    const bc = globalThis.bossArtCandidates('caramel_fox');
    // 目前小怪 / Boss 还没有抠图，候选链应只有 JPG（不能白 404 一次）；登记后自动变 PNG 优先
    check(mc.length === 1 && mc[0] === 'art/mobs/aurora_wolf.jpg', '小怪未登记抠图时应只走 JPG：' + mc.join(','));
    check(bc.length === 1 && bc[0] === 'art/bosses/caramel_fox.jpg', 'Boss 未登记抠图时应只走 JPG：' + bc.join(','));
    check(text.includes('const MOB_ART_PNG = {}') && text.includes('const BOSS_ART_PNG = {}') && text.includes('const PET_ART_PNG = {'), '缺少 PNG 抠图就绪登记表');
    check(globalThis.mobArtCandidates('__none__').length === 0, '未登记的小怪不应返回候选链');
  }
}

/* 关卡结构：10 章 × 7 关 = 70 关，每章最后一关是首领；第 1 章难度系数 2.0×，前两关再软 0.82 */
if (typeof globalThis.getStage === 'function' && typeof globalThis.stageEnemyPower === 'function') {
  let total = 0;
  for (let i = 1; i <= 100; i++) {
    const st = globalThis.getStage(i);
    if (!st || st.index !== i) break;
    total = i;
  }
  check(total === 70, '主线应为 70 关（10 章 × 7），实际 ' + total);
  const perChapter = new Map();
  for (let i = 1; i <= total; i++) {
    const st = globalThis.getStage(i);
    if (!perChapter.has(st.chapter)) perChapter.set(st.chapter, []);
    perChapter.get(st.chapter).push(st);
  }
  check(perChapter.size === 10, '主线应为 10 章，实际 ' + perChapter.size);
  for (const [ch, list] of perChapter) {
    check(list.length === 7, '第 ' + ch + ' 章应为 7 关，实际 ' + list.length);
    check(list[6].type === 'boss', '第 ' + ch + ' 章最后一关应是首领，实际 ' + list[6].type);
    check(list.filter((s) => s.type === 'elite').length === 2, '第 ' + ch + ' 章应有 2 个精英关');
    check(list.filter((s) => s.type === 'mob').length === 4, '第 ' + ch + ' 章应有 4 个小怪关');
  }
  const s11 = globalThis.getStage(1);
  const expect11 = Math.round(s11.recPower * 2.0 * 0.92);
  check(globalThis.stageEnemyPower(s11) === expect11, '1-1 敌人战力应为 recPower×2.0×小怪系数，实际 ' + globalThis.stageEnemyPower(s11));
  const s1070 = globalThis.getStage(70);
  const expectFinal = Math.round(s1070.recPower * 0.84 * 1.08);
  check(globalThis.stageEnemyPower(s1070) === expectFinal, '第 10 章首领敌人战力应为 recPower×0.84×首领系数，实际 ' + globalThis.stageEnemyPower(s1070));
}

/* 旧存档（5 关/章）迁移：第 5 关的首领要落到新布局的最后一关，不能退回前面重打 */
if (typeof globalThis.migrateStageLayout5 === 'function') {
  const migrated = globalThis.migrateStageLayout5({ maxCleared: 25, stars: { 23: 3, 25: 2, 5: 3, 49: 1 } });
  check(migrated.maxCleared === 35, '旧存档第 5 章首领应迁移到第 35 关，实际 ' + migrated.maxCleared);
  check(migrated.stars[35] === 2, '旧存档首领关星星应搬到第 35 关');
  check(migrated.stars[31] === 3, '旧存档第 23 关应迁移到第 31 关');
  check(migrated.stars[7] === 3, '旧存档第 1 章首领应迁移到第 7 关');
  check(migrated.stars[67] === 1, '旧存档第 10 章第 4 关应迁移到第 67 关');
  check(migrated.layout === 7, '迁移后应记录新布局 7 关/章');
}

/* 竞技商店：4 件养成材料、每日限购、入口按钮与购买动作都接上了 */
{
  const shopBlock = text.slice(text.indexOf('const ARENA_SHOP = ['), text.indexOf('const ARENA_SHOP_MAP'));
  check((shopBlock.match(/\{ id: '/g) || []).length === 4, '竞技商店应有 4 件商品');
  check(shopBlock.includes("reward: { stonesRandom: 3 }") && shopBlock.includes("reward: { challenge: 2 }"), '竞技商店应能换进化石与挑战券');
  check(text.includes("case 'buyArenaItem': buyArenaItem(target.dataset.id); break;"), '竞技商店缺少购买动作分发');
  check(text.includes("id: 'arena', name: '竞技'"), '商店缺少「竞技」子页');
  check(text.includes('function arenaShopReset') && text.includes('shopCount'), '竞技商店缺少每日限购计数');
  check(text.includes('lastWinBonusDate'), '竞技场缺少每日首胜记录字段');
  check(text.includes('const factors = [0.85, 0.95, 1.05]'), '竞技场对手战力档位应为 85%/95%/105%');
}

/* 经济与手感打包：挂机 ÷15、扫荡 2 体力、经验果转化、升星要金币、一键升级、关卡推荐强度 */
{
  check(text.includes('const IDLE_RATE_DIVISOR = 15;'), '挂机产出应除以 15');
  check(text.includes('/ IDLE_RATE_DIVISOR'), '挂机金币与果实都要除以 15');
  check(text.includes('const SWEEP_STAMINA_COST = 2;'), '扫荡应只消耗 2 体力');
  check(text.includes('spendStamina(SWEEP_STAMINA_COST)'), '扫荡扣体力应使用扫荡消耗');
  check(text.includes("id: 'fruitStar'") && text.includes('function exchangeFruit'), '经验果转化功能缺失');
  check(text.includes('function starGoldCost'), '升星应额外消耗金币');
  check(text.includes('function levelUpTeam') && text.includes('data-act="levelTeam"'), '缺少一键升级队伍');
  check(text.includes('function stageAdvice') && text.includes('推荐强度'), '缺少关卡推荐强度提示');
  check(text.includes("metric: 'stageClears'"), '每日清剿任务应可用通关完成');
  check(text.includes('wantPower / got'), '敌人战力应按真实战力二次校准');
}

if (problems.length) {
  console.error('❌ 游戏冒烟 ' + problems.length + ' 条问题：');
  problems.slice(0, 20).forEach((p) => console.error(' - ' + p));
  process.exit(1);
}

console.log('✅ 游戏冒烟通过：内联脚本可执行、启动无异常、资源栏/12 种族/核心系统文案齐全');
console.log('   文件大小 ' + fs.statSync(FILE).size + ' 字节');
process.exit(0);
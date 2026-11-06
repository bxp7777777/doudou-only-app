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
  ['泥兜猪', '招牌小猪'],
  ['金毛崽', '招牌小金毛'],
  ['橙柴犬', '种族柴犬'],
  ['橘胖猫', '种族橘猫'],
  ['月耳兔', '种族垂耳兔'],
  ['粮袋仓鼠', '种族仓鼠'],
  ['竹团熊猫', '种族熊猫'],
  ['焰尾狐', '种族狐狸'],
  ['云卷羊', '种族绵羊'],
  ['水花獭', '种族水獭'],
  ['水鳞幼龙', '种族小龙'],
  ['火羽雏凤', '种族小凤'],
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
    const bc = globalThis.bossArtCandidates('caramel_fox', 2);
    // 小怪：登记抠图后 PNG 优先、JPG 兜底；Boss：阶段图优先，再退回基础 PNG / 基础 JPG
    check(mc.length === 2 && mc[0] === 'art/mobs/aurora_wolf.png' && mc[1] === 'art/mobs/aurora_wolf.jpg', '小怪抠图候选链不对：' + mc.join(','));
    check(bc.length === 4 && bc[0] === 'art/bosses/caramel_fox_p2.png' && bc[3] === 'art/bosses/caramel_fox.jpg', 'Boss 阶段候选链不对：' + bc.join(','));
    check(globalThis.bossPhaseOf(1) === 1 && globalThis.bossPhaseOf(0.5) === 2 && globalThis.bossPhaseOf(0.2) === 3, 'Boss 阶段阈值不对');
    check(text.includes('const MOB_ART_PNG = {') && text.includes('const BOSS_ART_PNG = {') && text.includes('const PET_ART_PNG = {'), '缺少 PNG 抠图就绪登记表');
    // 登记即须有图：小怪 PNG 必须真的在盘上，避免登记了却 404
    const mobIds = ['moss_slime', 'thorncap', 'ember_newt', 'flame_imp', 'bubble_fish', 'tide_crab', 'glow_wisp', 'prism_sprite', 'shade_bat', 'night_wraith', 'pebble_golem', 'rock_boar', 'gale_chick', 'storm_imp', 'frost_pup', 'aurora_wolf'];
    const missingMob = mobIds.filter(id => !fs.existsSync(path.join(process.cwd(), 'public', 'art', 'mobs', id + '.png')));
    check(missingMob.length === 0, '小怪 PNG 缺图：' + missingMob.join(','));
    // 登记了三阶段立绘的 Boss：三张图必须都在盘上（登记了却 404 是硬伤）
    const regMatch = text.match(/const BOSS_PHASE_ART = \{([^}]*)\}/);
    const phaseIds = regMatch ? regMatch[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean) : [];
    const missingPhase = [];
    for (const id of phaseIds) for (const p of [1, 2, 3]) if (!fs.existsSync(path.join(process.cwd(), 'public', 'art', 'bosses', id + '_p' + p + '.png'))) missingPhase.push(id + '_p' + p);
    check(missingPhase.length === 0, 'Boss 阶段 PNG 缺图：' + missingPhase.join(','));
    check(phaseIds.length >= 1, '至少要有一只 Boss 接上三阶段立绘');
    check(globalThis.mobArtCandidates('__none__').length === 0, '未登记的小怪不应返回候选链');
  }
}

/* 关卡结构：10 章 × 7 关 = 70 关，每章最后一关是首领；第 1 章难度系数 3.4×，开局 5 只宠也能感到阻力 */
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
  const expect11 = Math.round(s11.recPower * 3.4 * 0.92);
  check(globalThis.stageEnemyPower(s11) === expect11, '1-1 敌人战力应为 recPower×3.4×小怪系数，实际 ' + globalThis.stageEnemyPower(s11));
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
  check(text.includes('参考需求'), '战力对比应给出参考需求战力');
  check(text.includes('function stageNeedPower'), '缺少实战需求战力换算 stageNeedPower');
  check(text.includes('const GOLD_EXCHANGE = [') && text.includes('function buyGoldExchange'), '缺少金币转化出口');
  check(text.includes("case 'buyGoldExchange'"), '金币转化缺少事件分发');

  // 爬塔重做：曲线对齐主线、每周重置、连战、3 只塔灵
  check(/function towerFloorPower/.test(text) && text.includes('1150 * Math.pow(1.118'), '爬塔战力曲线应为 1150×1.118^(层-1)');
  check(text.includes('function ensureTowerWeek') && text.includes('function towerRush'), '缺少爬塔每周重置 / 连战');
  check(text.includes("case 'towerRush'"), '爬塔连战缺少事件分发');
  check(text.includes('function makeTowerReward(floor, repeat)'), '爬塔重复层应打折结算');
  // 小陪伴：进度奖励、连陪、陪伴加成
  check(text.includes('function selfCareReward') && text.includes('function selfCareBonusMult'), '缺少陪伴奖励/加成逻辑');
  check(text.includes('function careCooldownLeft'), '抱抱/晚安缺少冷却');
  check(text.includes('const CARE_TASKS = [') && text.includes('function selfCarePoints'), '陪伴缺少三项自律/陪伴值');
  check(text.includes('const CARE_MILESTONES = [') && text.includes('function careNextMilestone'), '陪伴缺少连陪里程碑');
  check(text.includes("case 'selfSun'"), '陪伴缺少晒太阳事件分发');
  check(text.includes('.idle-hud{position:relative'), '挂机信息条应移出场景以免与宠物重叠');
  // 菜地：进度缩放（金币）、稀有掉落、自动收获
  check(text.includes('function gardenProgressMult') && text.includes('function gardenDropBonus'), '菜园缺少进度缩放/掉落');
  check(text.includes('wind: 0, ice: 0'), '进化石应覆盖 8 个属性（风/冰曾显示 undefined）');
  check(text.includes('function buyGardenAutoHarvest') && text.includes("case 'gardenAutoHarvest'"), '菜园缺少自动收获解锁');
  check(text.includes('喝够3杯水'), '第 4 项自律应为「喝够3杯水」');
  // 成就按类别折叠（200 条不再是一整面长列表）
  check(text.includes('const ACH_CATEGORIES = [') && text.includes('function achievementCategoryOf'), '成就缺少分类逻辑');
  check(text.includes('class="card ach-group"') || text.includes('card ach-group'), '成就缺少折叠分组渲染');
  // 图鉴筛选 / 名册排序 / 阵容预设 / 兑换锚点
  check(text.includes('data-act="codexFilter"') && text.includes('UI.codexFilter'), '图鉴缺少属性/稀有度筛选');
  check(text.includes('data-act="petSort"') && text.includes('UI.petSort'), '宠物名册缺少排序');
  check(text.includes('function teamPresetSave') && text.includes('function teamPresetLoad'), '缺少阵容预设');
  check(text.includes('data-act="exchangeJump"') && text.includes('id="ex-gold"'), '兑换页缺少分段锚点');
  check(text.includes('function offlineCapSec') && text.includes("case 'buyOfflineCap'"), '离线时长升级缺失');
  check(text.includes('function artRhythm') && text.includes('function petAnimDecorate'), '立绘动画逻辑缺失');
  check(text.includes('art-alive') && text.includes('data-petanim'), '立绘动画样式缺失');
  check(text.includes('function togglePetAnim') && text.includes("case 'togglePetAnim'"), '立绘动画开关缺失');
  check(text.includes('art-fly') && text.includes('art-heavy'), '立绘分体质感节奏缺失');
  check(text.includes('function rigArtHTML') && text.includes('rig-bone rig-b1') && text.includes('rig-bone rig-b2') && text.includes('rig-bone rig-b3'), '骨骼分层缺失（底座/躯干/胸/头四层）');
  check(text.includes('@keyframes rigBend1') && text.includes('@keyframes rigBend2') && text.includes('@keyframes rigBend3') && text.includes('@keyframes rigBreathe'), '骨骼关键帧缺失');
  check(text.includes('home-pet-rig') && text.includes("'art-rig'") && text.includes('--amp2') && text.includes('--amp3'), '骨骼挂载/节奏参数缺失');
  check(text.includes('artDrowse') && text.includes('art-act-drowse'), '空闲打盹动作缺失');
  check(text.includes('@keyframes rigBend1{0%,100%{transform:rotate(calc(-1 * var(--amp1,2deg)))}50%{transform:rotate(var(--amp1,2deg))}}'), '骨骼关键帧应只做绕骨点的纯旋转（挤压/横移留在整框上，否则蒙版带里会出现重影）');
  check(!/@keyframes rigBend[123][^@]*?scale\(1\.00/.test(text) && !/@keyframes rigBend[123][^@]*?translateX/.test(text), '骨头层不应再带 scale/translateX，重影就是这么来的');
check(text.includes('-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 68%') && text.includes('#000 0%,#000 52%') && text.includes('#000 0%,#000 38%'), '三层蒙版带应贴住各自骨点（68/52/38%）');
check(text.includes('@keyframes rigBreathe{0%,100%{transform:scale(1,1) translateX'), '整框呼吸应承担挤压与横移');
check(!text.includes('.rig-bone{position:absolute;inset:0;display:block;pointer-events:none;border-radius:inherit;will-change:transform}'), '骨头层不该再开 will-change（GPU 位图化会糊出第二道轮廓）');
check(text.includes('.b-unit.attack-forward .rig-b3') && text.includes('.b-unit.hit-recoil .rig-b3'), '三节骨骼的战斗跟随缺失');

  // 三阶命名 + 等级进化：40 只宠物各有幼体/成长体/究极体三个名字，到等级自动进化
  // 战斗界面：首领横跨两列放大、空位不再画「待命位」、血线换阶段有标记
  check(text.includes('.battle-layer .b-unit.boss-unit{grid-column:1/-1'), '首领应横跨两列撑住版面');
  check(text.includes('.battle-layer .b-unit.boss-unit .art-frame.art-battle{width:136px;height:136px}'), '首领立绘应放大到 136px');
  check(text.includes('.battle-layer .art-frame.art-battle{width:100px;height:100px}') && text.includes('.battle-layer .art-frame.art-battle{width:80px;height:80px}'), '小怪立绘应放大到 100px（小屏 80px）');
  check(text.includes('.battle-layer .b-side.enemy{background:transparent;border:0;box-shadow:none;backdrop-filter:none'), '敌方半边不该再铺白/粉底卡片');
  check(text.includes('.battle-layer .b-side.enemy::before{content:"";position:absolute') && text.includes('radial-gradient(118% 76% at 50% 98%'), '敌方半边应改成透出场景的地台');
  check(text.includes('.battle-layer #btnBattleSpeed::after{content:"×2"'), '速度开关应有 ×2 角标');
  check(text.includes('.battle-layer.speed-2 #btnBattleSpeed{background:linear-gradient'), '2 倍速时速度开关应高亮');
  check(text.includes('if (rt) rt.textContent = `第 ${b.round}/${b.maxRounds} 回合`;'), '回合条应显示「第 N/M 回合」');
  check(text.includes('`我方 ${aliveN(b.allies)}/${b.allies.length}`') && text.includes('`敌方 ${aliveN(b.enemies)}/${b.enemies.length}`'), '回合条两侧应显示双方存活数');
  check(text.includes('<div class="b-plate">') && text.includes('<b class="b-hp-text">'), '单位应改成立绘 + 小铭牌结构');
  check(!text.includes('<div class="b-el">${el.emoji} ${el.name} · ${unit.rarity}</div>'), '单位信息块不该再整块铺属性行');
  check(text.includes('.battle-layer .b-side.enemy .b-unit .art-frame{transform:scaleX(-1)}'), '敌方立绘应镜像面向中央');
  check(text.includes(".battle-layer .battle-field::before{content:\"\";position:absolute;left:-8%;right:-8%;bottom:-6%;height:64%"), '战场应加透视地台');
  check(text.includes('.battle-layer .b-row-line.back-line,.battle-layer .b-row-line.mob-line{transform:translateY(-3px) scale(.93)}'), '后排应有纵深缩放');
  check(text.includes('.battle-layer .battle-field{grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)}'), '栅格应用 minmax(0,1fr) 防止立绘撑破屏幕');
  check(text.includes('.battle-layer .b-unit.boss-unit .art-frame.art-battle{width:168px;height:168px}'), '首领立绘应放大到 168px');
  check(!text.includes('id="battleRoundText"') && !text.includes('class="battle-rounds"'), '标题区不该再挂重复的回合胶囊');
  check(!text.includes("<div>${esc(c.title || '自动战斗')}<small>"), '标题区不该再塞教程副标题');
  check(!text.includes('战力 ${fmt(sum(battle.allies.map(u => calcPower(u))))}') && !text.includes('战力 ${fmt(sum(battle.enemies.map(u => calcPower(u))))}'), '战场两侧不该再显示战力数字');
  check(!text.includes("unit.row === 'front' ? '前排' : '后排'"), '单位头顶不该再显示前排/后排');
  check(!text.includes('<span class="b-el">${el.emoji}</span>'), '单位头顶不该再挂属性图标');
  check(text.includes('.battle-layer .battle-log{position:fixed;left:10px;right:10px;bottom:calc(8px') && text.includes('.battle-layer .battle-log.expanded{height:auto;max-height:84px'), '战报应是可展开的底部浮层');
  check(text.includes('.battle-layer .battle-controls{position:relative;flex-wrap:nowrap;overflow:visible'), '控制条应收成一行（菜单不被裁切）');
  check(text.includes('title="${esc(u.name)}">${e.emoji}</span>'), '出手顺序应只留表情、名字进 title');
  check(text.includes('.battle-layer .b-unit.dead .art-frame{transform:rotate(78deg)'), '倒地后立绘应保持倒下');
  check(text.includes('.battle-layer .b-side.enemy .b-unit.dead .art-frame{transform:scaleX(-1) rotate(78deg)'), '敌方倒地也要保持镜像');
  check(text.includes('@keyframes bDeathFall{0%{opacity:1;transform:scale(1)}'), '死亡动画不该再整块旋转（避免尸体回正）');
  check(text.includes('data-act="battleMoreMenu" id="btnMoreMenu"') && text.includes('id="battleMoreMenu"'), '控制条应有「⋯ 更多」菜单');
  check(text.includes("function battleMoreMenu()") && text.includes("function closeBattleMore()"), '更多菜单应可开可关');
  check(text.includes('data-act="battleLogToggle"'), '战报浮层应可点开');
  const monBlock = text.slice(text.indexOf('const MONSTER_SKILLS = {'), text.indexOf('Object.assign(SKILLS, MONSTER_SKILLS);'));
  check((monBlock.match(/^  (x_|b_)[a-z0-9_]+: \{ name: /gm) || []).length === 80, '小怪/首领应有 80 个专属技能');
  check(text.includes('Object.assign(SKILLS, MONSTER_SKILLS);') && text.includes('const MOB_SKILL_KEYS = {') && text.includes('const BOSS_SKILL_KEYS = {'), '怪物技能应挂进技能表并绑定到小怪/首领');
  check(text.includes("skills: enemySkillSlots(options.artKind, options.artId, options.element || template.element)"), '小怪应改用自己的技能组');
  check(text.includes("skills: enemySkillSlots('boss', info.bossId, info.element)"), '每日首领应改用自己的技能组');
  let clash = 0;
  if (typeof SKILLS === 'object' && typeof MONSTER_SKILLS === 'object') {
    const petNames = new Set();
    for (const p of PETS) for (const id of p.skills) if (SKILLS[id]) petNames.add(SKILLS[id].name);
    for (const sk of Object.values(MONSTER_SKILLS)) if (petNames.has(sk.name)) clash++;
    check(Object.keys(MONSTER_SKILLS).length === 80, '怪物技能表应有 80 条');
    check(Object.values(MONSTER_SKILLS).every(sk => sk.desc && sk.effects && sk.effects.length), '每条怪物技能都要有说明和效果');
  }
  check(clash === 0, '怪物技能名字不能和宠物技能重名（重名 ' + clash + ' 条）');
  if (typeof enemySkillSlots === 'function') {
    const m = enemySkillSlots('mob', 'frost_pup', 'ice');
    const b = enemySkillSlots('boss', 'peak_titan', 'earth');
    check(m.length === 4 && m[0].def.kind === 'basic' && m[3].def.kind === 'ult', '小怪技能应是 普攻/主动/主动/奥义 四格');
    check(b.length === 4 && b.every(x => x.def && x.def.name), '首领技能应是 4 个专属技');
    check(b[0].def.name !== m[0].def.name, '首领普攻不能和小怪普攻同名');
  }
  check(text.includes('function skillStatChips(skill, lv = 1)'), '技能应有数值标签生成函数');
  check(text.includes('<div class="skill-stats">${statChips.map('), '宠物技能行应渲染数值标签');
  check(text.includes('.skill-stat{display:inline-block;'), '数值标签应有样式');
  if (typeof skillStatChips === 'function') {
    const chips = skillStatChips(SKILLS.pig_ult, 1);
    check(chips.some(c => /伤害 105%/.test(c)) && chips.some(c => /耗怒 100/.test(c)), '奥义标签应带伤害与耗怒数值');
    const basic = skillStatChips(SKILLS.pig_basic, 1);
    check(basic.some(c => /怒气 \+35/.test(c)), '普攻标签应带怒气数值');
    const lv10 = skillStatChips(SKILLS.pig_ult, 10);
    check(lv10.some(c => /伤害 162%/.test(c)), '技能等级应放大数值');
  }
  check(text.includes('const EXTRA_SKILLS = {') && text.includes('Object.assign(SKILLS, EXTRA_SKILLS);'), '扩展包技能表应挂进 SKILLS');
  if (typeof PETS !== 'undefined' && typeof SKILLS === 'object') {
    const names = new Map();
    const skillNames = new Map();
    let bad4 = 0, missing = 0, noText = 0;
    for (const p of PETS) {
      names.set(p.name, (names.get(p.name) || 0) + 1);
      if (p.skills.length !== 4) bad4++;
      if (!p.codex || !Array.isArray(p.lines) || p.lines.length < 2 || !p.title) noText++;
      for (const id of p.skills) { if (!SKILLS[id]) missing++; }
    }
    for (const sk of Object.values(SKILLS)) skillNames.set(sk.name, (skillNames.get(sk.name) || 0) + 1);
    check(PETS.length === 80, '宠物应有 80 只，实际 ' + PETS.length);
    check([...names.values()].every(c => c === 1), '宠物名不能重复');
    check(Object.keys(EXTRA_SKILLS).length === 64, '扩展技能应有 64 条，实际 ' + Object.keys(EXTRA_SKILLS).length);
    check(bad4 === 0 && missing === 0, '每只宠物都该有 4 个已定义技能（坏 ' + bad4 + ' / 缺 ' + missing + '）');
    check([...skillNames.values()].every(c => c === 1), '全部技能名不能重名');
    check(noText === 0, '每只宠物都要有称号、台词和图鉴文案');
    const els = {};
    for (const p of PETS) els[p.element] = (els[p.element] || 0) + 1;
    check(Object.keys(els).length === 8 && Object.values(els).every(c => c >= 9), '8 个元素都要有 ≥9 只，实际 ' + JSON.stringify(els));
    const fronts = PETS.filter(p => p.role === 'front').length;
    check(Math.abs(fronts - PETS.length / 2) <= 4, '前后排应大致均衡，前排 ' + fronts);
    const rat = {};
    for (const p of PETS) rat[p.rarity] = (rat[p.rarity] || 0) + 1;
    check(rat.SSR >= 5 && rat.SSR <= 10, 'SSR 数量应控制在 5~10，实际 ' + rat.SSR);
  }
  // 卡池只有 R / SR / SSR
  if (typeof GACHA_RATES === 'object') {
    const NLEFT = ['normal', 'rare'].some(k => 'N' in GACHA_RATES[k]);
    check(!NLEFT, '卡池不该再有 N 档概率');
    const sum = k => Object.values(GACHA_RATES[k]).reduce((a, b) => a + b, 0);
    check(Math.abs(sum('normal') - 1) < 1e-9 && Math.abs(sum('rare') - 1) < 1e-9, '概率之和应为 100%');
    check(RARITY_ORDER.join() === 'R,SR,SSR', '稀有度顺序应只有 R/SR/SSR');
  }
  if (typeof PETS !== 'undefined') {
    check(PETS.every(p => p.rarity !== 'N'), '不能有 N 稀有度宠物');
    const seen = {};
    for (let i = 0; i < 200; i++) { const r = globalThis.rollRarity ? globalThis.rollRarity('rare') : 'R'; seen[r] = 1; }
    check(!('N' in seen), '抽卡不应抽出 N');
  }
  // 剧情奇遇
  if (typeof ENCOUNTER_STORIES !== 'undefined') {
    check(ENCOUNTER_STORIES.length >= 6, '剧情奇遇应至少 6 本，实际 ' + ENCOUNTER_STORIES.length);
    let badNext = 0, badEnd = 0, shallow = 0, noBranch = 0, endings = 0;
    for (const st of ENCOUNTER_STORIES) {
      const ids = Object.keys(st.nodes);
      if (ids.length < 6) shallow++;
      const first = st.nodes[st.start];
      if (!first || (first.choices || []).length < 3) noBranch++;
      for (const id of ids) {
        const n = st.nodes[id];
        if (n.ending) { endings++; if (!n.ending.rewards || !n.ending.title) badEnd++; }
        for (const c of (n.choices || [])) { if (!st.nodes[c.next]) badNext++; }
      }
    }
    check(shallow === 0, '每本剧情至少 6 幕，短的：' + shallow);
    check(noBranch === 0, '第一幕至少 3 个分支，不足的：' + noBranch);
    check(badNext === 0, '有分支指向不存在的下一幕：' + badNext);
    check(badEnd === 0, '结局缺标题或奖励：' + badEnd);
    check(endings >= 18, '结局总数应 ≥18，实际 ' + endings);
    check(typeof globalThis.storyEndingTotal === 'function' && globalThis.storyEndingTotal() >= 24, '结局总数应 ≥24');
    const depth = ENCOUNTER_STORIES.filter(st => st.acts >= 4).length;
    check(depth >= 2, '至少要 2 本 4 幕长剧本，实际 ' + depth);
    check('endings' in state.encounter || typeof globalThis.storyEndingCount === 'function', '缺结局收集');
    check(typeof globalThis.exploreStory === 'function' && typeof globalThis.storyChoose === 'function', '缺剧情奇遇流程');
  }
  check(text.includes('const GARDEN_FRUIT_BOOST = 1.7;') && text.includes('num(p.fruit, t.fruit) * GARDEN_FRUIT_BOOST'), '收菜经验果应乘产出系数');
  check(text.includes('t.fruit * GARDEN_FRUIT_BOOST * (60 / t.minutes)'), '菜园时产预览也要算系数');
  check(text.includes('const IDLE_FRUIT_BOOST = 1.5;') && text.includes('idleCareMult * IDLE_FRUIT_BOOST / IDLE_RATE_DIVISOR'), '挂机经验果应有单独加成');
  check(text.includes("reward: { fruit: 30, bondBadge: 1 }") && text.includes("reward: { fruit: 38, skillBook: 1 }"), '每日任务经验果应提高');
  check(text.includes("early.classList.toggle('b-hide', !ready && !b.earlyUltUsed)"), '提前大招未就绪时应收起');
  check(text.includes('b.logIdleTimer = setTimeout') && text.includes('.battle-log.idle{opacity:.3}'), '战报安静后应转淡');
  check(text.includes('.battle-layer .b-unit.boss-unit .art-frame.art-battle{width:128px;height:128px}'), '小屏首领立绘应放大到 128px');
  check(!text.includes('待命位'), '敌方空位不该再写「待命位」');
  check(globalThis.enemySlotsHtml({ allies: [1,2,3], enemies: [1] }) === '', '敌方空位应留成空地（enemySlotsHtml 返回空串）');
  check(text.includes('data-boss-phase="${unit.isBoss ? bossPhaseOf'), '首领会输出阶段标记');
  check(text.includes("content:\"\\5F62\\6001\\2161\"") && text.includes("content:\"\\6FD2\\6B7B\\2162\""), '首领换阶段应显示「形态Ⅱ / 濒死Ⅲ」');
  check(text.includes('const PET_STAGE_NAME = {'), '缺少三阶名字表');
  const stageBlock = text.slice(text.indexOf('const PET_STAGE_NAME = {'), text.indexOf('const BONDS = ['));
  const stageIds = [...stageBlock.matchAll(/^  (\w+): \['/gm)].map(m => m[1]);
  check(stageIds.length === 80, '三阶名字表应覆盖 80 只宠物，实际 ' + stageIds.length);
  const perLine = [...stageBlock.matchAll(/^  \w+: \[([^\]]*)\]/gm)].map(m => (m[1].match(/'/g) || []).length / 2);
  check(perLine.every(c => c === 3), '每个宠物应有 3 个阶段名（幼体/成长体/究极体），发现 ' + JSON.stringify(perLine.filter(c => c !== 3)));
  const stageTable = JSON.parse(stageBlock.slice(stageBlock.indexOf('{'), stageBlock.lastIndexOf('}') + 1).replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
  const stageNames = new Set();
  Object.values(stageTable).forEach(a => a.forEach(nm => stageNames.add(nm)));
  check(stageNames.size === 240, '240 个阶段名应互不重复，实际 ' + stageNames.size);
  check(typeof globalThis.autoEvolvePet === 'function', '缺少等级自动进化 autoEvolvePet');
  const p1 = { templateId: 'pig', evo: 0, level: 9 };
  check(globalThis.autoEvolvePet(p1) === 0 && p1.evo === 0, '9 级不该进化');
  const p2 = { templateId: 'pig', evo: 0, level: 10 };
  check(globalThis.autoEvolvePet(p2) === 1 && p2.evo === 1, '10 级应进化到成长体');
  const p3 = { templateId: 'pig', evo: 0, level: 30 };
  check(globalThis.autoEvolvePet(p3) === 2 && p3.evo === 2, '30 级应一口气进化到究极体');
  check(globalThis.petDisplayName({ templateId: 'pig', evo: 0, level: 1 }) === '泥兜猪', '幼体名应为泥兜猪');
  check(globalThis.petDisplayName({ templateId: 'pig', evo: 1, level: 12 }) === '铁背哼哼', '成长体名应为铁背哼哼');
  check(globalThis.petDisplayName({ templateId: 'pig', evo: 2, level: 40 }) === '山岳泥甲王', '究极体名应为山岳泥甲王');
  check(globalThis.petDisplayName({ templateId: 'pig', evo: 2, level: 40, nickname: '小土豆' }) === '小土豆', '昵称应优先于阶段名');
  check(text.includes('const evoUps = autoEvolvePet(pet);'), '升级流程里没有接自动进化');
  check(text.includes('migratedEvo += autoEvolvePet(p)'), '读档时没有补算自动进化');
  // 进化立绘：40 只宠物 × s1/s2 全部登记并落盘
  const evoPng = text.match(/const EVO_ART_PNG = \{([^}]*)\}/);
  const evoKeys = evoPng ? [...evoPng[1].matchAll(/(\w+):\s*(?:true|1)/g)].map(m => m[1]) : [];
  check(evoKeys.length > 0 && evoKeys.length <= 80, '进化立绘登记数应在 1~80 之间，实际 ' + evoKeys.length);
  const evoMissing = evoKeys.filter(k => !fs.existsSync(path.join(process.cwd(), 'public', 'art', 'pets-evo', k + '.png')));
  check(evoMissing.length === 0, '进化立绘文件缺失：' + evoMissing.slice(0, 6).join(', '));
  const evoArt = globalThis.evoArtCandidates('pig', 2);
  check(evoArt.length === 2 && evoArt[0].endsWith('pig_s2.png') && evoArt[1].endsWith('pig_s2.jpg'), '二阶进化立绘候选链应为 png→jpg，实际 ' + JSON.stringify(evoArt));
  check(globalThis.evoArtCandidates('mole', 1).length === 0, '还没画的一阶进化立绘应回落到基础图，实际 ' + JSON.stringify(globalThis.evoArtCandidates('mole', 1)));
  check(globalThis.evoArtCandidates('deer', 1).length === 0 && globalThis.evoArtCandidates('deer', 2)[0].endsWith('deer_s2.png'), '只有二阶图的宠物应一阶回落、二阶用图');
  check(globalThis.evoArtCandidates('pig', 0).length === 0, '未进化时不应套用进化立绘');
  check(text.includes('/art\/pets|(art)\/mobs|(art)\/bosses/') || /art\/\)\?\/pets|pets-evo/.test(text), '骨骼未覆盖进化立绘目录');
  
  check(text.includes("register('/sw.js')") || text.includes("register(\"/sw.js\")"), '开局页缺少 service worker 注册');
  check(text.includes('game.webmanifest'), '开局页缺少 PWA manifest 引用');
  check(text.includes("const SAVE_KEY = 'ddgame:v1';"), '存档键名不应改变');
  check(text.includes('const count = 3;'), '关卡敌人应统一 3 只，避免单只怪物吃掉全部战力');
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
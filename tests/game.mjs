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

/* 数据量：宠物 ≥20、成就 200、奇遇 ≥15 */
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
check(encs >= 15, `奇遇不足 15：${encs}`);
check(text.includes('ddgame'), '存档没用 ddgame 前缀');
check(text.includes('musicStyle'), '游戏缺背景音乐风格字段');
check(text.includes('setMusicStyle'), '游戏缺风格切换函数');

if (problems.length) {
  console.error('❌ 游戏冒烟 ' + problems.length + ' 条问题：');
  problems.slice(0, 20).forEach((p) => console.error(' - ' + p));
  process.exit(1);
}

console.log('✅ 游戏冒烟通过：内联脚本可执行、启动无异常、资源栏/12 种族/核心系统文案齐全');
console.log('   文件大小 ' + fs.statSync(FILE).size + ' 字节');
process.exit(0);
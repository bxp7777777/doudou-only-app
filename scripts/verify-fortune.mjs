/**
 * 巨蟹座运势卡联网验收：真开一次 Edge（headless），按手机尺寸看页面。
 * 用法（先 npm start 起服务，或指定别的地址）：
 *   node scripts/verify-fortune.mjs
 *   BASE=http://127.0.0.1:4319 node scripts/verify-fortune.mjs
 * 会检查：联网态文案 / 三块明细 / 幸运小胶囊 / 本地池子宜忌 / 断网兜底 / 恢复联网。
 * 截图落在 shots/fortune-card.png。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 10227;
const SHOTS = path.join(process.cwd(), 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(process.env.TEMP || '.', 'doudou-fortune-' + Date.now()),
  BASE + '/#/story'
], { stdio: 'ignore' });

let tab = null;
for (let i = 0; i < 60 && !tab; i++) {
  await sleep(400);
  try {
    const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
    const page = list.find((x) => x.type === 'page' && x.url.includes(new URL(BASE).host));
    if (page) tab = page;
  } catch {}
}
if (!tab) {
  console.error('没连上浏览器调试端口，确认 Edge 装在本机，或设 EDGE_PATH');
  process.exit(1);
}

const sock = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
let seq = 0;
const pending = new Map();
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++seq; pending.set(i, res); sock.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r && r.result ? r.result.result.value : null;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

const results = [];
const check = (ok, msg) => results.push((ok ? '✅ ' : '❌ ') + msg);
const state = () => ev('(() => { const e = document.getElementById("signFortune"); return e && e.dataset ? e.dataset.state : ""; })()');
async function waitState(target, tries = 45) {
  for (let i = 0; i < tries; i++) {
    await sleep(300);
    if ((await state()) === target) return target;
  }
  return await state();
}

/* 1. 联网态 */
await send('Page.reload', { ignoreCache: true });
const st = await waitState('ok');
await sleep(400);
const main = await ev('document.getElementById("signFortune").textContent');
const aspectText = await ev('(document.querySelector("#signFortuneExtra .sign-aspects")||{}).textContent || ""');
const pills = await ev('[...document.querySelectorAll("#signFortuneExtra .sign-pill")].map(x => x.textContent)');
const notLine = await ev('(document.querySelector(".sign-not")||{}).textContent || ""');
const tip = await ev('(() => { const p = document.querySelectorAll(".sign-card .line")[0]; return p ? p.textContent : ""; })()');
const cardH = await ev('Math.round(document.querySelector(".sign-card").getBoundingClientRect().height)');

check(st === 'ok', '联网运势状态 ok（实际 ' + st + '）');
check(/[。！？]/.test(main) && main.length >= 8, '运势正文是真实联网文案：' + JSON.stringify(main));
check(/感情/.test(aspectText) && /工作/.test(aspectText) && /钱/.test(aspectText), '感情/工作/钱 三块明细都在');
check(Array.isArray(pills) && pills.length === 3, '幸运色/幸运数/贵人 三个小胶囊：' + JSON.stringify(pills));
check(/^今天不必：/.test(notLine), '「今天不必」一行正常');
check(/^今日[宜忌]：/.test(tip), '宜/忌提示来自 200 条池子：' + JSON.stringify(tip));
check(cardH < 400, '卡片高度 ' + cardH + 'px 未撑爆');

await ev('document.querySelector(".sign-card").scrollIntoView({block:"center"}); 1');
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(SHOTS, 'fortune-card.png'), Buffer.from(shot.result.data, 'base64'));

/* 2. 接口挂掉 → 温和兜底 */
await send('Network.setBlockedURLs', { urls: ['*/api/horoscope*'] });
await send('Page.reload', { ignoreCache: true });
const fb = await waitState('fallback');
await sleep(300);
const fbText = await ev('document.getElementById("signFortune").textContent');
const fbHidden = await ev('document.getElementById("signFortuneExtra").hidden');
check(fb === 'fallback' && fbText.includes('慢一点也没关系'), '接口挂掉时回落到温和兜底文案');
check(fbHidden === true, '兜底时明细行隐藏');
check(/^今日[宜忌]：/.test(await ev('(() => { const p = document.querySelectorAll(".sign-card .line")[0]; return p ? p.textContent : ""; })()')), '兜底时本地池子照常出内容');

/* 3. 放开网络 → 恢复真实运势 */
await send('Network.setBlockedURLs', { urls: [] });
await send('Page.reload', { ignoreCache: true });
check((await waitState('ok')) === 'ok', '放开网络后重新显示真实运势');

console.log(results.join('\n'));
sock.close();
child.kill();
process.exit(results.some((r) => r.startsWith('❌')) ? 1 : 0);
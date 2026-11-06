// 小怪 / Boss 立绘批量生成：OpenAI 兼容 images/generations → 落盘 art-src/monsters/<name>.png（原始白底，抠图交给 cutout-monster-art.py）
// 用法：node scripts/gen-monster-art.mjs [并发数] [只跑 mobs|bosses] [名字过滤]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOBS_FILE = process.argv[5] || 'monster-jobs.json';
const OUT = path.join(root, 'art-src', process.argv[6] || 'monsters');
fs.mkdirSync(OUT, { recursive: true });
const yaml = fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
const KEY = (yaml.match(/ZSXMYONLY_API_KEY:\s*["\']?([^\s"\']+)/) || [])[1];
if (!KEY) { console.log('NO KEY'); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(path.join(root, 'scripts', JOBS_FILE), 'utf8'));
const conc = Math.max(1, Math.min(6, Number(process.argv[2]) || 3));
const only = process.argv[3] || '';
const filter = process.argv[4] || '';
const queue = jobs.filter(j => (!only || j.dir === only) && (!filter || j.name.indexOf(filter) >= 0));
console.log('queue', queue.length, 'concurrency', conc);
const post = (payload) => new Promise((resolve, reject) => {
  const body = JSON.stringify(payload);
  const req = https.request({ host: 'xh.v1api.cc', path: '/v1/images/generations', method: 'POST', timeout: 240000, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), authorization: 'Bearer ' + KEY } }, (r) => {
    const chunks = [];
    r.on('data', c => chunks.push(c));
    r.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); if (r.statusCode !== 200) return reject(new Error('HTTP ' + r.statusCode + ' ' + text.slice(0, 160))); let json = null; try { json = JSON.parse(text); } catch { return reject(new Error('BAD JSON ' + text.slice(0, 120))); } const d = json.data && json.data[0]; if (!d) return reject(new Error('NO DATA ' + text.slice(0, 120))); resolve(d); });
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
  req.end(body);
});
const download = (url) => new Promise((resolve, reject) => { https.get(url, { timeout: 180000 }, (r) => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => resolve(Buffer.concat(c))); }).on('error', reject); });
const one = async (job, attempt = 1) => {
  const dst = path.join(OUT, job.name + '.png');
  if (fs.existsSync(dst) && fs.statSync(dst).size > 200000) { console.log('skip cached', job.name, fs.statSync(dst).size + 'B'); return true; }
  const t0 = Date.now();
  try {
    const d = await post({ model: 'gpt-image-2', prompt: job.prompt, size: '1024x1024', n: 1 });
    let buf = null;
    if (d.b64_json) buf = Buffer.from(d.b64_json, 'base64');
    else if (d.url) buf = await download(d.url);
    if (!buf || buf.length < 100000) throw new Error('small payload ' + (buf ? buf.length : 0));
    fs.writeFileSync(dst, buf);
    console.log('ok', job.name, (buf.length / 1024).toFixed(0) + 'KB', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return true;
  } catch (e) {
    console.log('fail', job.name, 'try' + attempt, e.message.slice(0, 120));
    if (attempt < 3) { await new Promise(r => setTimeout(r, 4000 * attempt)); return one(job, attempt + 1); }
    return false;
  }
};
let ok = 0, fail = 0;
const workers = Array.from({ length: conc }, async () => {
  while (queue.length) {
    const job = queue.shift();
    if (!job) break;
    const r = await one(job);
    if (r) ok++; else fail++;
  }
});
await Promise.all(workers);
console.log('done ok=' + ok + ' fail=' + fail + ' dir=' + OUT);
if (fail) process.exitCode = 1;
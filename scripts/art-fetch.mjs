// 素材批量下载：读取 scripts/fetch/mobs.json、scripts/fetch/bosses.json（{id:url}），
// 跟随重定向下载为 public/art/<sub>/<id>.jpg，并打印 JPEG 魔数与体积供对账。零依赖。
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = path.join(root, 'public', 'art');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'node-art-fetch/1.0' } }, (r) => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && redirects < 6) {
        r.resume();
        resolve(get(new URL(r.headers.location, url).href, redirects + 1));
        return;
      }
      if (r.statusCode !== 200) { reject(new Error('HTTP ' + r.statusCode)); r.resume(); return; }
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function run(sub, file) {
  const p = path.join(root, 'scripts', 'fetch', file);
  if (!fs.existsSync(p)) { console.log('[skip]', file); return; }
  const map = JSON.parse(fs.readFileSync(p, 'utf8'));
  const dir = path.join(ART, sub);
  fs.mkdirSync(dir, { recursive: true });
  let fail = 0;
  for (const [id, url] of Object.entries(map)) {
    const out = path.join(dir, id + '.jpg');
    try {
      if (fs.existsSync(out)) {
        const old = fs.readFileSync(out);
        if (old[0] === 0xFF && old[1] === 0xD8 && old[2] === 0xFF && old.length >= 6000) {
          console.log(`${sub}/${id}.jpg cached ${old.length}B`);
          continue;
        }
      }
      const buf = await get(url);
      const magicOk = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      fs.writeFileSync(out, buf);
      console.log(`${sub}/${id}.jpg ${buf.length}B magic=${magicOk ? 'ok' : 'BAD'} ${buf.length < 6000 ? 'TOOSMALL' : ''}`.trim());
      if (!magicOk || buf.length < 6000) fail++;
    } catch (e) { console.log(`FAIL ${sub}/${id}: ${e.message}`); fail++; }
  }
  if (fail) process.exitCode = 1;
}

const only = process.argv[2]; // 可选: mobs | bosses；缺省全部
if (!only || only === 'mobs') await run('mobs', 'mobs.json');
if (!only || only === 'bosses') await run('bosses', 'bosses.json');

/**
 * 豆豆大王的小跟班 · Web 版
 * 零依赖 Node 服务：静态托管 + 天气代理（Open-Meteo，不用 key）。
 * Railway 会读 PORT，一定要监听 0.0.0.0。
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

/* ------------------------- 天气（南宁 + 深圳） ------------------------- */

const CITIES = [
  { key: 'nanning', name: '南宁', note: '学校', lat: 22.817, lon: 108.3665 },
  { key: 'shenzhen', name: '深圳', note: '家里', lat: 22.5431, lon: 114.0579 }
];

const WMO = {
  0: ['晴', '☀️'],
  1: ['晴间多云', '🌤'],
  2: ['多云', '⛅'],
  3: ['阴', '☁️'],
  45: ['有雾', '🌫'],
  48: ['雾凇', '🌫'],
  51: ['毛毛雨', '🌦'],
  53: ['毛毛雨', '🌦'],
  55: ['毛毛雨', '🌦'],
  56: ['冻毛毛雨', '🌦'],
  57: ['冻毛毛雨', '🌦'],
  61: ['小雨', '🌧'],
  63: ['中雨', '🌧'],
  65: ['大雨', '🌧'],
  66: ['冻雨', '🌧'],
  67: ['冻雨', '🌧'],
  71: ['小雪', '🌨'],
  73: ['中雪', '🌨'],
  75: ['大雪', '❄️'],
  77: ['米雪', '🌨'],
  80: ['阵雨', '🌦'],
  81: ['阵雨', '🌦'],
  82: ['强阵雨', '⛈'],
  85: ['阵雪', '🌨'],
  86: ['阵雪', '🌨'],
  95: ['雷阵雨', '⛈'],
  96: ['雷阵雨', '⛈'],
  99: ['雷阵雨', '⛈']
};

const round = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n)));

function apiUrl(c) {
  return (
    'https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
    '&timezone=Asia%2FShanghai&forecast_days=1'
  );
}

function shape(c, json) {
  const cur = (json && json.current) || {};
  const d = (json && json.daily) || {};
  const max = round(Array.isArray(d.temperature_2m_max) ? d.temperature_2m_max[0] : null);
  const min = round(Array.isArray(d.temperature_2m_min) ? d.temperature_2m_min[0] : null);
  const code = Number(Array.isArray(d.weather_code) ? d.weather_code[0] : cur.weather_code);
  const w = WMO[code] || ['天气不明', '🌤'];

  return {
    key: c.key,
    name: c.name,
    note: c.note,
    temp: round(cur.temperature_2m),
    feels: round(cur.apparent_temperature),
    humidity: round(cur.relative_humidity_2m),
    max,
    min,
    diff: max !== null && min !== null ? max - min : null,
    rain: round(Array.isArray(d.precipitation_probability_max) ? d.precipitation_probability_max[0] : null),
    text: w[0],
    icon: w[1]
  };
}

let cache = { at: 0, data: null };
const TTL = 10 * 60 * 1000;

async function getWeather() {
  if (cache.data && Date.now() - cache.at < TTL) return { data: cache.data, cached: true };

  const results = await Promise.all(
    CITIES.map(async (c) => {
      const res = await fetch(apiUrl(c), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('upstream ' + res.status);
      return shape(c, await res.json());
    })
  );

  cache = { at: Date.now(), data: results };
  return { data: results, cached: false };
}

/* ------------------------- 跨设备同步（Railway Volume 存储） ------------------------- */

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SYNC_DIR = path.join(DATA_DIR, 'sync');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{6,10}$/;
const MAX_BODY = 2 * 1024 * 1024; // 整份快照上限 2MB（日记 + 游戏存档）
const SYNC_CFG_KEY = 'dd:sync'; // 同步码/口令配置本体，不上传服务端
const GAME_SAVE_KEY = 'ddgame:v1'; // 主游戏存档键，纳入同步白名单
const SYNC_VALUE_MAX = 256 * 1024; // 单个键值上限 256KB（游戏存档 JSON 远小于此）
// 可选服务端口令：设置 SYNC_SECRET 后，/new /save /load 都要带 x-sync-secret；不设则保持兼容（本机/旧部署）
const SYNC_SECRET = (process.env.SYNC_SECRET || '').trim();
let storageMode = 'unknown';

try {
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  fs.accessSync(SYNC_DIR, fs.constants.W_OK);
  storageMode = process.env.DATA_DIR ? 'volume' : 'local';
} catch (err) {
  storageMode = 'unavailable';
  console.error('[sync] 存储不可用 ' + SYNC_DIR + ' → ' + err.message);
}
console.log('[sync] 存储模式 ' + storageMode + ' → ' + SYNC_DIR);

const codePath = (code) => path.join(SYNC_DIR, code + '.json');

function secretProvided(req, body, url) {
  const h = req.headers && req.headers['x-sync-secret'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  if (body && typeof body.secret === 'string' && body.secret.trim()) return body.secret.trim();
  if (url && url.searchParams && url.searchParams.get('secret')) return url.searchParams.get('secret');
  return '';
}

function secretAllowed(req, body, url) {
  // 未配置 SYNC_SECRET 时不校验：本机与旧部署行为不变；一旦公开部署建议设置口令
  if (!SYNC_SECRET) return true;
  return secretProvided(req, body, url) === SYNC_SECRET;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleSync(req, res, url) {
  if (storageMode === 'unavailable') {
    sendJson(res, 200, { ok: false, reason: 'storage-unavailable' });
    return true;
  }

  if (url.pathname === '/api/sync/new') {
    if (!secretAllowed(req, null, url)) {
      sendJson(res, 401, { ok: false, reason: 'bad-secret' });
      return true;
    }
    let code = '';
    for (let i = 0; i < 8; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    sendJson(res, 200, { ok: true, code, storage: storageMode, secretRequired: !!SYNC_SECRET });
    return true;
  }

  if (url.pathname === '/api/sync/info') {
    sendJson(res, 200, { ok: true, storage: storageMode, secretRequired: !!SYNC_SECRET });
    return true;
  }

  if (url.pathname === '/api/sync/save') {
    if (req.method !== 'POST') {
      res.writeHead(405).end('method not allowed');
      return true;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      sendJson(res, 400, { ok: false, reason: 'bad-body' });
      return true;
    }

    if (!secretAllowed(req, body, url)) {
      sendJson(res, 401, { ok: false, reason: 'bad-secret' });
      return true;
    }

    const code = String(body.code || '').toUpperCase();
    if (!CODE_RE.test(code)) {
      sendJson(res, 400, { ok: false, reason: 'bad-code' });
      return true;
    }
    const payload = body.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      sendJson(res, 400, { ok: false, reason: 'bad-payload' });
      return true;
    }

    // 只收 dd: 前缀记录与游戏存档键，单值限长，避免变成公共文件柜
    const allowedKey = (k) => (k.startsWith('dd:') && k !== SYNC_CFG_KEY) || k === GAME_SAVE_KEY;
    const clean = {};
    for (const k of Object.keys(payload).slice(0, 500)) {
      const v = payload[k];
      if (!allowedKey(k) || typeof v !== 'string' || v.length > SYNC_VALUE_MAX) continue;
      clean[k] = v;
    }

    const savedAt = Number(body.savedAt) || Date.now();
    const record = { code, savedAt, updatedAt: Date.now(), version: 1, payload: clean };
    try {
      const tmp = codePath(code) + '.' + process.pid + '.tmp';
      await fsp.writeFile(tmp, JSON.stringify(record), 'utf8');
      await fsp.rename(tmp, codePath(code));
    } catch (err) {
      console.error('[sync] 写入失败', err.message);
      sendJson(res, 200, { ok: false, reason: 'write-failed' });
      return true;
    }

    sendJson(res, 200, { ok: true, updatedAt: record.updatedAt, savedAt });
    return true;
  }

  if (url.pathname === '/api/sync/load') {
    if (!secretAllowed(req, null, url)) {
      sendJson(res, 401, { ok: false, reason: 'bad-secret' });
      return true;
    }
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    if (!CODE_RE.test(code)) {
      sendJson(res, 400, { ok: false, reason: 'bad-code' });
      return true;
    }
    try {
      const rec = JSON.parse(await fsp.readFile(codePath(code), 'utf8'));
      sendJson(res, 200, { ok: true, savedAt: rec.savedAt, updatedAt: rec.updatedAt, payload: rec.payload || {} });
    } catch {
      sendJson(res, 200, { ok: false, reason: 'empty' });
    }
    return true;
  }

  sendJson(res, 404, { ok: false, reason: 'no-such-sync-api' });
  return true;
}

/* ------------------------- 静态文件 ------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-store'
  });
  res.end(buf);
}

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(file);
    if (stat.isDirectory()) {
      return serveStatic(req, res, path.posix.join(rel, 'index.html'));
    }
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const isShell = ['.html', '.webmanifest'].includes(ext) || file.endsWith('sw.js');
  // ETag 让「改了 JS/CSS 刷新就能看到」和「缓存不重复下载」两件事同时成立
  const etag = 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': isShell ? 'no-cache' : 'public, max-age=300' }).end();
    return;
  }

  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': isShell ? 'no-cache' : 'public, max-age=300',
    etag,
    'x-content-type-options': 'nosniff'
  });

  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://' + (req.headers.host || 'localhost'));

  try {
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }

    if (url.pathname === '/api/weather') {
      try {
        const { data, cached } = await getWeather();
        sendJson(res, 200, { ok: true, cached, cities: data });
      } catch (err) {
        // 上游挂了也别让页面空着：给旧缓存，没有就明说
        sendJson(res, 200, {
          ok: false,
          reason: String(err && err.message ? err.message : err),
          cities: cache.data || []
        });
      }
      return;
    }

    if (url.pathname.startsWith('/api/sync/')) {
      await handleSync(req, res, url);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('method not allowed');
      return;
    }

    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`小猪小金毛上线啦 → http://${HOST}:${PORT}`);
});
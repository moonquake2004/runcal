'use strict';
// 跑历 RunCal —— 单端口 HTTP 服务
// 1) 托管现有静态站点（index.html / assets / favicon 等）
// 2) 提供 /api/visit、/api/stats 访问量统计端点
//    统计口径：按访客 IP 去重，同一 IP 在 5 分钟窗口内多次访问只计 1 次
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const WINDOW = 5 * 60 * 1000; // 5 分钟去重窗口
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'visits.json');

// ---------- 持久化状态 ----------
let state = { total: 0, lastSeen: {} };
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    state.total = Number(raw.total) || 0;
    state.lastSeen = raw.lastSeen && typeof raw.lastSeen === 'object' ? raw.lastSeen : {};
  }
} catch (e) {
  console.error('[visits] load failed, start fresh:', e && e.message);
  state = { total: 0, lastSeen: {} };
}

function saveState() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state));
  } catch (e) {
    console.error('[visits] save failed:', e && e.message);
  }
}

function recordVisit(ip) {
  const now = Date.now();
  // 清理过期条目（超过 5 分钟即视为可再次计数）
  for (const k in state.lastSeen) {
    if (now - state.lastSeen[k] > WINDOW) delete state.lastSeen[k];
  }
  const fresh = ip in state.lastSeen && now - state.lastSeen[ip] <= WINDOW;
  if (!fresh) {
    state.total++;
    state.lastSeen[ip] = now;
    saveState();
  }
  return state.total;
}

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  let ip;
  if (xff) {
    // 反向代理通常在末尾追加真实访客 IP；取最后一个，忽略客户端伪造的前缀
    const parts = String(xff).split(',').map(s => s.trim()).filter(Boolean);
    ip = parts.length ? parts[parts.length - 1] : (req.socket.remoteAddress || 'unknown');
  } else {
    ip = req.socket.remoteAddress || 'unknown';
  }
  if (ip.indexOf('::ffff:') === 0) ip = ip.slice(7); // IPv4-mapped IPv6
  return ip;
}

// ---------- 静态托管 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function serveFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); res.end('Server Error'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  // 禁止直接下载服务端源码；visits.json 含访客 IP 痕迹，单独禁止
  // （race 数据 data/*.json 需公开以便前端 fetch，不再整体禁用 /data）
  if (urlPath === '/server.js' || urlPath === '/package.json' || urlPath === '/data/visits.json') {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const filePath = path.normalize(path.join(ROOT, urlPath));
  // 防目录穿越
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // 非资源路径回退到 index.html（SPA 友好）
    if (!path.extname(filePath)) {
      serveFile(path.join(ROOT, 'index.html'), res);
      return;
    }
    res.writeHead(404); res.end('Not Found'); return;
  }
  serveFile(filePath, res);
}

// ---------- 路由 ----------
const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/api/visit') {
    const ip = getClientIp(req);
    const total = recordVisit(ip);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ total }));
    return;
  }
  if (p === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ total: state.total }));
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[RunCal] server listening on ' + PORT);
});

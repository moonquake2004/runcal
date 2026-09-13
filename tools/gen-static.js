#!/usr/bin/env node
'use strict';
/**
 * 跑历 RunCal —— 静态赛历总表生成器
 * ------------------------------------------------------------
 * 运行：npm run build:pages   （或 node tools/gen-static.js）
 * 可选：node tools/gen-static.js --base=https://your-domain/
 *
 * 为什么需要它：
 *   单页应用（index.html）的全部赛事内容都由 JS 运行时 fetch + innerHTML 生成，
 *   静态 HTML 里没有任何一条赛事记录。后果是：
 *     · 搜索引擎（尤其百度，JS 渲染能力很弱）几乎收录不到任何赛事
 *     · 用户禁用 JS / 脚本加载失败时，页面是一片空白
 *   本脚本把 data/*.json 渲染成一份真正的静态 HTML（races.html）：
 *   无需 JavaScript 即可完整阅读 473 场赛事，并带结构化数据（JSON-LD）。
 *   它同时产出 robots.txt 与 sitemap.xml。
 *
 * 注意：races.html 是「数据快照的静态投影」，改完 data/ 需重新运行本脚本。
 *      `npm test` 会在 races.html 落后于数据时给出警告。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// 站点主域名（og:url / sitemap 使用）。README 记的在线地址为默认值，可用 --base= 覆盖。
const baseArg = process.argv.find(a => a.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice(7) : 'https://fb29a65789044909aaeee128c296f109.app.workbuddy.link/')
  .replace(/\/+$/, '') + '/';

const FIELDS = ['name', 'city', 'province', 'region', 'date', 'caa', 'wa', 'dist', 'scale', 'status', 'tags', 'note', 'confirmed'];
const DIST_LABEL = { F: '全程马拉松', H: '半程马拉松', T: '10公里', R: '欢乐跑' };
const STATUS_TEXT = { open: '报名中', soon: '待开启', closed: '已截止', done: '已结束', tba: '待官宣' };
const STATUS_CLASS = { open: 'open', soon: 'soon', closed: 'closed', done: 'done', tba: 'tba' };
const REG_MODE = { lottery: '超额抽签', fcfs: '先报先得 · 额满即止', lottery_waitlist: '抽签 + 候补' };

function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8'));
}
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtScale(n) {
  if (!n) return '—';
  return n >= 10000 ? (n / 10000).toFixed(1) + ' 万人' : n.toLocaleString('zh-CN') + ' 人';
}

// ---------- 读取数据 ----------
const manifest = readJSON('index.json');
const snapshot = manifest.snapshot || '';
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

const races = [];
for (const year of ['2026', '2027']) {
  const rows = readJSON(`races-${year}.json`);
  rows.forEach((r, i) => {
    const o = {};
    FIELDS.forEach((f, k) => { o[f] = r[k] === undefined || r[k] === null ? '' : r[k]; });
    o.year = year;
    o._i = i;
    races.push(o);
  });
}
races.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.name.localeCompare(b.name, 'zh'));

const REG = readJSON('race-reg.json');
const DIFF = readJSON('race-diff.json');
const URLS = readJSON('race-urls.json');
const seenReg = new Set();
const seenDiff = new Set();
races.forEach(r => {
  if (REG[r.name] && !seenReg.has(r.name)) { r.reg = REG[r.name]; seenReg.add(r.name); }
  if (DIFF[r.name] && !seenDiff.has(r.name)) { r.diff = DIFF[r.name]; seenDiff.add(r.name); }
  r.url = URLS[r.name] || '';
});

const today = new Date();
const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
const upcoming = races.filter(r => r.date >= todayStr);
const provinces = new Set(races.map(r => r.province));
const waCount = races.filter(r => r.wa).length;

// ---------- 渲染 ----------
function dayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : '周' + weekdays[d.getDay()];
}

function raceCard(r, n) {
  const badges = [];
  if (r.wa) badges.push(`<span class="b wa">世界田联${esc(r.wa)}</span>`);
  if (r.caa) badges.push(`<span class="b caa">田协${esc(r.caa)}类</span>`);
  badges.push(`<span class="b dist">${esc(String(r.dist).split('').map(c => DIST_LABEL[c] || c).join(' / '))}</span>`);
  badges.push(`<span class="b st ${STATUS_CLASS[r.status] || ''}">${esc(STATUS_TEXT[r.status] || r.status)}</span>`);

  const kv = [];
  kv.push(`<div><dt>比赛日期</dt><dd>${esc(r.date)} ${dayOfWeek(r.date)}</dd></div>`);
  kv.push(`<div><dt>举办地</dt><dd>${esc(r.province)} · ${esc(r.city)}（${esc(r.region)}）</dd></div>`);
  kv.push(`<div><dt>参赛规模</dt><dd>${fmtScale(r.scale)}</dd></div>`);
  if (r.reg) {
    kv.push(`<div><dt>报名窗口</dt><dd>${esc(r.reg.open)} → ${esc(r.reg.close)}${r.reg.mode ? '（' + esc(REG_MODE[r.reg.mode] || r.reg.mode) + '）' : ''}</dd></div>`);
  }
  if (r.diff) {
    kv.push(`<div><dt>赛道难度</dt><dd>${esc(r.diff.level)}难度 · 累计爬升 ${r.diff.gain == null ? '官方未公布' : esc(r.diff.gain) + ' 米'} · 关门 ${esc(r.diff.limit)} · ${esc(r.diff.alt)}</dd></div>`);
  }
  if (r.url) {
    kv.push(`<div><dt>官方入口</dt><dd><a href="${esc(r.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(r.url.replace(/^https?:\/\//, ''))}</a></dd></div>`);
  }

  const src = [];
  if (r.reg && r.reg.src) src.push(`报名信息来源：${esc(r.reg.src)}`);
  if (r.diff && r.diff.src) src.push(`赛道数据来源：${esc(r.diff.src)}`);

  return `<article class="race" id="r-${n}">
  <h3>${esc(r.name)}</h3>
  <p class="badges">${badges.join('')}</p>
  <dl>${kv.join('')}</dl>
  ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
  ${r.tags ? `<p class="tags">${String(r.tags).split(',').filter(Boolean).map(t => '<span>#' + esc(t.trim()) + '</span>').join('')}</p>` : ''}
  ${src.length ? `<p class="src">${src.join(' ｜ ')}</p>` : ''}
</article>`;
}

// 按年月分组
const groups = new Map();
races.forEach(r => {
  const key = String(r.date).slice(0, 7);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
});
const groupKeys = Array.from(groups.keys()).sort();

let n = 0;
const toc = groupKeys.map(k => {
  const [y, m] = k.split('-');
  return `<a href="#g-${k}">${y} 年 ${Number(m)} 月<span>${groups.get(k).length}</span></a>`;
}).join('');

const body = groupKeys.map(k => {
  const [y, m] = k.split('-');
  const items = groups.get(k);
  const cards = items.map(r => raceCard(r, ++n)).join('\n');
  return `<section class="group" id="g-${k}">
  <h2>${y} 年 ${Number(m)} 月 <small>${items.length} 场</small></h2>
  <div class="grid">
${cards}
  </div>
</section>`;
}).join('\n');

// JSON-LD：站点 + 未来 50 场赛事（Event），供搜索引擎理解
const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: '跑历 RunCal · 中国马拉松赛季日历',
      url: BASE,
      inLanguage: 'zh-CN',
      description: `2026—2027 中国马拉松赛季日历：${races.length} 场路跑赛事，覆盖 ${provinces.size} 个省级行政区，含报名窗口、赛道难度与官方入口。`
    },
    {
      '@type': 'ItemList',
      name: '近期马拉松赛事',
      numberOfItems: Math.min(50, upcoming.length),
      itemListElement: upcoming.slice(0, 50).map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'SportsEvent',
          name: r.name,
          startDate: r.date,
          eventStatus: 'https://schema.org/EventScheduled',
          location: { '@type': 'Place', name: `${r.province} ${r.city}`, address: { '@type': 'PostalAddress', addressRegion: r.province, addressLocality: r.city, addressCountry: 'CN' } },
          url: BASE + 'races.html#r-' + (races.indexOf(r) + 1)
        }
      }))
    }
  ]
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>中国马拉松赛历总表 ${snapshot} · 跑历 RunCal（${races.length} 场）</title>
<meta name="description" content="2026—2027 中国马拉松赛历总表：${races.length} 场路跑赛事的比赛日期、举办城市、田协与世界田联等级、参赛规模、报名窗口、赛道难度与官方入口。数据快照 ${snapshot}，覆盖 ${provinces.size} 个省级行政区。">
<meta name="theme-color" content="#E23A20">
<link rel="canonical" href="${esc(BASE)}races.html">
<meta property="og:type" content="website">
<meta property="og:title" content="中国马拉松赛历总表 · 跑历 RunCal">
<meta property="og:description" content="${races.length} 场路跑赛事的日期、等级、报名窗口与赛道难度。数据快照 ${snapshot}。">
<meta property="og:url" content="${esc(BASE)}races.html">
<style>
:root{--track:#E23A20;--ink:#0d1017;--ink2:#151a23;--line:rgba(255,255,255,.12);--txt:#e9eef6;--muted:#9aa7b8;--volt:#D8FF3E}
*{box-sizing:border-box}
body{margin:0;background:#f5f7fa;color:#10141c;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
header{background:var(--ink);color:var(--txt);padding:28px 20px}
header .in{max-width:1100px;margin:0 auto}
header h1{margin:0 0 10px;font-size:24px;font-weight:800;letter-spacing:.01em}
header p{margin:0;color:var(--muted);font-size:14px}
header a{color:var(--volt);text-decoration:none}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.stats span{font-size:12.5px;border:1px solid var(--line);border-radius:99px;padding:4px 12px;color:var(--muted)}
.toc{background:#fff;border-bottom:1px solid #e3e8ef;padding:14px 20px;position:sticky;top:0;z-index:5}
.toc .in{max-width:1100px;margin:0 auto;display:flex;flex-wrap:wrap;gap:6px}
.toc a{font-size:12.5px;text-decoration:none;color:#33415c;border:1px solid #d7dee8;border-radius:8px;padding:4px 9px;background:#fbfcfe}
.toc a span{color:#8695ab;margin-left:5px;font-size:11px}
main{max-width:1100px;margin:0 auto;padding:22px 20px 60px}
.group{margin-bottom:34px}
.group h2{font-size:17px;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--track);display:flex;align-items:baseline;gap:8px}
.group h2 small{font-size:12px;color:#7b8798;font-weight:400}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.race{background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:14px 15px}
.race h3{margin:0 0 8px;font-size:15.5px;line-height:1.35;font-weight:750}
.badges{margin:0 0 10px;display:flex;flex-wrap:wrap;gap:5px}
.b{font-size:10.5px;padding:2px 7px;border-radius:4px;font-weight:700;white-space:nowrap}
.b.wa{background:#fff3d1;color:#7a5600}.b.caa{background:#e6f0ff;color:#1a4b8c}
.b.dist{background:#eef1f5;color:#44506a}
.b.st.open{background:#dcf7ec;color:#0c6b4c}.b.st.soon{background:#fff3d1;color:#7a5600}
.b.st.closed{background:#fde4e0;color:#8f2a17}.b.st.done{background:#eef1f5;color:#5d6a80}
.b.st.tba{background:#f2eefb;color:#5b3fa8}
.race dl{margin:0;display:grid;gap:4px}
.race dl>div{display:flex;gap:8px;font-size:12.5px}
.race dt{color:#7b8798;flex:0 0 62px;margin:0}
.race dd{margin:0;flex:1;min-width:0;word-break:break-word}
.race dd a{color:#1a4b8c}
.race .note{margin:9px 0 0;font-size:12.5px;color:#44506a;background:#f7f9fc;border-left:3px solid var(--track);padding:6px 10px;border-radius:0 6px 6px 0}
.race .tags{margin:8px 0 0;display:flex;flex-wrap:wrap;gap:5px}
.race .tags span{font-size:11px;color:#2b6b2b;background:#eaf6ea;border-radius:99px;padding:2px 8px}
.race .src{margin:9px 0 0;font-size:11px;color:#93a0b3;line-height:1.55}
footer{background:var(--ink);color:var(--muted);padding:26px 20px;font-size:12.5px}
footer .in{max-width:1100px;margin:0 auto}
footer a{color:var(--volt)}
@media print{.toc,header{position:static}.b{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
</head>
<body>
<header><div class="in">
  <h1>中国马拉松赛历总表 · 跑历 RunCal</h1>
  <p>本页是<b>无需 JavaScript 的静态赛历</b>，数据快照 <b>${esc(snapshot)}</b>。交互版（筛选 / 对比 / 配速换算 / 个人赛程）请访问 <a href="./">跑历 RunCal 主页</a>。</p>
  <div class="stats">
    <span>${races.length} 场赛事</span>
    <span>${provinces.size} 个省级行政区</span>
    <span>世界田联标牌 ${waCount} 场</span>
    <span>报名窗口 ${Object.keys(REG).length} 场</span>
    <span>赛道难度 ${Object.keys(DIFF).length} 场</span>
    <span>近期赛事 ${upcoming.length} 场</span>
  </div>
</div></header>
<nav class="toc"><div class="in">${toc}</div></nav>
<main>
${body}
</main>
<footer><div class="in">
  <p>数据整理自中国田径协会赛事名录、世界田联标牌名单、各赛事组委会公告与主流媒体报道；报名窗口与赛道难度逐条标注来源。比赛日期、规模与报名安排可能因天气、审批、赛道调整而变更，<b>报名与缴费请务必以赛事组委会官方渠道为准</b>。</p>
  <p>跑历 RunCal · 数据快照 ${esc(snapshot)} · <a href="./">交互版主页</a> · MIT License</p>
</div></footer>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'races.html'), html, 'utf8');
console.log(`✓ races.html  (${races.length} 场赛事, ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);

// ---------- robots.txt ----------
const robots = `# 跑历 RunCal
User-agent: *
Allow: /
Disallow: /data/visits.json

Sitemap: ${BASE}sitemap.xml
`;
fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots, 'utf8');
console.log('✓ robots.txt');

// ---------- sitemap.xml ----------
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}</loc>
    <lastmod>${snapshot}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE}races.html</loc>
    <lastmod>${snapshot}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');
console.log('✓ sitemap.xml');
console.log(`\n站点根地址：${BASE}\n（换域名后重新运行：node tools/gen-static.js --base=https://新域名/）`);

#!/usr/bin/env node
'use strict';
/**
 * 跑历 RunCal —— 数据层校验脚本
 * ------------------------------------------------------------
 * 运行：npm test   （或 node tools/validate-data.js）
 *
 * 为什么需要它：data/*.json 是唯一数据源、且靠手工维护。
 * 此前没有任何校验，导致过这些问题（都曾真实存在）：
 *   · races-2026.json 366 行只有 12 个字段，而 app.js 的 FIELDS 声明 13 个
 *   · 报名状态与日期矛盾（比赛日已过却仍是「待开启」）
 *   · course-records.json 存在拼错的悬空键，纪录永远不显示且无告警
 *   · 快照日期在三处（index.json / race-reg-as-of.json / app.js）手工同步
 *   · 缓存版本号需改三处，改样式时容易漏掉 CSS 那处
 *
 * 退出码：0 = 全部通过；1 = 存在 ERROR（CI / pre-commit 可用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const ERRORS = [];
const WARNS = [];
const err = (m) => ERRORS.push(m);
const warn = (m) => WARNS.push(m);

// ---------- 期望值（唯一事实来源，改这里即可） ----------
const FIELDS = ['name', 'city', 'province', 'region', 'date', 'caa', 'wa', 'dist', 'scale', 'status', 'tags', 'note', 'confirmed'];
const REGIONS = ['华东', '华南', '华北', '华中', '西南', '西北', '东北'];
const CAA = ['A1', 'A', 'B', 'C', ''];
const WA = ['白金标', '金标', '精英标', '标牌', ''];
const STATUS = ['open', 'soon', 'closed', 'done', 'tba'];
const DIST_CHARS = ['F', 'H', 'T', 'R'];

function readJSON(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) { err(`缺少数据文件 data/${file}`); return null; }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    err(`data/${file} 不是合法 JSON：${e.message}`);
    return null;
  }
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 注意：不能用 toISOString 比对（会把 UTC+8 的 00:00 退到前一天），
// 必须用本地时间构造后回读年月日，才能识别 2026-02-30 这类假日期。
function validDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// ============================================================
// 1. 赛事主表：字段数 / 类型 / 枚举 / 日期
// ============================================================
const racesByYear = {};
let allNames = new Set();

for (const year of ['2026', '2027']) {
  const rows = readJSON(`races-${year}.json`);
  if (!Array.isArray(rows)) { if (rows !== null) err(`races-${year}.json 顶层应为数组`); continue; }
  racesByYear[year] = rows;

  rows.forEach((r, i) => {
    const where = `races-${year}.json[${i}] ${r[0] || '(无名)'}`;
    if (!Array.isArray(r)) { err(`${where} 不是数组`); return; }
    if (r.length !== FIELDS.length) {
      err(`${where} 字段数 ${r.length}，应为 ${FIELDS.length}（${FIELDS.join(',')}）`);
    }
    const o = {};
    FIELDS.forEach((f, k) => { o[f] = r[k]; });

    if (!o.name || typeof o.name !== 'string') err(`${where} 赛事名称为空或非字符串`);
    if (!validDate(o.date)) err(`${where} 日期非法：「${o.date}」（需 YYYY-MM-DD 且真实存在）`);
    else if (o.date.slice(0, 4) !== year) err(`${where} 日期年份 ${o.date.slice(0, 4)} 与文件 ${year} 不一致`);
    if (!REGIONS.includes(o.region)) err(`${where} region 越界：「${o.region}」`);
    if (!CAA.includes(o.caa)) err(`${where} caa 越界：「${o.caa}」`);
    if (!WA.includes(o.wa)) err(`${where} wa 越界：「${o.wa}」`);
    if (!STATUS.includes(o.status)) err(`${where} status 越界：「${o.status}」`);
    if (!Number.isInteger(o.scale) || o.scale <= 0) err(`${where} scale 应为正整数，实际「${o.scale}」`);
    if (typeof o.dist !== 'string' || !o.dist.length) err(`${where} dist 为空`);
    else for (const c of o.dist) if (!DIST_CHARS.includes(c)) err(`${where} dist 含非法字符「${c}」（仅允许 F/H/T/R）`);
    if (o.confirmed !== 0 && o.confirmed !== 1) warn(`${where} confirmed 应为 0/1，实际「${o.confirmed}」`);

    allNames.add(o.name);
  });

  // 文件内重名 + 同日期同名
  const seen = new Map();
  rows.forEach((r) => {
    const key = r[0];
    if (seen.has(key)) err(`races-${year}.json 赛事名重复：「${key}」`);
    seen.set(key, 1);
  });
}

// ============================================================
// 2. 跨文件引用完整性
// ============================================================
const REF_FILES = ['race-results', 'course-records', 'cn-best', 'race-diff', 'race-reg', 'race-urls', 'course-images'];
const refData = {};
for (const f of REF_FILES) {
  const d = readJSON(`${f}.json`);
  refData[f] = d;
  if (!d || typeof d !== 'object' || Array.isArray(d)) { if (d !== null) err(`${f}.json 顶层应为对象`); continue; }
  for (const k of Object.keys(d)) {
    if (!allNames.has(k)) err(`${f}.json 存在悬空键「${k}」—— 该赛事不在 races-2026/2027 中，数据永远不会被渲染`);
  }
}

// 报名窗口：可解析 + open < close
const reg = refData['race-reg'];
if (reg) {
  const DT_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/;
  for (const [name, v] of Object.entries(reg)) {
    if (!v || typeof v !== 'object') { err(`race-reg「${name}」应为对象`); continue; }
    for (const key of ['open', 'close']) {
      if (!v[key] || !DT_RE.test(v[key])) { err(`race-reg「${name}」${key} 时间格式非法：「${v[key]}」`); continue; }
    }
    if (!v.src || typeof v.src !== 'string' || v.src.length < 4) err(`race-reg「${name}」缺少来源字段 src（本项目要求逐条可查证）`);
    const a = new Date(String(v.open).replace(' ', 'T'));
    const b = new Date(String(v.close).replace(' ', 'T'));
    if (!isNaN(a) && !isNaN(b) && a >= b) err(`race-reg「${name}」报名开始不早于截止（${v.open} → ${v.close}）`);
  }
}

// 赛道难度：字段与取值
const diff = refData['race-diff'];
if (diff) {
  for (const [name, v] of Object.entries(diff)) {
    if (!v || typeof v !== 'object') { err(`race-diff「${name}」应为对象`); continue; }
    if (!['低', '中', '高'].includes(v.level)) err(`race-diff「${name}」level 越界：「${v.level}」`);
    if (v.gain !== null && !(Number.isInteger(v.gain) && v.gain >= 0)) {
      err(`race-diff「${name}」gain 应为非负整数或 null（未知时写 null，不要臆造）`);
    }
    if (!v.limit || typeof v.limit !== 'string') err(`race-diff「${name}」缺少 limit`);
    if (!v.src || String(v.src).length < 4) err(`race-diff「${name}」缺少来源字段 src`);
  }
}

// 赛果：结构
const results = refData['race-results'];
if (results) {
  for (const [name, v] of Object.entries(results)) {
    if (!v || typeof v !== 'object') { err(`race-results「${name}」应为对象`); continue; }
    if (!v.src) err(`race-results「${name}」缺少来源字段 src`);
    for (const g of ['men', 'women', 'cnMen', 'cnWomen']) {
      if (v[g] === undefined || v[g] === null) continue;
      if (typeof v[g] !== 'object') { err(`race-results「${name}」${g} 应为对象`); continue; }
      if (!v[g].time) err(`race-results「${name}」${g} 缺少 time`);
      // 外籍选手匿名是 UI 明确支持的状态（渲染为「外籍选手」），不作告警；
      // 但中国籍组别缺姓名属于数据不完整。
      if (g.startsWith('cn') && !v[g].name) warn(`race-results「${name}」${g} 缺少中国籍选手姓名`);
    }
  }
}

// ============================================================
// 3. status 与日期一致性（本项目最易失守的一条）
// ============================================================
const manifest = readJSON('index.json');
const snapshot = manifest && manifest.snapshot;
if (!snapshot || !validDate(snapshot)) err(`index.json 的 snapshot 非法：「${snapshot}」`);

if (snapshot) {
  for (const [year, rows] of Object.entries(racesByYear)) {
    rows.forEach((r) => {
      const o = {};
      FIELDS.forEach((f, k) => { o[f] = r[k]; });
      if (!validDate(o.date)) return;
      // 比赛日早于数据快照日，理应已完赛 → status 必须是 done
      if (o.date < snapshot && o.status !== 'done') {
        err(`「${o.name}」比赛日 ${o.date} 早于数据快照 ${snapshot}，但 status=${o.status}（应为 done）`);
      }
      // 比赛日就是快照当天 → 报名窗口必然已关闭，不应是 open/soon
      if (o.date === snapshot && (o.status === 'open' || o.status === 'soon')) {
        err(`「${o.name}」比赛日即快照当天 ${o.date}，但 status=${o.status}（应为 closed / done）`);
      }
    });
  }
}

// ============================================================
// 4. 清单 / 快照 / 版本号的一致性
// ============================================================
const dataFiles = fs.readdirSync(DATA).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'visits.json');
if (manifest && Array.isArray(manifest.files)) {
  const declared = manifest.files.map(f => f.f + '.json');
  for (const f of declared) if (!dataFiles.includes(f)) err(`index.json 声明了 ${f}，但文件不存在`);
  for (const f of dataFiles) if (!declared.includes(f)) warn(`data/${f} 存在但未在 index.json 清单中声明（运行时不会被加载）`);
  for (const item of manifest.files) {
    if (!fs.existsSync(path.join(DATA, item.f + '.json'))) continue;
    const val = JSON.parse(fs.readFileSync(path.join(DATA, item.f + '.json'), 'utf8'));
    const n = Array.isArray(val) ? val.length : Object.keys(val).length;
    if (n === 0) warn(`data/${item.f}.json 为空`);
  }
}

// app.js 的 DATA_SNAPSHOT 与 index.json.snapshot
const appJs = fs.readFileSync(path.join(ROOT, 'assets/js/app.js'), 'utf8');
const snapConst = (appJs.match(/const DATA_SNAPSHOT = '([^']+)'/) || [])[1];
if (snapConst && snapshot && snapConst !== snapshot) {
  err(`快照日期不一致：app.js DATA_SNAPSHOT=${snapConst}，index.json snapshot=${snapshot}`);
}
const regAsOf = readJSON('race-reg-as-of.json');
if (regAsOf && snapshot && regAsOf !== snapshot) {
  err(`快照日期不一致：race-reg-as-of.json=${regAsOf}，index.json snapshot=${snapshot}`);
}

// 缓存版本号三处一致（README 已说明必须三处同步）
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const loaderJs = fs.readFileSync(path.join(ROOT, 'assets/js/loader.js'), 'utf8');
const vCss = (html.match(/style\.css\?v=([0-9a-z]+)/) || [])[1];
const vLoader = (html.match(/loader\.js\?v=([0-9a-z]+)/) || [])[1];
const vVer = (loaderJs.match(/var VER = '([0-9a-z]+)'/) || [])[1];
if (!vCss || !vLoader || !vVer) {
  err(`缓存版本号缺失：style.css=${vCss || '—'} loader.js=${vLoader || '—'} VER=${vVer || '—'}`);
} else if (!(vCss === vLoader && vLoader === vVer)) {
  err(`缓存版本号不一致（必须三处相同）：style.css=${vCss} / loader.js=${vLoader} / VER=${vVer}`);
}

// ============================================================
// 4.5 静态赛历总表（races.html）时效性
// ============================================================
const racesHtml = path.join(ROOT, 'races.html');
if (!fs.existsSync(racesHtml)) {
  warn('缺少 races.html 静态赛历总表（运行 npm run build:pages 生成）—— 无 JS 用户与搜索引擎看不到任何赛事');
} else {
  const htmlTime = fs.statSync(racesHtml).mtimeMs;
  const newestData = Math.max(...fs.readdirSync(DATA)
    .filter(f => f.endsWith('.json') && f !== 'visits.json')
    .map(f => { try { return fs.statSync(path.join(DATA, f)).mtimeMs; } catch (e) { return 0; } }));
  if (newestData > htmlTime) {
    warn('races.html 比 data/*.json 旧 —— 数据已更新但静态总表未重新生成，请运行 npm run build:pages');
  }
  const htmlSrc = fs.readFileSync(racesHtml, 'utf8');
  const articleCount = (htmlSrc.match(/<article class="race"/g) || []).length;
  const raceTotal = Object.values(racesByYear).reduce((sum, rows) => sum + rows.length, 0);
  if (articleCount !== raceTotal) {
    err(`races.html 收录 ${articleCount} 场，与数据中的 ${raceTotal} 场不一致，请重新生成`);
  }
}

// ============================================================
// 5. 输出
// ============================================================
const total = Object.values(racesByYear).reduce((s, r) => s + r.length, 0);
console.log('');
console.log('跑历 RunCal · 数据校验');
console.log('─'.repeat(56));
console.log(`赛事总数        ${total} 场（2026: ${(racesByYear['2026'] || []).length} / 2027: ${(racesByYear['2027'] || []).length}）`);
console.log(`覆盖省份        ${new Set(Object.values(racesByYear).flat().map(r => r[2])).size} 个`);
console.log(`数据快照        ${snapshot || '—'}   缓存版本 ${vVer || '—'}`);
console.log(`赛道难度        ${diff ? Object.keys(diff).length : 0} 场    报名窗口 ${reg ? Object.keys(reg).length : 0} 场    赛果 ${results ? Object.keys(results).length : 0} 场`);
console.log('─'.repeat(56));

if (WARNS.length) {
  console.log(`\n⚠ 警告 ${WARNS.length} 条：`);
  WARNS.slice(0, 20).forEach(w => console.log('  · ' + w));
  if (WARNS.length > 20) console.log(`  … 其余 ${WARNS.length - 20} 条省略`);
}
if (ERRORS.length) {
  console.log(`\n✗ 错误 ${ERRORS.length} 条：`);
  ERRORS.slice(0, 40).forEach(e => console.log('  · ' + e));
  if (ERRORS.length > 40) console.log(`  … 其余 ${ERRORS.length - 40} 条省略`);
  console.log('\n校验未通过。\n');
  process.exit(1);
}
console.log(`\n✓ 校验通过（警告 ${WARNS.length} 条）\n`);

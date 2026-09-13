#!/usr/bin/env node
'use strict';
/**
 * 跑历 RunCal —— 数据层构建脚本（P3-10）
 * ------------------------------------------------------------
 * 作用：把归档在 tools/legacy/ 下的历史 JS 数据文件，转换成运行时
 *       消费的 data/*.json，并生成 data/index.json 清单。
 *
 * 说明：这是一次性迁移工具。迁移完成后 data/*.json 即为唯一数据源，
 *       后续 2027/2028 赛季数据直接编辑 JSON 即可，无需再跑本脚本。
 *       tools/legacy/ 仅作归档参考，不再被运行时引用。
 *
 * 用法：node tools/build-json.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const LEGACY = path.join(__dirname, 'legacy');
const OUT = path.join(ROOT, 'data');

// ============================================================
// P0 安全守卫：本脚本是一次性迁移工具（legacy JS → JSON）。
// 迁移完成后 data/*.json 即为唯一数据源，后续赛季数据都在 JSON 上手工维护。
// 若无条件执行，本脚本会把 data/ 静默回滚到 legacy 归档时的旧状态
// （丢失报名窗口、官网链接、赛道难度、规模修正等全部人工核实成果）。
// 因此默认拒绝执行；确认要回滚请显式传入 --force，并先 git commit 备份。
// ============================================================
const FORCE = process.argv.includes('--force');
if (!FORCE) {
  const newestOf = dir => Math.max(0, ...fs.readdirSync(dir)
    .filter(f => !f.startsWith('.'))
    .map(f => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch (e) { return 0; } }));
  const legacyNewest = newestOf(LEGACY);
  const dataNewest = newestOf(OUT);
  if (dataNewest > legacyNewest) {
    console.error('');
    console.error('✗ 拒绝执行：data/*.json 比 tools/legacy/* 更新，说明运行时数据已被手工维护。');
    console.error('  继续执行会把 data/ 回滚到 legacy 归档状态，丢失全部人工核实成果。');
    console.error('');
    console.error('  如确需回滚：先 git commit 备份，再运行 node tools/build-json.js --force');
    console.error('');
    process.exit(1);
  }
  console.log('[build-json] 守卫通过（legacy 不比 data 旧），继续执行…');
} else {
  console.warn('[build-json] ⚠ --force 已启用：将用 legacy 覆盖 data/，请确认已做备份。');
}

// 每个归档 JS 文件 → 需要抽取的全局变量名
const SOURCES = [
  { file: 'data-2026.js',  keys: ['RACES_2026'] },
  { file: 'data-2027.js',  keys: ['RACES_2027'] },
  { file: 'course.js',     keys: ['COURSE_IMAGES'] },
  { file: 'results.js',    keys: ['RACE_RESULTS'] },
  { file: 'records.js',    keys: ['COURSE_RECORDS'] },
  { file: 'cn_best.js',    keys: ['CN_BEST'] },
  { file: 'world.js',      keys: ['WORLD_RECORDS', 'WORLD_MAJORS'] },
  { file: 'entry.js',      keys: ['RACE_URLS'] },
  { file: 'regtime.js',    keys: ['RACE_REG_AS_OF', 'RACE_REG'] },
  { file: 'difficulty.js', keys: ['RACE_DIFF'] }
];

// 全局变量名 → 输出 JSON 文件名（kebab-case）
const FILE_OF = {
  RACES_2026: 'races-2026',
  RACES_2027: 'races-2027',
  COURSE_IMAGES: 'course-images',
  RACE_RESULTS: 'race-results',
  COURSE_RECORDS: 'course-records',
  CN_BEST: 'cn-best',
  WORLD_RECORDS: 'world-records',
  WORLD_MAJORS: 'world-majors',
  RACE_URLS: 'race-urls',
  RACE_REG: 'race-reg',
  RACE_REG_AS_OF: 'race-reg-as-of',
  RACE_DIFF: 'race-diff'
};

/** 在沙箱中执行一个历史数据文件，返回其 window 上挂载的变量 */
function extract(file) {
  const src = fs.readFileSync(path.join(LEGACY, file), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return sandbox.window;
}

function size(v) {
  if (Array.isArray(v)) return v.length + ' 条';
  if (v && typeof v === 'object') return Object.keys(v).length + ' 键';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

if (!fs.existsSync(LEGACY)) {
  console.error('缺少归档目录: ' + LEGACY);
  process.exit(1);
}
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const manifest = { snapshot: null, generated: new Date().toISOString(), files: [] };
let fail = 0;

for (const { file, keys } of SOURCES) {
  const win = extract(file);
  for (const key of keys) {
    if (!(key in win)) {
      console.error(`  ✗ ${file} 未定义 window.${key}`);
      fail++;
      continue;
    }
    const val = win[key];
    let json;
    try {
      json = JSON.stringify(val, null, 1);
    } catch (e) {
      console.error(`  ✗ ${key} 无法序列化: ${e.message}`);
      fail++;
      continue;
    }
    // 往返一致性校验：JSON.parse(JSON.stringify(v)) 必须深等于 v
    const round = JSON.parse(json);
    if (JSON.stringify(round) !== JSON.stringify(val)) {
      console.error(`  ✗ ${key} 往返校验不一致，可能存在 undefined/NaN/函数`);
      fail++;
      continue;
    }
    const name = FILE_OF[key];
    if (!name) { console.error(`  ✗ ${key} 缺少输出文件名映射`); fail++; continue; }
    const dest = path.join(OUT, name + '.json');
    fs.writeFileSync(dest, json + '\n', 'utf8');
    manifest.files.push({ f: name, k: key });
    console.log(`  ✓ ${name}.json  (${size(val)})`);
    if (key === 'RACE_REG_AS_OF') manifest.snapshot = val;
  }
}

if (fail) {
  console.error(`\n构建失败：${fail} 项出错，未写出清单。`);
  process.exit(1);
}

fs.writeFileSync(
  path.join(OUT, 'index.json'),
  JSON.stringify(manifest, null, 1) + '\n',
  'utf8'
);

console.log(`\n完成：${manifest.files.length} 个数据文件 + index.json`);
console.log('数据快照:', manifest.snapshot);

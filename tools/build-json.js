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

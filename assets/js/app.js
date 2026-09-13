/* ============================================================
   跑历 RunCal · 中国马拉松赛季日历 2026—2027  ·  交互逻辑
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. 全局错误兜底（P1-1） ----------
     任何运行期异常都给出可读提示，避免出现「什么都不渲染也没有提示」的空页。 */
  function showFatal(msg) {
    try {
      var box = document.getElementById('fatalError');
      if (!box) {
        box = document.createElement('div');
        box.id = 'fatalError';
        box.setAttribute('role', 'alert');
        box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;' +
          'background:#7a1d10;color:#fff;padding:12px 16px;border-radius:10px;' +
          'font:13px/1.7 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)';
        document.body.appendChild(box);
      }
      box.innerHTML = '<b>页面渲染出现异常</b><br>' + String(msg).replace(/[<>&]/g, function (c) {
        return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c];
      }) + '<br><span style="opacity:.8">可先刷新页面；若持续出现请反馈。</span>';
    } catch (e) { /* 兜底本身不再抛 */ }
  }
  window.addEventListener('error', function (e) {
    if (e && e.message) {
      showFatal(e.message + (e.filename ? '（' + String(e.filename).split('/').pop() + ':' + e.lineno + '）' : ''));
    }
  });
  window.addEventListener('unhandledrejection', function (e) {
    showFatal('异步错误：' + ((e && e.reason && (e.reason.message || e.reason)) || '未知'));
  });

  /* ---------- 1. 数据装配 ---------- */
  const FIELDS = ['name','city','province','region','date','caa','wa','dist','scale','status','tags','note','confirmed'];
  const WA_WEIGHT = { '白金标': 5, '金标': 4, '精英标': 3, '标牌': 2 };
  const CAA_WEIGHT = { 'A1': 1.6, 'A': 1.4, 'B': 0.7, 'C': 0.3 };
  const REGIONS = ['华东','华南','华北','华中','西南','西北','东北'];
  const DIST_LABEL = { F: '全程马拉松', H: '半程马拉松', T: '10公里', R: '欢乐跑' };
  const MONTH_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const STATUS_TEXT = { open: '报名中', soon: '待开启', closed: '已截止', done: '已结束', tba: '待官宣' };
  const REG_MODE = { lottery: '超额抽签', fcfs: '先报先得 · 额满即止', lottery_waitlist: '抽签 + 候补' };

  const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
  const TODAY_STR = fmtDate(TODAY);
  const DATA_SNAPSHOT = '2026-09-13';  // 数据最后更新日期（非访问当天，避免页脚/概览误显为今日）

  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // 'YYYY-MM-DD HH:MM' -> Date（小时为 24 时 JS 自动顺延为次日 0 点，即当日午夜）
  function parseDT(s) {
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  }
  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function fmtHM(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  const BAD_ROWS = [];
  function hydrate(rows, year) {
    return rows.map((r, i) => {
      const o = {};
      FIELDS.forEach((f, k) => { o[f] = (r[k] !== undefined && r[k] !== null) ? r[k] : ''; });
      o.year = year;
      o.id = year + '-' + i;
      o.caa = String(o.caa || '');
      o.wa = String(o.wa || '');
      o.scale = Number(o.scale) || 0;
      o.tags = o.tags ? String(o.tags).split(',').map(s => s.trim()).filter(Boolean) : [];
      // 日期必须是合法 YYYY-MM-DD 字符串：异常行不再抛异常（此前会自动整页空白），
      // 记录到 BAD_ROWS 并在启动后提示。manual 编辑 JSON 一个漏写的引号即可触发。
      const ds = typeof o.date === 'string' ? o.date : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) BAD_ROWS.push(year + ' · ' + String(r[0] || '(未命名)'));
      o.month = Number(ds.slice(5, 7)) || 0;
      o.day = Number(ds.slice(8, 10)) || 0;
      o.confirmed = o.confirmed === 1 || o.confirmed === '1' || o.confirmed === true;
      // 已过比赛日一律视为已结束（空日期不参与判断）
      if (ds && ds < TODAY_STR && o.status !== 'done') o.status = 'done';
      o.past = !!ds && ds < TODAY_STR;
      o.levelScore = Math.max(WA_WEIGHT[o.wa] || 0, CAA_WEIGHT[o.caa] || 0);
      o.distList = String(o.dist || '').split('').map(c => DIST_LABEL[c]).filter(Boolean);
      // 官方报名入口（头部赛事，来自 entry.js 已核实清单）
      o.url = (window.RACE_URLS && window.RACE_URLS[o.name]) || '';
      return o;
    });
  }

  const ALL = hydrate(window.RACES_2026 || [], 2026)
    .concat(hydrate(window.RACES_2027 || [], 2027))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.name.localeCompare(b.name, 'zh'));

  // 数据层异常可见化（P1-1）：不再静默吞掉格式错误的行
  if (BAD_ROWS.length) {
    console.warn('[RunCal] 日期格式异常的赛事行：', BAD_ROWS);
    showFatal('有 ' + BAD_ROWS.length + ' 条赛事日期格式异常，已跳过：'
      + BAD_ROWS.slice(0, 3).join('、') + (BAD_ROWS.length > 3 ? ' 等' : ''));
  }

  // 报名时间（regtime.js）：同名赛事去重（2026 真实届优先），
  // 仅对收录到的第一份挂载，并按官方报名窗口实时修正报名状态
  {
    const seenReg = new Set();
    ALL.forEach(r => {
      const reg = window.RACE_REG && window.RACE_REG[r.name];
      if (!reg || seenReg.has(r.name)) return;
      seenReg.add(r.name);
      r.reg = reg;
      if (!r.past) {
        const now = new Date();
        const openAt = parseDT(reg.open), closeAt = parseDT(reg.close);
        if (closeAt && now > closeAt) r.status = 'closed';
        else if (openAt && now >= openAt) r.status = 'open';
        else if (openAt) r.status = 'soon';
      }
    });
  }

  // 赛道难度三件套（difficulty.js）：按赛道名挂载，2026/2027 同名届共享
  //（2027 届与 2026 届为同一赛道，路线若调整以组委会最终公告为准）
  // 同时计算 PB 可量化指数（P2-5），无难度数据的赛事为 null（不展示）
  ALL.forEach(r => {
    const diff = window.RACE_DIFF && window.RACE_DIFF[r.name];
    if (diff) {
      r.diff = diff;
      r.pbScore = calcPBIndex(r);
      r.pbGrade = pbGrade(r.pbScore);
    }
  });

  /* 赛事对比选择集（提前声明，供卡片/列表渲染引用） */
  const compareSet = new Set();
  const MAX_CMP = 4;

  /* 个人中心：本地存储（localStorage），不上传服务器 */
  const LS_COL = 'mb_col_v1';
  const LS_PB = 'mb_pb_v1';
  function loadJSON(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  let colSet = new Set(loadJSON(LS_COL, []));
  let pbList = loadJSON(LS_PB, []);

  /* ---------- 2. 工具 ---------- */
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icoPin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  function waBadge(r) {
    if (!r.wa) return '';
    const cls = { '白金标': 'platinum', '金标': 'gold', '精英标': 'elite', '标牌': 'label' }[r.wa] || 'caa';
    return `<span class="badge ${cls}">世界田联 ${r.wa}</span>`;
  }
  function distBadges(r) {
    return r.distList.slice(0, 3).map(d => `<span class="badge dist">${d.replace('马拉松', '马')}</span>`).join('');
  }
  function statusBadge(r) {
    return `<span class="st ${r.status}">${STATUS_TEXT[r.status] || r.status}</span>`;
  }

  /* ---------- 3. 顶部统计 ---------- */
  const provSet = new Set(ALL.map(r => r.province));
  const citySet = new Set(ALL.map(r => r.province + '/' + r.city));
  const waCount = ALL.filter(r => r.wa).length;
  const aCount = ALL.filter(r => r.caa.charAt(0) === 'A').length;
  const openCount = ALL.filter(r => r.status === 'open').length;
  const autumn = ALL.filter(r => [10, 11].includes(r.month)).length;
  const totalScale = ALL.reduce((s, r) => s + r.scale, 0);
  const upcoming = ALL.filter(r => !r.past).length;

  function setText(id, v) { const n = $(id); if (n) n.textContent = v; }
  setText('#heroProv', provSet.size);
  setText('#heroCity', citySet.size);
  setText('#heroTotal', ALL.length);
  setText('#tagWa', waCount);
  setText('#tagA', aCount);
  setText('#tagAutumn', autumn);
  setText('#tagOpen', openCount);
  setText('#asOf', DATA_SNAPSHOT);
  setText('#ftTotal', ALL.length);
  setText('#ftProv', provSet.size);
  setText('#ftWa', waCount);
  setText('#ftScale', (totalScale / 10000).toFixed(1));
  setText('#ftDate', DATA_SNAPSHOT);
  setText('#navDate', TODAY_STR.replace(/-/g, '.'));

  /* 统计卡 */
  const STATS = [
    { k: '收录赛事', v: ALL.length, u: '场', d: '2026 + 2027 两个赛季', c: 'accent' },
    { k: '覆盖城市', v: citySet.size, u: '座', d: provSet.size + ' 个省级行政区' },
    { k: '待跑赛事', v: upcoming, u: '场', d: '尚未鸣枪的赛事', c: 'accent' },
    { k: '标牌赛事', v: waCount, u: '场', d: '世界田联认证赛事', c: 'fire' },
    { k: '当前可报', v: openCount, u: '场', d: '报名窗口开放中', c: 'accent' },
    { k: '总规模', v: (totalScale / 10000).toFixed(1), u: '万人', d: '全部赛事名额合计' }
  ];
  const sg = $('#statsGrid');
  STATS.forEach(s => {
    sg.appendChild(el('div', 'stat ' + (s.c || ''),
      `<div class="k">${s.k}</div><div class="v">${s.v}<small>${s.u}</small></div><div class="d">${s.d}</div>`));
  });

  /* count-up：统计卡数字从 0 滚动到目标值（报告 5.4，计时器隐喻） */
  $$('#statsGrid .stat .v').forEach(node => {
    const m = node.textContent.match(/^([\d.]+)/);
    if (!m) return;
    const target = parseFloat(m[1]);
    if (!isFinite(target)) return;
    const decimals = (m[1].split('.')[1] || '').length;
    const suffix = node.innerHTML.slice(m[1].length); // 保留 <small> 等单位标签
    const dur = 1000, t0 = performance.now();
    (function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      node.innerHTML = (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });

  /* ---------- 4. 月份分布 ---------- */
  const monthCount = {};
  for (let m = 1; m <= 12; m++) monthCount[m] = { 2026: 0, 2027: 0 };
  ALL.forEach(r => monthCount[r.month][r.year]++);
  const maxMonth = Math.max(...[].concat(...Object.values(monthCount).map(o => [o[2026], o[2027]])), 1);

  const mb = $('#monthBars');
  for (let m = 1; m <= 12; m++) {
    const c = monthCount[m];
    const h26 = (c[2026] / maxMonth) * 100;
    const h27 = (c[2027] / maxMonth) * 100;
    const col = el('div', 'bar-col',
      `<div class="bar-stack">
         <i class="y26" style="height:0" data-h="${h26}"></i>
         <i class="y27" style="height:0" data-h="${h27}"></i>
       </div>
       <b>${c[2026] + c[2027]}</b>
       <span>${MONTH_EN[m - 1]}</span>`);
    mb.appendChild(col);
  }
  setTimeout(() => $$('#monthBars .bar-stack i').forEach(b => { b.style.height = b.dataset.h + '%'; }), 120);

  /* ---------- 5. 区域 + 等级 ---------- */
  const regionCount = {};
  REGIONS.forEach(r => regionCount[r] = 0);
  ALL.forEach(r => { if (regionCount[r.region] !== undefined) regionCount[r.region]++; });
  const regionSorted = REGIONS.slice().sort((a, b) => regionCount[b] - regionCount[a]);
  const maxRegion = Math.max(...Object.values(regionCount), 1);
  const rb = $('#regionBars');
  regionSorted.forEach(r => {
    const row = el('div', 'hbar',
      `<span class="nm">${r}</span>
       <span class="tk"><i style="width:0" data-w="${(regionCount[r] / maxRegion) * 100}"></i></span>
       <span class="vl">${regionCount[r]}</span>`);
    rb.appendChild(row);
  });
  setTimeout(() => $$('#regionBars .tk i').forEach(b => { b.style.width = b.dataset.w + '%'; }), 120);

  const TIERS = [
    { n: '白金标 Platinum', k: '白金标', c: 'var(--wa-platinum)' },
    { n: '金标 Gold', k: '金标', c: 'var(--wa-gold)' },
    { n: '精英标 Elite', k: '精英标', c: 'var(--wa-elite)' },
    { n: '标牌 Label', k: '标牌', c: 'var(--wa-label)' }
  ];
  const tr = $('#tierRows');
  TIERS.forEach(t => {
    const n = ALL.filter(r => r.wa === t.k).length;
    tr.appendChild(el('div', 'tier-row',
      `<i class="sw" style="background:${t.c}"></i><span class="nm">${t.n}</span><span class="vl">${n}</span>`));
  });
  tr.appendChild(el('div', 'tier-row',
    `<i class="sw" style="background:rgba(255,255,255,.25)"></i><span class="nm">无标牌认证（田协 A/B/C 类）</span><span class="vl">${ALL.length - waCount}</span>`));

  /* ---------- 6. 筛选状态 ---------- */
  const F = {
    year: 'all',
    region: new Set(),
    province: new Set(),
    city: new Set(),
    month: 'all',
    level: 'all',
    dist: 'all',
    status: 'all',
    regwin: 'all',
    dFrom: null,
    dTo: null,
    q: '',
    sort: 'date',
    view: 'card'
  };

  const regionBox = $('#fRegion');
  regionBox.appendChild(el('button', 'chip on', '全部')).dataset.v = 'all';
  regionSorted.forEach(r => {
    const b = el('button', 'chip', r + ' ' + regionCount[r]);
    b.dataset.v = r;
    regionBox.appendChild(b);
  });

  const monthBox = $('#fMonth');
  monthBox.appendChild(el('button', 'chip on', '全年')).dataset.v = 'all';
  for (let m = 1; m <= 12; m++) {
    const b = el('button', 'chip', m + '月');
    b.dataset.v = String(m);
    monthBox.appendChild(b);
  }

  // 单选组
  [['#fYear', 'year'], ['#fMonth', 'month'], ['#fLevel', 'level'], ['#fDist', 'dist'], ['#fStatus', 'status'], ['#fRegWin', 'regwin']]
    .forEach(([sel, key]) => {
      $(sel).addEventListener('click', e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        $$('#' + sel.slice(1) + ' .chip').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        F[key] = b.dataset.v;
        renderRaces();
      });
    });

  // 区域多选
  regionBox.addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.dataset.v === 'all') {
      F.region.clear();
      $$('#fRegion .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    } else {
      b.classList.toggle('on');
      const v = b.dataset.v;
      b.classList.contains('on') ? F.region.add(v) : F.region.delete(v);
      const allBtn = regionBox.querySelector('[data-v="all"]');
      allBtn.classList.toggle('on', F.region.size === 0);
    }
    renderRaces();
  });

  let searchTimer;
  // 自然语言搜索（P2-8）：把「本周六 / 全马 / A1 / 金标 / 报名中」等口语词解析到对应筛选器，
  // 其余文字仍作为关键词。日期窗口是新增的独立筛选（F.dFrom/dTo），其余复用现有 chip 联动。
  const NL_WD = ['日', '一', '二', '三', '四', '五', '六'];
  function nlMonday(d) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function nlFmt(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nlMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function applyNaturalSearch(raw) {
    let v = raw.trim();
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const hits = [];
    const clickChip = (sel, val) => {
      const chip = document.querySelector(sel + ' .chip[data-v="' + val + '"]');
      if (chip && !chip.classList.contains('on')) chip.click();
    };
    const strip = re => { v = v.replace(re, ''); };
    // ---- 状态 ----
    if (/报名中|能报|可报|开放报名/.test(v)) { clickChip('#fStatus', 'open'); strip(/报名中|能报|可报|开放报名/g); hits.push('报名中'); }
    if (/待开启|即将开抢|即将开启/.test(v)) { clickChip('#fStatus', 'soon'); strip(/待开启|即将开抢|即将开启/g); hits.push('待开启'); }
    // ---- 项目 ----
    if (/全程马拉松|全马|全程/.test(v)) { clickChip('#fDist', 'F'); strip(/全程马拉松|全马|全程/g); hits.push('全程'); }
    else if (/半程马拉松|半马|半程/.test(v)) { clickChip('#fDist', 'H'); strip(/半程马拉松|半马|半程/g); hits.push('半程'); }
    else if (/10 ?公里|10K|十公里/i.test(v)) { clickChip('#fDist', 'T'); strip(/10 ?公里|10K|十公里/gi); hits.push('10公里'); }
    else if (/欢乐跑/.test(v)) { clickChip('#fDist', 'R'); strip(/欢乐跑/g); hits.push('欢乐跑'); }
    // ---- 等级（白金标须先于金标判断） ----
    if (/白金标/.test(v)) { clickChip('#fLevel', '白金标'); strip(/白金标/g); hits.push('白金标'); }
    else if (/金标/.test(v)) { clickChip('#fLevel', '金标'); strip(/金标/g); hits.push('金标'); }
    else if (/精英标/.test(v)) { clickChip('#fLevel', '精英标'); strip(/精英标/g); hits.push('精英标'); }
    else if (/A1/.test(v)) {
      const chip = Array.prototype.find.call(document.querySelectorAll('#fLevel .chip'), c => c.textContent.indexOf('A1') >= 0);
      if (chip && !chip.classList.contains('on')) chip.click();
      strip(/A1/g); hits.push('A1类');
    }
    // ---- 日期窗口 ----
    let range = null, rangeLabel = '';
    let m;
    if ((m = v.match(/(本|这)周([日一二三四五六])/))) {
      const base = nlMonday(now), t = new Date(base);
      t.setDate(base.getDate() + NL_WD.indexOf(m[2]));
      if (t < now) t.setDate(t.getDate() + 7);          // 已过的本周X按下一个同名日理解
      range = [nlFmt(t), nlFmt(t)];
      rangeLabel = (t.getTime() === now.getTime() ? '今天' : '本周' + m[2]) + ' ' + nlMD(t);
    } else if ((m = v.match(/下周([日一二三四五六])/))) {
      const base = nlMonday(now), t = new Date(base);
      t.setDate(base.getDate() + 7 + NL_WD.indexOf(m[2]));
      range = [nlFmt(t), nlFmt(t)];
      rangeLabel = '下周' + m[2] + ' ' + nlMD(t);
    } else if (/本周末|这周末/.test(v)) {
      const sat = new Date(now); sat.setDate(now.getDate() + (6 - now.getDay() + 7) % 7);
      const sun = new Date(sat); sun.setDate(sat.getDate() + 1);
      range = [nlFmt(sat), nlFmt(sun)];
      rangeLabel = '周末 ' + nlMD(sat) + '–' + nlMD(sun);
    } else if (/(本|这)周/.test(v)) {
      const a = nlMonday(now), b = new Date(a); b.setDate(a.getDate() + 6);
      range = [nlFmt(a), nlFmt(b)];
      rangeLabel = '本周 ' + nlMD(a) + '–' + nlMD(b);
    } else if (/下周/.test(v)) {
      const a = nlMonday(now); a.setDate(a.getDate() + 7);
      const b = new Date(a); b.setDate(a.getDate() + 6);
      range = [nlFmt(a), nlFmt(b)];
      rangeLabel = '下周 ' + nlMD(a) + '–' + nlMD(b);
    } else if (/明天/.test(v)) {
      const t = new Date(now); t.setDate(now.getDate() + 1);
      range = [nlFmt(t), nlFmt(t)];
      rangeLabel = '明天 ' + nlMD(t);
    } else if (/今天|今日/.test(v)) {
      range = [nlFmt(now), nlFmt(now)];
      rangeLabel = '今天 ' + nlMD(now);
    }
    if (range) { F.dFrom = range[0]; F.dTo = range[1]; strip(/(本|这)周[日一二三四五六]?|下周[日一二三四五六]?|本周末|这周末|明天|今天|今日/g); hits.push(rangeLabel); }
    // ---- 剩余文字作为关键词 ----
    v = v.replace(/^[，。,.\s]+|[，。,.\s]+$/g, '');
    F.q = v;
    // ---- 提示条（日期窗口可单独清除） ----
    const hint = $('#fSearchHint');
    if (hint) {
      hint.innerHTML = hits.map(h => '<span class="nl-chip">' + esc(h) + '</span>').join('')
        + (range ? '<button type="button" class="nl-clear" id="nlDateClear" aria-label="清除日期筛选">清除日期 ✕</button>' : '');
      const xc = $('#nlDateClear');
      if (xc) xc.addEventListener('click', () => {
        F.dFrom = F.dTo = null;
        if (hint) hint.innerHTML = '';
        renderRaces();
      });
    }
    renderRaces();
  }
  $('#fSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const raw = e.target.value;
    searchTimer = setTimeout(() => { applyNaturalSearch(raw); }, 160);
  });
  $('#fSort').addEventListener('change', e => { F.sort = e.target.value; renderRaces(); });
  $$('.view-toggle button').forEach(b => b.addEventListener('click', () => {
    $$('.view-toggle button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    F.view = b.dataset.v;
    renderRaces();
  }));

  // Hero CTA：本月能报什么 → 自动筛选「报名中」并跳转赛事库
  const ctaOpen = $('#ctaOpen');
  if (ctaOpen) ctaOpen.addEventListener('click', () => {
    const chip = document.querySelector('#fStatus .chip[data-v="open"]');
    if (chip && !chip.classList.contains('on')) chip.click();
  });

  // 两级筛选：移动端「更多筛选」→ 底部抽屉（P3-9）；桌面端 CSS 恒展开
  const fMore = $('#fMore'), fAdv = $('#fAdv');
  const fMask = $('#fSheetMask'), fDone = $('#fSheetDone');
  if (fMore && fAdv) {
    // 抽屉仅在 ≤720px 生效（与 CSS media query 同断点）
    const isSheet = () => window.matchMedia('(max-width:720px)').matches;
    /* .filters 是 sticky + z-index，会创建堆叠上下文并充当 fixed 的包含块，
       导致抽屉被压在遮罩之下、且无法贴视口底。故移动端打开时把抽屉临时提升到
       <body> 末尾（portal），关闭 / 回到桌面端时按占位符移回原位。 */
    let slot = null;
    const lift = () => {
      if (fAdv.parentElement === document.body) return;
      slot = document.createComment('fAdv');
      fAdv.parentElement.insertBefore(slot, fAdv);
      document.body.appendChild(fAdv);
    };
    const drop = () => {
      if (slot && fAdv.parentElement === document.body) {
        slot.parentNode.insertBefore(fAdv, slot);
        slot.remove();
      }
      slot = null;
    };
    const setAdv = open => {
      fAdv.classList.toggle('open', open);
      fMore.classList.toggle('open', open);
      fMore.setAttribute('aria-expanded', open ? 'true' : 'false');
      const sheet = open && isSheet();
      document.body.classList.toggle('sheet-open', sheet);
      if (sheet) lift(); else drop();
      if (fMask) fMask.hidden = !sheet;
      document.body.style.overflow = sheet ? 'hidden' : '';
    };
    fMore.addEventListener('click', () => setAdv(!fAdv.classList.contains('open')));
    if (fDone) fDone.addEventListener('click', () => setAdv(false));
    if (fMask) fMask.addEventListener('click', () => setAdv(false));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && fAdv.classList.contains('open') && isSheet()) setAdv(false);
    });
    // 视口放大回桌面端时，抽屉回归常态并清掉遗留状态
    window.addEventListener('resize', () => {
      if (!isSheet() && fAdv.classList.contains('open')) {
        drop();
        document.body.classList.remove('sheet-open');
        if (fMask) fMask.hidden = true;
        document.body.style.overflow = '';
      }
    });
  }

  // 已激活的高级筛选项数量徽标（报名窗口 / 赛季 / 区域 / 月份 / 等级 / 项目）
  function syncFilterMore() {
    const badge = $('#fMoreN');
    if (!badge) return;
    const n = (F.year !== 'all' ? 1 : 0) + (F.region && F.region.size ? 1 : 0)
            + (F.province && F.province.size ? 1 : 0) + (F.city && F.city.size ? 1 : 0)
            + (F.month !== 'all' ? 1 : 0) + (F.level !== 'all' ? 1 : 0) + (F.dist !== 'all' ? 1 : 0)
            + (F.regwin !== 'all' ? 1 : 0);
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
  }

  // 距今日的自然日差（同日=0，明天=1）
  function daysFromToday(d) {
    const now = new Date();
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate())
      - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  }
  // 报名窗口匹配（P1-2）：基于 regtime.js 已核实的报名时间实时计算
  function matchRegWin(r) {
    if (F.regwin === 'all' || !r.reg) return F.regwin === 'all';
    const now = new Date();
    const openAt = parseDT(r.reg.open), closeAt = parseDT(r.reg.close);
    if (F.regwin === 'soon7') return !!(openAt && openAt > now && daysFromToday(openAt) <= 7);
    if (F.regwin === 'close7') return !!(closeAt && closeAt > now && daysFromToday(closeAt) <= 7);
    return false;
  }

  function matchLevel(r) {
    const v = F.level;
    if (v === 'all') return true;
    if (['白金标', '金标', '精英标', '标牌'].includes(v)) return r.wa === v;
    return r.caa.charAt(0) === v;
  }

  function filtered() {
    let list = ALL.filter(r => {
      if (F.year !== 'all' && r.year !== Number(F.year)) return false;
      if (F.region.size && !F.region.has(r.region)) return false;
      if (F.province.size && !F.province.has(r.province)) return false;
      if (F.city.size && !F.city.has(r.province + '/' + r.city)) return false;
      if (F.month !== 'all' && r.month !== Number(F.month)) return false;
      if (!matchLevel(r)) return false;
      if (F.dist !== 'all' && r.dist.indexOf(F.dist) < 0) return false;
      if (F.status !== 'all' && r.status !== F.status) return false;
      if (!matchRegWin(r)) return false;
      if (F.dFrom && r.date < F.dFrom) return false;
      if (F.dTo && r.date > F.dTo) return false;
      if (F.q) {
        const q = F.q.toLowerCase();
        const hay = (r.name + r.city + r.province + r.note + r.tags.join('')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (F.sort === 'scale') list.sort((a, b) => b.scale - a.scale || a.date.localeCompare(b.date));
    else if (F.sort === 'level') list.sort((a, b) => b.levelScore - a.levelScore || a.date.localeCompare(b.date));
    else list.sort((a, b) => a.date.localeCompare(b.date) || b.levelScore - a.levelScore);
    return list;
  }

  /* ---------- 7. 赛事卡片 / 列表 ---------- */
  function bibCard(r) {
    const c = el('div', 'bib' + (r.past ? ' past' : ''));
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', r.name + ' · ' + r.province + '·' + r.city + ' · 查看赛事详情');
    const rec = window.COURSE_RECORDS && window.COURSE_RECORDS[r.name];
    const flag = (!r.confirmed && r.year === 2027) ? '<span class="bib-flag tbd">待官宣</span>'
      : (r.status === 'open' ? '<span class="bib-flag hot">报名中</span>' : '');
    c.innerHTML = `
      <button class="col-toggle${colSet.has(r.id) ? ' on' : ''}" data-id="${r.id}" type="button" title="收藏到个人赛程">★</button>
      <button class="cmp-toggle${compareSet.has(r.id) ? ' on' : ''}" data-id="${r.id}" type="button" title="加入 / 移出对比">${compareSet.has(r.id) ? '✓ 已选' : '＋ 对比'}</button>
      ${flag}
      <div class="bib-top">
        <div class="bib-date">
          <span class="d">${String(r.day).padStart(2, '0')}</span>
          <span class="m">${MONTH_EN[r.month - 1]}</span>
          <span class="y">${r.year}</span>
        </div>
        <div class="bib-main">
          <div class="bib-name">${esc(r.name)}</div>
          <div class="bib-loc">${icoPin}<span>${esc(r.province)} · ${esc(r.city)}</span></div>
          <div class="bib-badges">${waBadge(r)}${r.caa ? `<span class="badge caa">田协${r.caa}类</span>` : ''}${distBadges(r)}${r.diff ? `<span class="badge diff-${r.diff.level}" title="赛道难度：${r.diff.level}${r.diff.level === '低' ? '（PB 友好）' : ''}｜累计爬升 ${r.diff.gain != null ? r.diff.gain + ' 米' : '官方未公布'}｜${esc(r.diff.alt)}">${r.diff.level}难度</span>` : ''}</div>
        </div>
      </div>
      <div class="bib-body">
        <div class="bib-note">${esc(r.note || r.tags.join(' · ') || '—')}</div>
        ${rec ? `<div class="bib-rec"><span class="bk">历史最佳</span> 男 ${rec.m ? rec.m.t : '—'} · 女 ${rec.w ? rec.w.t : '—'}</div>` : ''}
        <div class="bib-foot">
          <span class="bib-scale">规模 <b>${r.scale ? (r.scale / 10000 >= 1 ? (r.scale / 10000).toFixed(1) + '万' : r.scale) : '—'}</b></span>
          ${statusBadge(r)}
        </div>
      </div>`;
    c.addEventListener('click', e => { if (e.target.closest('.cmp-toggle') || e.target.closest('.col-toggle')) return; openModal(r); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest('.cmp-toggle') || e.target.closest('.col-toggle')) return; e.preventDefault(); openModal(r); } });
    return c;
  }

  function tlRow(r) {
    const c = el('div', 'tl-item' + (r.past ? ' past' : ''));
    c.tabIndex = 0;
    c.setAttribute('role', 'button');
    c.setAttribute('aria-label', r.name + ' · ' + r.province + '·' + r.city + ' · 查看赛事详情');
    c.innerHTML = `
      <span class="dt">${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}</span>
      <span class="nm">${esc(r.name)}<em>${esc(r.province)}·${esc(r.city)}</em>${r.wa ? `<span class="badge ${{ '白金标': 'platinum', '金标': 'gold', '精英标': 'elite', '标牌': 'label' }[r.wa]}">${r.wa}</span>` : ''}</span>
      <span class="rt"><span class="st ${r.status}">${STATUS_TEXT[r.status]}</span><button class="col-toggle sm${colSet.has(r.id) ? ' on' : ''}" data-id="${r.id}" type="button" title="收藏到个人赛程">★</button><button class="cmp-toggle sm${compareSet.has(r.id) ? ' on' : ''}" data-id="${r.id}" type="button" title="加入 / 移出对比">${compareSet.has(r.id) ? '✓' : '＋'}</button></span>`;
    c.addEventListener('click', e => { if (e.target.closest('.cmp-toggle') || e.target.closest('.col-toggle')) return; openModal(r); });
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { if (e.target.closest('.cmp-toggle') || e.target.closest('.col-toggle')) return; e.preventDefault(); openModal(r); } });
    return c;
  }

  function renderRaces() {
    const list = filtered();
    syncFilterMore();
    $('#fCount').textContent = list.length;
    const grid = $('#raceGrid'), tl = $('#raceTimeline');
    grid.innerHTML = ''; tl.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">0</div>没有匹配的赛事，试试放宽筛选条件</div>`;
      grid.style.display = 'grid'; tl.style.display = 'none';
      return;
    }

    if (F.view === 'card') {
      grid.style.display = 'grid'; tl.style.display = 'none';
      grid.classList.remove('grid-list');
      const frag = document.createDocumentFragment();
      list.forEach(r => frag.appendChild(bibCard(r)));
      grid.appendChild(frag);
    } else if (F.view === 'list') {
      // 列表视图：单列紧凑行（收藏/对比/状态一目了然）
      grid.style.display = 'grid'; tl.style.display = 'none';
      grid.classList.add('grid-list');
      const frag = document.createDocumentFragment();
      list.forEach(r => frag.appendChild(tlRow(r)));
      grid.appendChild(frag);
    } else {
      grid.style.display = 'none'; tl.style.display = 'block';
      grid.classList.remove('grid-list');
      renderTimelineInto(tl, list);
    }
  }

  /* ---------- 8. 时间轴 ---------- */
  function renderTimelineInto(host, list) {
    const groups = new Map();
    list.forEach(r => {
      const k = r.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    });
    Array.from(groups.keys()).sort().forEach(k => {
      const [y, m] = k.split('-');
      const items = groups.get(k);
      const box = el('div', 'tl-month');
      box.id = 'm-' + k;
      box.innerHTML = `<div class="tl-mh"><b>${y}.${m}</b><span>${MONTH_EN[Number(m) - 1]} ${y}</span><span class="cnt">${items.length} RACES</span></div>`;
      const ul = el('div', 'tl-list');
      items.forEach(r => ul.appendChild(tlRow(r)));
      box.appendChild(ul);
      host.appendChild(box);
    });
  }
  renderTimelineInto($('#timeline'), ALL);

  /* ---------- 9. 排行榜 ---------- */
  /* P2-5 PB 可量化指数：基于已核实的赛道难度数据（difficulty.js）建模。
     无赛道数据的赛事返回 null（不展示）。分数越高越适合刷 PB。
     维度：基础 60 + 爬升（≤50 +20 / 51-100 +12 / 101-150 +5 / 151-200 0 / >200 -15）
           + 海拔（<300 +10 / 300-800 +2 / 800-1200 -8 / >1200 -15）
           + 关门 ≥6h15m 大众友好 +5 + 白金标 +5 / 金标 +3 + 规模 ≥3万 +3
     封顶 100，保底 5。档位：S≥90 / A 80-89 / B 70-79 / C 60-69 / D<60 */
  function calcPBIndex(r) {
    const d = r.diff;
    if (!d || typeof d.gain !== 'number') return null;
    let s = 60;
    const altTxt = d.alt || '';
    const rg = altTxt.match(/(\d+)\s*[–-]\s*(\d+)/);
    const altM = rg ? (+rg[1] + +rg[2]) / 2
      : ((altTxt.match(/(\d+)\s*m/) || [])[1] ? +RegExp.$1 : 0);
    const g = d.gain;
    if (g <= 50) s += 20; else if (g <= 100) s += 12; else if (g <= 150) s += 5; else if (g <= 200) s += 0; else s -= 15;
    if (altM < 300) s += 10; else if (altM < 800) s += 2; else if (altM < 1200) s -= 8; else s -= 15;
    if (/6[:：]1[5-9]|6[:：][2-9]|7[:：]/.test(d.limit)) s += 5;
    if (r.wa === '白金标') s += 5; else if (r.wa === '金标') s += 3;
    if (r.scale >= 30000) s += 3;
    return Math.max(5, Math.min(100, s));
  }
  function pbGrade(score) {
    if (score >= 90) return { g: 'S', t: '极速赛道 · PB 首选' };
    if (score >= 80) return { g: 'A', t: '优秀 · 容易出成绩' };
    if (score >= 70) return { g: 'B', t: '良好 · 可冲成绩' };
    if (score >= 60) return { g: 'C', t: '一般 · 稳完赛为主' };
    return { g: 'D', t: '挑战 · 高原/大爬升' };
  }

  const RANKS = [
    {
      t: '参赛规模 TOP15', f: () => ALL.slice().sort((a, b) => b.scale - a.scale).slice(0, 15),
      v: r => (r.scale / 10000).toFixed(1) + '万', u: '总规模'
    },
    {
      t: '世界田联标牌 TOP15', f: () => ALL.filter(r => r.wa).sort((a, b) => b.levelScore - a.levelScore || b.scale - a.scale).slice(0, 15),
      v: r => r.wa, u: r => r.province + ' · ' + r.city
    },
    {
      t: 'PB 快速赛道 TOP15', f: () => ALL.filter(r => r.tags.includes('PB')).sort((a, b) => b.levelScore - a.levelScore || b.scale - a.scale).slice(0, 15),
      v: r => r.wa || ('田协' + r.caa + '类'), u: r => '规模 ' + (r.scale ? (r.scale / 10000 >= 1 ? (r.scale / 10000).toFixed(1) + '万' : r.scale) : '—')
    },
    {
      t: 'PB 赛道指数榜 TOP15', note: 'P2-5 可量化指数：基于已核实的赛道难度数据（累计爬升 / 海拔 / 关门时间）+ 世界田联等级与参赛规模量化的 PB 友好度（越高越适合刷成绩）。S≥90 · A 80–89 · B 70–79 · C 60–69 · D<60。按赛事名去重，2026/2027 同赛道并列展示，目前随难度数据扩充持续增加。',
      f: () => {
        const seen = new Set();
        return ALL.filter(r => r.pbScore != null && !seen.has(r.name) && seen.add(r.name))
          .sort((a, b) => b.pbScore - a.pbScore).slice(0, 15);
      },
      v: r => r.pbScore + ' <em class="pb-g">' + r.pbGrade.g + '</em>', u: r => '爬升 ' + r.diff.gain + 'm · 关门 ' + r.diff.limit
    },
    {
      t: '特色赛道 TOP15', note: '本榜标签（海滨 / 高原 / 长城 / 沙漠 / 花海 / 最美赛道等）为人工整理的「小编推荐」主题分类，非官方认证口径，供选赛参考。',
      f: () => {
        const keys = ['海滨', '高原', '长城', '沙漠', '草原', '花海', '边境', '风景', '最美赛道', '人文'];
        return ALL.filter(r => r.tags.some(t => keys.includes(t)))
          .sort((a, b) => b.levelScore - a.levelScore || b.scale - a.scale).slice(0, 15);
      },
      v: r => r.tags.slice(0, 2).join(' / '), u: r => r.province + ' · ' + r.city
    },
    {
      t: '当前可报名赛事', f: () => ALL.filter(r => r.status === 'open').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 15),
      v: r => r.date.slice(5).replace('-', '/'), u: r => r.province + ' · ' + r.city
    },
    {
      t: '全国城市成绩榜', note: '按各城市全程马拉松男子赛会纪录（历史最好成绩）最快排序。每行 M/W 为该城市赛会纪录（不限国籍），中M/中W 为中国运动员（含港、澳、台）历史最好成绩。10 公里 / 半程不计入本榜。点击可查看该城市代表赛事。',
      custom: renderCityRank
    },
    {
      t: '世界大满贯成绩榜', note: '世界马拉松大满贯（World Marathon Majors）七大满贯赛会纪录，按男子纪录排序。世界纪录见顶部横幅。注：榜单汇集历年（截至 2026 赛季）赛会纪录，跨年混排非同年数据，仅作历史最快成绩参考。',
      custom: renderWorldRank
    }
  ];

  /* 时间换算（H:MM:SS 或 MM:SS） */
  function toSec(t) {
    const p = String(t).split(':');
    if (p.length === 3) return (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
    if (p.length === 2) return (+p[0]) * 60 + (+p[1]);
    return 0;
  }

  /* 全国城市成绩榜：按城市聚合全程马拉松赛会纪录 + 中国籍最好成绩 */
  function buildCityRecords() {
    const nameToRace = {};
    ALL.forEach(r => { nameToRace[r.name] = r; });
    const CN = window.CN_BEST || {};
    const city = {};
    Object.keys(window.COURSE_RECORDS || {}).forEach(name => {
      const rec = window.COURSE_RECORDS[name];
      const race = nameToRace[name];
      if (!race) return;
      if (!race.distList.some(d => d.indexOf('全程') >= 0)) return; // 仅统计全程马拉松，排除半程/10公里
      const c = race.city;
      if (!city[c]) city[c] = { city: c, m: null, w: null, cm: null, cw: null };
      if (rec.m) {
        const sec = toSec(rec.m.t);
        if (!city[c].m || sec < city[c].m.sec)
          city[c].m = { sec, t: rec.m.t, name: rec.m.n, year: rec.m.y, race: name };
      }
      if (rec.w) {
        const sec = toSec(rec.w.t);
        if (!city[c].w || sec < city[c].w.sec)
          city[c].w = { sec, t: rec.w.t, name: rec.w.n, year: rec.w.y, race: name };
      }
      // 中国籍最好成绩（按城市取最快）
      const cn = CN[name];
      if (cn) {
        if (cn.m) {
          const sec = toSec(cn.m.t);
          if (!city[c].cm || sec < city[c].cm.sec)
            city[c].cm = { sec, t: cn.m.t, name: cn.m.n, year: cn.m.y, race: name };
        }
        if (cn.w) {
          const sec = toSec(cn.w.t);
          if (!city[c].cw || sec < city[c].cw.sec)
            city[c].cw = { sec, t: cn.w.t, name: cn.w.n, year: cn.w.y, race: name };
        }
      }
    });
    const arr = Object.values(city).filter(c => c.m);
    arr.sort((a, b) => a.m.sec - b.m.sec);
    return arr;
  }

  function renderCityRank(host) {
    const data = buildCityRecords();
    data.forEach((c, i) => {
      const m = c.m, w = c.w, cm = c.cm, cw = c.cw;
      const row = el('div', 'rank-row rank-rec' + (i < 3 ? ' top' + (i + 1) : ''));
      const cnCell = (label, rec) => rec
        ? `<span class="rec-col rec-cn"><b>${label}</b> ${rec.t}<em>${esc(rec.name)} · ${rec.year}</em></span>`
        : `<span class="rec-col rec-cn rec-none"><b>${label}</b> 暂无公开成绩</span>`;
      row.innerHTML = `
        <span class="rank-no">${String(i + 1).padStart(2, '0')}</span>
        <span class="rank-main"><b>${esc(c.city)}</b><button type="button" class="city-filter-btn" data-prov="${esc(c.prov || '')}" data-city="${esc(c.city)}" aria-label="在赛事库中筛选${esc(c.city)}的赛事">筛选该市赛事</button><span>${esc(m.race)} · 全程</span></span>
        <span class="rank-recs">
          <span class="rec-col rec-m"><b>M</b> ${m.t}<em>${esc(m.name)} · ${m.year}</em></span>
          ${w ? `<span class="rec-col rec-w"><b>W</b> ${w.t}<em>${esc(w.name)} · ${w.year}</em></span>` : `<span class="rec-col rec-w rec-none"><b>W</b> 暂无公开纪录</span>`}
          <span class="rec-sep"></span>
          ${cnCell('中M', cm)}
          ${cnCell('中W', cw)}
        </span>`;
      row.addEventListener('click', () => {
        const r = ALL.find(x => x.name === m.race);
        if (r) openModal(r);
      });
      // 与「城市赛道榜」行为统一：一键筛选该市赛事（弹窗仍由整行点击打开）
      row.querySelector('.city-filter-btn').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const rep = ALL.find(x => x.name === m.race);
        const prov = btn.dataset.prov || (rep && rep.province) || '';
        if (prov) applyCityFilter(prov, btn.dataset.city);
      });
      host.appendChild(row);
    });
  }

  function renderWorldRank(host) {
    const rec = window.WORLD_RECORDS || {};
    if (rec.men && rec.women) {
      const banner = el('div', 'rank-banner');
      banner.innerHTML = `<span class="rb-label">WORLD RECORD</span>
        <span class="rb-item"><b>M</b> ${rec.men.t} — ${esc(rec.men.n)}（${rec.men.c} · ${esc(rec.men.race)} ${rec.men.y}）</span>
        <span class="rb-sep">/</span>
        <span class="rb-item"><b>W</b> ${rec.women.t} — ${esc(rec.women.n)}（${rec.women.c} · ${esc(rec.women.race)} ${rec.women.y}）</span>`;
      host.appendChild(banner);
    }
    (window.WORLD_MAJORS || []).forEach((c, i) => {
      const row = el('div', 'rank-row rank-rec' + (i < 3 ? ' top' + (i + 1) : ''));
      row.innerHTML = `
        <span class="rank-no">${String(i + 1).padStart(2, '0')}</span>
        <span class="rank-main"><b>${esc(c.city)}</b><span>${esc(c.race)} · 大满贯</span></span>
        <span class="rank-recs">
          <span class="rec-col rec-m"><b>M</b> ${c.m.t}<em>${esc(c.m.n)} · ${c.m.y}</em></span>
          <span class="rec-col rec-w"><b>W</b> ${c.w.t}<em>${esc(c.w.n)} · ${c.w.y}</em></span>
        </span>`;
      host.appendChild(row);
    });
  }

  const rt = $('#rankTabs');
  RANKS.forEach((rk, i) => {
    const b = el('button', i === 0 ? 'on' : '', rk.t);
    b.addEventListener('click', () => {
      $$('#rankTabs button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      renderRank(i);
    });
    rt.appendChild(b);
  });

  const RANK_LIMIT = 10;
  const rankExpanded = {};
  // 报名窗口提示（有经核实的报名时间时显示，供"现在该抢哪场"决策）
  function regHint(r) {
    if (!r.reg || r.past) return '';
    const now = new Date();
    const openAt = parseDT(r.reg.open), closeAt = parseDT(r.reg.close);
    if (closeAt && now < closeAt) {
      const d = daysFromToday(closeAt);
      return '⏳ 报名截止 ' + fmtMD(closeAt) + ' ' + fmtHM(closeAt)
        + (d === 0 ? ' · 今天' : (d === 1 ? ' · 明天' : ' · 剩 ' + d + ' 天'));
    }
    if (openAt && now < openAt) {
      const d = daysFromToday(openAt);
      return '⚡ ' + (d === 0 ? '今天' : fmtMD(openAt)) + ' ' + fmtHM(openAt) + ' 开抢';
    }
    return '⛔ 报名已截止';
  }
  function renderRank(i) {
    const rk = RANKS[i];
    const host = $('#rankList');
    host.innerHTML = '';
    if (rk.note) {
      const n = el('div', 'rank-note');
      n.textContent = rk.note;
      host.appendChild(n);
    }
    if (rk.custom) {
      rk.custom(host);
      return;
    }
    const list = rk.f();
    const all = !!rankExpanded[i];
    const shown = all ? list : list.slice(0, RANK_LIMIT);
    shown.forEach((r, n) => {
      const row = el('div', 'rank-row' + (n < 3 ? ' top' + (n + 1) : ''));
      row.innerHTML = `
        <span class="rank-no">${String(n + 1).padStart(2, '0')}</span>
        <span class="rank-main"><b>${esc(r.name)}</b><span>${r.year} · ${esc(r.province)}·${esc(r.city)} · ${r.distList.join(' / ')}</span></span>
        <span class="rank-val"><b>${typeof rk.v === 'function' ? rk.v(r) : rk.v}</b><span>${typeof rk.u === 'function' ? rk.u(r) : rk.u}</span></span>
        ${regHint(r) ? `<span class="rank-reg">${regHint(r)}</span>` : ''}`;
      row.addEventListener('click', () => openModal(r));
      host.appendChild(row);
    });
    if (list.length > RANK_LIMIT) {
      const more = el('button', 'rank-more');
      more.type = 'button';
      more.textContent = all ? ('收起（仅看前 ' + RANK_LIMIT + ' 场）') : ('展开全部 ' + list.length + ' 场');
      more.addEventListener('click', () => {
        if (all) delete rankExpanded[i]; else rankExpanded[i] = 1;
        renderRank(i);
      });
      host.appendChild(more);
    }
  }
  renderRank(0);

  /* ---------- 10. 倒计时 ---------- */
  // 今日鸣枪的赛事
  const todayRaces = ALL.filter(r => r.date === TODAY_STR);
  if (todayRaces.length) {
    $('#cdToday').innerHTML = `<b>今日鸣枪</b> ${todayRaces.map(r => esc(r.name)).join(' · ')}`;
    $('#cdToday').style.display = 'block';
  }

  const next = ALL.find(r => r.date > TODAY_STR);
  let nextRace = next;
  if (nextRace) {
    $('#cdName').textContent = nextRace.name;
    $('#cdCity').textContent = nextRace.province + ' · ' + nextRace.city;
    $('#cdDate').textContent = nextRace.date + (nextRace.confirmed || nextRace.year === 2026 ? '' : '（预估）');
    $('#cdGo').onclick = () => openModal(nextRace);
    $('#cdJump').onclick = () => {
      const t = document.getElementById('m-' + nextRace.date.slice(0, 7));
      if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    tick();
    setInterval(tick, 1000);
  }
  function tick() {
    if (!nextRace) return;
    const t = new Date(nextRace.date + 'T07:30:00') - new Date();
    const cd = $('#cdCompact');
    if (t <= 0) {
      $('#cdD').textContent = $('#cdH').textContent = $('#cdM').textContent = $('#cdS').textContent = '00';
      if (cd) cd.textContent = '下一场：' + nextRace.name + ' · 今日鸣枪';
      return;
    }
    const s = Math.floor(t / 1000);
    $('#cdD').textContent = String(Math.floor(s / 86400)).padStart(2, '0');
    $('#cdH').textContent = String(Math.floor(s % 86400 / 3600)).padStart(2, '0');
    $('#cdM').textContent = String(Math.floor(s % 3600 / 60)).padStart(2, '0');
    $('#cdS').textContent = String(s % 60).padStart(2, '0');
    if (cd) cd.textContent = '下一场：' + nextRace.name + ' ≈ ' + Math.floor(s / 86400) + ' 天';
  }

  /* ---------- 11. 弹窗 ---------- */
  const modal = $('#modal'), modalCard = $('#modalCard');
  let lastFocused = null;

  /* 弹窗顶部赛道图（官方图才显示，否则占位） */
  function courseTop(r) {
    const img = window.COURSE_IMAGES && window.COURSE_IMAGES[r.name];
    if (img) {
      return '<div class="course-top has-img">'
           + '<img src="' + img + '" alt="' + esc(r.name) + ' 官方赛道图" loading="lazy">'
           + '<span class="course-top-badge">官方赛道图</span></div>';
    }
    return '<div class="course-top empty">'
         + icoPin
         + '<p>官方赛道图<br>暂未收录</p></div>';
  }

  /* 历届最好成绩（赛会纪录）区块 */
  function recordSection(r) {
    const rec = window.COURSE_RECORDS && window.COURSE_RECORDS[r.name];
    let body;
    if (rec) {
      const card = function (title, o, cls) {
        if (!o) return '<div class="res-card ' + cls + ' empty"><div class="rk-t">' + title + '</div><div class="rk-n">—</div><div class="rk-m">该组别未设</div></div>';
        return '<div class="res-card ' + cls + '"><div class="rk-t">' + title + '</div>'
             + '<div class="rk-n">' + esc(o.n) + '</div>'
             + '<div class="rk-m">' + esc(o.c) + ' · <b>' + esc(o.t) + '</b></div>'
             + '<div class="rk-y">' + o.y + ' 年创造</div></div>';
      };
      body = '<div class="res-grid">'
        + card('男子赛会纪录', rec.m, 'm')
        + card('女子赛会纪录', rec.w, 'w')
        + '</div>'
        + '<div class="res-src">历届以来该赛事赛道最快成绩（course record）。来源：百度百科赛会纪录进程表 / 赛事官网 / 权威媒体报道。</div>';
    } else {
      body = '<div class="res-empty">该赛事暂无公开赛会纪录。部分新兴或赛道多次变更的赛事未留存权威历史最好成绩。</div>';
    }
    return '<div class="m-sec record-sec"><h4>COURSE RECORD · 历届最好成绩</h4>' + body + '</div>';
  }

  /* 冠军成绩区块 */
  function winnersSection(r) {
    const res = window.RACE_RESULTS && window.RACE_RESULTS[r.name];
    let body;
    if (res) {
      const card = function (title, obj, cls) {
        if (!obj || !obj.time) return '';
        const name = obj.name ? esc(obj.name) : '<span class="rk-anon">外籍选手</span>';
        const nat = obj.nat ? esc(obj.nat) + ' · ' : '';
        const note = obj.note ? '<i class="rk-note">' + esc(obj.note) + '</i>' : '';
        return '<div class="res-card ' + cls + '"><div class="rk-t">' + title + '</div>'
             + '<div class="rk-n">' + name + '</div>'
             + '<div class="rk-m">' + nat + '<b>' + esc(obj.time) + '</b></div>' + note + '</div>';
      };
      body = '<div class="res-grid">'
        + card('男子冠军', res.men, 'm')
        + card('女子冠军', res.women, 'w')
        + card('中国籍男子', res.cnMen, 'cm')
        + card('中国籍女子', res.cnWomen, 'cw')
        + '</div>'
        + (res.record ? '<div class="res-record">🏆 本场打破赛会纪录</div>' : '')
        + '<div class="res-src">数据来源：' + esc(res.src || '公开报道整理') + '</div>';
    } else if (r.past) {
      body = '<div class="res-empty">该站冠军成绩待收录。公开成绩主要集中于世界田联标牌及头部赛事，其余赛事以组委会官方公告为准。</div>';
    } else {
      body = '<div class="res-empty">赛事尚未举办，冠军成绩将于赛后更新。</div>';
    }
    return '<div class="m-sec winners-sec"><h4>WINNERS · 冠军成绩</h4>' + body + '</div>';
  }
  function openModal(r) {
    lastFocused = document.activeElement;
    const scaleTxt = r.scale ? (r.scale >= 10000 ? (r.scale / 10000).toFixed(1) + ' 万人（' + r.scale.toLocaleString() + ' 人）' : r.scale.toLocaleString() + ' 人') : '暂未公布';
    modalCard.innerHTML = `
      <div class="modal-top">
        <button class="modal-close" id="mcClose" aria-label="关闭弹窗">✕</button>
        <div class="modal-info">
          <div class="modal-date">${r.date} ${r.confirmed || r.year === 2026 ? '' : '· 预估档期'}</div>
          <h3 id="mcTitle">${esc(r.name)}</h3>
          <div class="modal-loc">${icoPin}<span>${esc(r.province)} · ${esc(r.city)} · ${r.region}地区</span></div>
          <div class="modal-badges">
            ${waBadge(r)}
            ${r.caa ? `<span class="badge caa">中国田协 ${r.caa} 类认证</span>` : ''}
            ${distBadges(r)}
            ${statusBadge(r)}
            ${(!r.confirmed && r.year === 2027) ? '<span class="badge" style="background:rgba(255,196,46,.9);color:#241a00">档期待官宣</span>' : ''}
          </div>
        </div>
        ${courseTop(r)}
      </div>
      <div class="modal-body">
        <div class="m-sec">
          <h4>RACE PROFILE · 赛事亮点</h4>
          <p>${esc(r.note || '该站赛事以城市景观与大众参与为特色，具体赛道信息请以组委会公布为准。')}</p>
        </div>
        <div class="m-sec">
          <h4>KEY DATA · 关键信息</h4>
          <div class="m-kv">
            <div><dt>比赛日期</dt><dd>${r.date}${r.confirmed || r.year === 2026 ? '' : ' <span style="font-size:11px;color:var(--muted)">（预估）</span>'}</dd></div>
            <div><dt>预计规模</dt><dd>${scaleTxt}</dd></div>
            <div><dt>比赛项目</dt><dd>${r.distList.join(' / ') || '—'}</dd></div>
            <div><dt>所属赛季</dt><dd>${r.year} 赛季</dd></div>
            <div><dt>赛事等级</dt><dd>${r.wa ? '世界田联' + r.wa : '无世界田联标牌'}${r.caa ? ' / 田协' + r.caa + '类' : ''}</dd></div>
            ${r.diff ? `<div><dt>累计爬升</dt><dd>${r.diff.gain != null ? r.diff.gain + ' 米' : '官方未公布'}</dd></div>
            <div><dt>关门时间</dt><dd>${esc(r.diff.limit)}</dd></div>
            <div><dt>赛道海拔</dt><dd>${esc(r.diff.alt)}</dd></div>
            <div><dt>难度评级</dt><dd><span class="diff-level ${r.diff.level}">${r.diff.level === '高' ? '🔺 高难度' : r.diff.level === '中' ? '◆ 中等' : '▼ 低难度（PB 友好）'}</span></dd></div>
            ${r.diff.temp ? `<div><dt>比赛日均温</dt><dd>${esc(r.diff.temp)}</dd></div>` : ''}
            ${r.pbScore != null ? `<div><dt>PB 指数</dt><dd><span class="pb-score ${r.pbGrade.g}">${r.pbScore}</span><span class="pb-txt">${r.pbGrade.g} 档 · ${r.pbGrade.t}</span></dd></div>` : ''}` : ''}
            <div><dt>报名状态</dt><dd>${STATUS_TEXT[r.status]}</dd></div>
            ${r.reg ? `<div><dt>报名开始</dt><dd>${esc(r.reg.open)}</dd></div><div><dt>报名截止</dt><dd>${esc(r.reg.close)}</dd></div>${r.reg.mode ? `<div><dt>名额规则</dt><dd>${REG_MODE[r.reg.mode] || esc(r.reg.mode)}</dd></div>` : ''}` : ''}
          </div>
          ${r.reg ? `<p class="reg-src">报名信息来源：${esc(r.reg.src)}（核实于 ${window.RACE_REG_AS_OF || DATA_SNAPSHOT}）</p>` : ''}
          ${r.diff ? `<p class="reg-src">赛道数据来源：${esc(r.diff.src)}（核实于 ${DATA_SNAPSHOT}）</p>
          <p class="reg-src">海拔剖面图需官方逐公里海拔数据——官方未公布的赛事不作推测绘制。</p>` : ''}
        </div>
        ${actionZone(r)}
        ${r.tags.length ? `<div class="m-sec"><h4>TAGS · 赛道标签</h4><div class="m-tags">${r.tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div></div>` : ''}
        ${recordSection(r)}
        ${winnersSection(r)}
        ${reviewsSection(r)}
        <div class="m-warn">
          本站为信息聚合工具，所有日期、规模、项目与报名状态均来源于公开渠道整理，可能存在滞后或调整。
          请务必通过赛事组委会官网、官方公众号或其指定的官方报名平台核实后再做报名与出行决策。
        </div>
      </div>`;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    $('#mcClose').onclick = closeModal;
    $('#mcClose').focus();
    const shareBtn = $('#mcShare');
    if (shareBtn) {
      const shareUrl = location.origin + location.pathname + '#race=' + encodeURIComponent(r.name);
      shareBtn.onclick = () => copyText(shareUrl, shareBtn);
    }
    const remindBtn = $('#mcRemind');
    if (remindBtn) remindBtn.onclick = () => exportRaceICS(r);
    // 深链：当前弹窗赛事写入 URL，可直接分享给他人
    history.replaceState(null, '', '#race=' + encodeURIComponent(r.name));
  }
  /* 弹窗统一「动作区」：报名入口 / 复制链接 / 提醒我报名（报告 6.4） */
  function actionZone(r) {
    const regOpen = r.reg && !r.past && (function () {
      const c = parseDT(r.reg.close);
      return c && c > new Date();
    })();
    const remind = regOpen ? `<button class="btn btn-remind" id="mcRemind" type="button">🔔 提醒我报名</button>` : '';
    const entry = r.url
      ? `<a class="btn btn-entry" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="前往${esc(r.name)}官方报名入口">官方报名入口 ↗</a>`
      : `<span class="btn btn-disabled">官方报名入口待组委会公布</span>`;
    // 官方合作报名平台（仅列稳定官网/APP，具体赛事报名以组委会公告为准，不编造深层链接）
    const platforms = `<div class="m-platforms">
      <span class="m-note">官方合作报名平台（在对应平台搜索本赛事名即可报名，以组委会公告为准）：</span>
      <div class="m-actions">
        <a class="btn btn-platform" href="https://www.zuicool.com/" target="_blank" rel="noopener" aria-label="最酷马拉松报名官网">最酷 ↗</a>
        <span class="btn btn-platform-txt">马拉马拉 APP</span>
        <span class="btn btn-platform-txt">数字心动 APP</span>
      </div>
    </div>`;
    return `<div class="m-sec action-zone">
      <h4>ACTION · 报名与提醒</h4>
      <div class="m-actions">
        ${entry}
        <button class="btn btn-share" id="mcShare" type="button" aria-label="复制赛事分享链接">🔗 复制赛事链接</button>
        ${remind}
      </div>
      ${platforms}
    </div>`;
  }
  function closeModal() {
    modal.classList.remove('show');
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch (e) {} }
    if (location.hash.indexOf('#race=') === 0) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  function copyText(txt, btn) {
    const done = () => {
      if (!btn) return;
      const old = btn.textContent;
      btn.textContent = '已复制 ✓';
      btn.classList.add('ok');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    } else {
      fallbackCopy(txt, done);
    }
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { window.prompt('长按复制赛事链接：', txt); }
    document.body.removeChild(ta);
  }
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  // 通用焦点陷阱（P1-8）：详情弹窗与对比弹窗共用
  function trapFocus(container, e) {
    const f = container.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
    if (e.key === 'Tab' && modal.classList.contains('show')) trapFocus(modal, e);
  });

  /* ---------- 11.5 赛事对比 ---------- */
  function recOf(r, g) { const rec = window.COURSE_RECORDS && window.COURSE_RECORDS[r.name]; return rec && rec[g] ? rec[g].t : '—'; }
  function cnOf(r, g) { const cn = window.CN_BEST && window.CN_BEST[r.name]; return cn && cn[g] ? cn[g].t : '—'; }
  function syncToggle(id) {
    const on = compareSet.has(id);
    $$(`.cmp-toggle[data-id="${CSS.escape(id)}"]`).forEach(b => {
      b.classList.toggle('on', on);
      b.textContent = on ? (b.classList.contains('sm') ? '✓' : '✓ 已选') : (b.classList.contains('sm') ? '＋' : '＋ 对比');
    });
  }
  function toggleCompare(id) {
    if (compareSet.has(id)) compareSet.delete(id);
    else {
      if (compareSet.size >= MAX_CMP) { flashTray(); return; }
      compareSet.add(id);
    }
    renderCompareTray();
    syncToggle(id);
  }
  function renderCompareTray() {
    const tray = $('#cmpTray');
    if (!tray) return;
    const races = [...compareSet].map(id => ALL.find(r => r.id === id)).filter(Boolean);
    $('#cmpCount').textContent = races.length;
    const list = $('#cmpList');
    list.innerHTML = '';
    races.forEach(r => {
      list.appendChild(el('div', 'cmp-chip', `<span>${esc(r.name)}</span><button type="button" data-id="${r.id}" aria-label="移除">✕</button>`));
    });
    $('#cmpGo').disabled = races.length < 2;
    tray.classList.toggle('show', races.length > 0);
  }
  function flashTray() {
    const tray = $('#cmpTray');
    if (!tray) return;
    tray.classList.add('warn'); setTimeout(() => tray.classList.remove('warn'), 600);
  }
  $('#cmpClear').addEventListener('click', () => {
    compareSet.clear(); renderCompareTray();
    $$('.cmp-toggle.on').forEach(b => { b.classList.remove('on'); b.textContent = b.classList.contains('sm') ? '＋' : '＋ 对比'; });
  });
  $('#cmpList').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) toggleCompare(b.dataset.id); });
  $('#cmpGo').addEventListener('click', openCompare);
  document.addEventListener('click', e => {
    const b = e.target.closest('.cmp-toggle');
    if (b) { e.stopPropagation(); toggleCompare(b.dataset.id); return; }
    const cb = e.target.closest('.col-toggle');
    if (cb) { e.stopPropagation(); toggleCol(cb.dataset.id); }
  });

  const cmpModal = $('#cmpModal'), cmpCard = $('#cmpCard');
  let cmpLastFocused = null;
  function openCompare() {
    const races = [...compareSet].map(id => ALL.find(r => r.id === id)).filter(Boolean);
    if (races.length < 2) return;
    const FIELDS = [
      ['比赛日期', r => r.date],
      ['地区', r => r.province + ' · ' + r.city],
      ['区域', r => r.region],
      ['世界田联标牌', r => r.wa || '—'],
      ['田协等级', r => (r.caa ? '田协 ' + r.caa + ' 类' : '—')],
      ['比赛项目', r => r.distList.join(' / ') || '—'],
      ['预计规模', r => r.scale ? (r.scale >= 10000 ? (r.scale / 10000).toFixed(1) + ' 万' : r.scale) + ' 人' : '—'],
      ['报名状态', r => STATUS_TEXT[r.status]],
      ['男子赛会纪录', r => recOf(r, 'm')],
      ['女子赛会纪录', r => recOf(r, 'w')],
      ['中国籍男最好', r => cnOf(r, 'm')],
      ['中国籍女最好', r => cnOf(r, 'w')],
      ['赛道标签', r => r.tags.join(' / ') || '—'],
      ['报名入口', r => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">官网 / 报名 ↗</a>` : '—']
    ];
    let html = '<button class="modal-close" id="cmpClose">✕</button>';
    html += '<h3 class="cmp-title" id="cmpTitle">赛事对比 · ' + races.length + ' 场</h3>';
    html += '<div class="cmp-scroll"><table class="cmp-table"><thead><tr><th>对比项</th>';
    races.forEach(r => { html += `<th>${esc(r.name)}<span class="cmp-th-sub">${esc(r.province)}·${esc(r.city)}</span></th>`; });
    html += '</tr></thead><tbody>';
    FIELDS.forEach(([k, fn]) => {
      html += '<tr><th>' + k + '</th>';
      races.forEach(r => { html += '<td>' + fn(r) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="cmp-foot">撞期赛事可在此横向对比，辅助报名决策。数据均来自公开渠道整理，报名请以官方渠道为准。</div>';
    cmpCard.innerHTML = html;
    cmpModal.classList.add('show');
    document.body.style.overflow = 'hidden';
    cmpLastFocused = document.activeElement;
    $('#cmpClose').onclick = closeCompare;
    const firstFocus = cmpCard.querySelector('a[href],button:not([disabled])');
    if (firstFocus) firstFocus.focus();
  }
  function closeCompare() {
    cmpModal.classList.remove('show');
    document.body.style.overflow = '';
    if (cmpLastFocused && cmpLastFocused.focus) { try { cmpLastFocused.focus(); } catch (e) {} }
  }
  cmpModal.addEventListener('click', e => { if (e.target === cmpModal) closeCompare(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cmpModal.classList.contains('show')) closeCompare();
    if (e.key === 'Tab' && cmpModal.classList.contains('show')) trapFocus(cmpCard, e);
  });

  /* ---------- 12. 滚动进度 + 赛事库筛选栏自动隐藏 ---------- */
  const bar = $('#progressBar');
  const filterPanel = $('.filters');
  const racesSection = $('#races');
  function onScroll() {
    const y = window.scrollY;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';

    if (filterPanel && racesSection) {
      const threshold = racesSection.offsetTop + 180;
      // 滚过赛事库上方阈值即隐藏；只有滚回顶部（阈值之上）才重新显示，
      // 列表内上滑不再弹出，避免遮挡卡片。
      if (y > threshold) {
        filterPanel.classList.add('scroll-hidden');
      } else {
        filterPanel.classList.remove('scroll-hidden');
      }
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 12.5 个人中心（localStorage 本地存储） ---------- */
  function toggleCol(id) {
    if (colSet.has(id)) colSet.delete(id); else colSet.add(id);
    saveJSON(LS_COL, [...colSet]);
    syncColButtons();
    renderProfile();
  }
  function syncColButtons() {
    $$('.col-toggle').forEach(b => b.classList.toggle('on', colSet.has(b.dataset.id)));
  }

  // 中国田协大众选手等级（34 岁以下标准，单位：秒）顺序：精英级/一级/二级/三级
  const CAA_GRADE = {
    full: { M: [10800, 12600, 14400, 16200], W: [12000, 13800, 15600, 17400] },
    half: { M: [5100, 6000, 6900, 7800], W: [5700, 6600, 7500, 8400] },
    ten:  { M: [2220, 2640, 3060, 3480], W: [2520, 2940, 3360, 3780] }
  };
  const GRADE_NAME = ['精英级', '一级', '二级', '三级', '未达标'];
  const PB_LABEL = { full: '全程', half: '半程', ten: '10K' };
  const DIST_ORDER = { full: 0, half: 1, ten: 2 };

  function matchGrade(dist, sex, sec) {
    const t = (CAA_GRADE[dist] && CAA_GRADE[dist][sex]) || [];
    for (let i = 0; i < t.length; i++) if (sec <= t[i]) return GRADE_NAME[i];
    return GRADE_NAME[4];
  }
  function parseTime(str) {
    str = (str || '').trim(); if (!str) return null;
    let h = 0, m, s;
    // 支持三种写法（与输入框 placeholder 的宣传保持一致）：
    //   3:15:30 → 时:分:秒 ；195:30 → 总分钟:秒 ；195 → 纯总分钟
    if (str.indexOf(':') >= 0) {
      const seg = str.split(':');
      // 空段（如 ":" 或 "1::2"）按非法处理，避免 Number('') === 0 被误当成有效成绩
      if (seg.some(x => !x.trim().length)) return null;
      const p = seg.map(Number);
      if (p.some(isNaN) || p.some(x => x < 0)) return null;
      if (p.length === 3) {
        h = p[0]; m = p[1]; s = p[2];
        if (m > 59 || s > 59) return null;
      } else if (p.length === 2) {
        // 两段式按「总分钟:秒」解释（旧实现把 195 判为非法分钟，导致宣传格式全部失效）
        m = p[0]; s = p[1];
        if (s > 59) return null;
      } else return null;
    } else {
      const n = Number(str); if (isNaN(n) || n < 0) return null;
      m = Math.floor(n); s = Math.round((n - m) * 60);
      if (s > 59) { m += 1; s = 0; }
    }
    return h * 3600 + m * 60 + s;
  }
  function fmtTime(sec) {
    if (sec == null) return '—';
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return (h > 0 ? h + ':' : '') + String(m).padStart(h > 0 ? 2 : 1, '0') + ':' + String(s).padStart(2, '0');
  }

  function renderPB() {
    const box = $('#pbList');
    if (!pbList.length) {
      box.innerHTML = '<p class="pf-empty">还没有记录。录入你的最好成绩，系统会自动匹配中国田协大众选手等级。</p>';
      return;
    }
    box.innerHTML = pbList.map((p, i) => {
      const g = matchGrade(p.dist, p.sex, p.sec);
      const gcls = g === '精英级' ? 'g-elite' : g === '未达标' ? 'g-none' : 'g-ok';
      return '<div class="pf-pb">'
        + '<div class="pf-pb-main"><b>' + PB_LABEL[p.dist] + '</b><span class="pf-pb-time">' + fmtTime(p.sec) + '</span></div>'
        + '<div class="pf-pb-meta">' + (p.sex === 'M' ? '男' : '女')
        + (p.race ? ' · ' + esc(p.race) : '') + (p.date ? ' · ' + esc(p.date) : '') + '</div>'
        + '<div class="pf-grade ' + gcls + '">' + g + '</div>'
        + '<button class="pf-del" data-i="' + i + '" title="删除">✕</button>'
        + '</div>';
    }).join('');
    box.querySelectorAll('.pf-del').forEach(b => b.addEventListener('click', () => {
      pbList.splice(Number(b.dataset.i), 1); saveJSON(LS_PB, pbList); renderPB();
    }));
  }

  let pfTab = 'all';
  // 首屏个人提醒条：收藏赛事中最近的一个「报名即将截止」（7 天内）
  function renderDDayAlert() {
    const host = $('#ddayAlert');
    if (!host) return;
    const now = Date.now();
    const items = ALL.filter(r => colSet.has(r.id) && r.reg && !r.past)
      .map(r => ({ r, closeAt: parseDT(r.reg.close) }))
      .filter(x => x.closeAt && x.closeAt.getTime() > now && (x.closeAt.getTime() - now) <= 7 * 86400000)
      .sort((a, b) => a.closeAt - b.closeAt);
    if (!items.length) { host.hidden = true; host.innerHTML = ''; return; }
    const x = items[0];
    const dd = Math.ceil((x.closeAt.getTime() - now) / 86400000);
    host.hidden = false;
    host.innerHTML = '<span class="dday-txt">⏰ 你关注的 <b>' + esc(x.r.name) + '</b> '
      + (dd <= 0 ? '<b>今天</b>' : '<b>' + dd + '</b> 天后') + '截止报名</span>'
      + (items.length > 1 ? '<span class="dday-more">另有 ' + (items.length - 1) + ' 场即将截止</span>' : '')
      + '<button type="button" class="dday-go" aria-label="查看' + esc(x.r.name) + '详情">查看</button>';
    host.querySelector('.dday-go').addEventListener('click', () => openModal(x.r));
  }
  function renderProfile() {
    renderDDayAlert();
    const races = ALL.filter(r => colSet.has(r.id)).sort((a, b) => a.date.localeCompare(b.date));
    $('#pfColCount').textContent = races.length;
    const byDate = {};
    races.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r.name); });
    const clashDates = new Set(Object.keys(byDate).filter(d => byDate[d].length > 1));
    let view = races;
    if (pfTab === 'open') view = races.filter(r => r.status === 'open' || r.status === 'soon');
    if (pfTab === 'clash') view = races.filter(r => clashDates.has(r.date));
    const box = $('#pfCal');
    if (!view.length) {
      box.innerHTML = '<p class="pf-empty">' + (pfTab === 'all'
        ? '在「赛事库」卡片上点 ★ 收藏，把意向赛事加入你的赛程。'
        : '当前筛选下暂无赛事。') + '</p>';
      return;
    }
    const now = Date.now();
    box.innerHTML = view.map(r => {
      const d = new Date(r.date + 'T08:00:00');
      const days = Math.ceil((d - now) / 86400000);
      const cd = days > 0 ? '还有 <b>' + days + '</b> 天' : (days === 0 ? '今天开赛' : '已结束');
      const clash = clashDates.has(r.date);
      const isOpen = r.status === 'open', isSoon = r.status === 'soon';
      let extra = '';
      if (clash) extra += '<div class="pf-warn">⚠ 撞期：' + byDate[r.date].filter(n => n !== r.name).map(esc).join('、') + '</div>';
      if (isOpen) extra += '<div class="pf-open">● 正在报名中</div>';
      else if (isSoon) extra += '<div class="pf-soon">○ 即将开启报名</div>';
      // 报名截止 D-Day：7 天内琥珀预警、3 天内红色加急
      if (r.reg && !r.past) {
        const c = parseDT(r.reg.close);
        if (c && c.getTime() > now) {
          const dd = Math.ceil((c.getTime() - now) / 86400000);
          if (dd <= 7) extra += '<div class="pf-dday' + (dd <= 3 ? ' urgent' : '') + '">⏰ 报名 ' + (dd <= 0 ? '今天' : '<b>' + dd + '</b> 天后') + '截止（' + esc(r.reg.close) + '）</div>';
        }
      }
      return '<div class="pf-item' + (clash ? ' clash' : '') + (isOpen ? ' open' : '') + '">'
        + '<div class="pf-item-top"><b>' + esc(r.name) + '</b>' + statusBadge(r) + '</div>'
        + '<div class="pf-item-meta">' + esc(r.city) + ' · ' + r.date + ' · ' + cd + '</div>'
        + extra + '</div>';
    }).join('');
  }

  const pbForm = $('#pbForm');
  if (pbForm) pbForm.addEventListener('submit', e => {
    e.preventDefault();
    const dist = $('#pbDist').value, sex = $('#pbSex').value;
    const sec = parseTime($('#pbTime').value);
    if (sec == null) { alert('请输入正确的成绩，例如 3:15:30 或 195:30'); return; }
    pbList.push({ dist, sex, sec, race: $('#pbRace').value.trim(), date: $('#pbDate').value });
    pbList.sort((a, b) => (a.dist === b.dist ? a.sec - b.sec : DIST_ORDER[a.dist] - DIST_ORDER[b.dist]));
    saveJSON(LS_PB, pbList);
    pbForm.reset();
    renderPB();
  });

  $$('#profile .pf-tabs button').forEach(b => b.addEventListener('click', () => {
    $$('#profile .pf-tabs button').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); pfTab = b.dataset.v; renderProfile();
  }));

  renderPB();
  renderProfile();

  /* ---------- 14.6 .ics 日历订阅导出（报告 12.2-2，P1） ---------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function icsDT(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate())
      + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function escapeICS(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }
  function buildICS(races) {
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RunCal//Marathon Calendar//CN',
      'CALSCALE:GREGORIAN', 'X-WR-CALNAME:跑历 · 马拉松赛程'
    ];
    const now = new Date();
    races.forEach(r => {
      const day = new Date(r.date + 'T07:30:00');
      const end = new Date(day.getTime() + 3 * 3600000);
      const note = (r.reg ? '报名窗口：' + r.reg.open + ' 至 ' + r.reg.close + '（来源：' + r.reg.src + '）\n' : '')
        + (r.year === 2027 && !r.confirmed ? '⚠ 本场为参考 2026 同期档期推定，非官方定档。\n' : '')
        + '报名请以赛事组委会官方渠道为准。';
      lines.push('BEGIN:VEVENT', 'UID:' + r.id + '@runcal.local', 'DTSTAMP:' + icsDT(now),
        'DTSTART:' + icsDT(day), 'DTEND:' + icsDT(end),
        'SUMMARY:' + escapeICS('🏃 ' + r.name),
        'LOCATION:' + escapeICS(r.province + ' ' + r.city),
        'DESCRIPTION:' + escapeICS(note));
      lines.push('END:VEVENT');
      // 报名截止提醒（P1-2）：VALARM 的 TRIGGER 是相对「所属事件 DTSTART」的，
      // 旧实现把 VALARM 挂在比赛日事件上，导致手机日历在开赛前一天才弹
      //「报名截止提醒」（此时报名早已截止）。必须为报名截止单独建一个事件。
      if (r.reg) {
        const closeAt = parseDT(r.reg.close);
        if (closeAt && closeAt > now) {
          const closeEnd = new Date(closeAt.getTime() + 30 * 60000);
          lines.push('BEGIN:VEVENT', 'UID:' + r.id + '-reg@runcal.local', 'DTSTAMP:' + icsDT(now),
            'DTSTART:' + icsDT(closeAt), 'DTEND:' + icsDT(closeEnd),
            'SUMMARY:' + escapeICS('📝 报名截止 · ' + r.name),
            'DESCRIPTION:' + escapeICS('报名截止：' + r.reg.close + '\n来源：' + r.reg.src + '\n报名请以赛事组委会官方渠道为准。'),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:报名即将截止', 'TRIGGER:-P1D', 'END:VALARM',
            'END:VEVENT');
        }
      }
    });
    lines.push('END:VCALENDAR');
    return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  }
  function exportICS() {
    const races = ALL.filter(r => colSet.has(r.id)).sort((a, b) => a.date.localeCompare(b.date));
    if (!races.length) { alert('还没有收藏赛事，先在「赛事库」点 ★ 收藏后再导出日历订阅。'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buildICS(races));
    a.download = '跑历-我的马拉松赛程.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  // 单场「提醒我报名」：导出含报名截止 VALARM 的 .ics（报告 6.4 弹窗动作区）
  function exportRaceICS(r) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(buildICS([r]));
    a.download = '跑历-报名提醒-' + r.name + '.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const pfExport = $('#pfExport');
  if (pfExport) pfExport.addEventListener('click', exportICS);

  /* ---------- 14.7 配速换算器（报告 12.2-6，P2） ---------- */
  const paceForm = $('#paceForm');
  if (paceForm) paceForm.addEventListener('submit', e => {
    e.preventDefault();
    const distM = Number($('#paceDist').value);
    const sec = parseTime($('#paceTime').value);
    const out = $('#paceResult');
    if (sec == null) { out.innerHTML = '<p class="pf-empty">请输入正确的目标成绩，例如 3:30:00 或 210:00</p>'; return; }
    const distLabel = distM === 42195 ? '全程马拉松' : distM === 21097.5 ? '半程马拉松' : '10 公里';
    const perKm = sec / (distM / 1000);
    const totalKm = distM / 1000;
    const rows = [];
    for (let km = 5; km < totalKm; km += 5) {
      rows.push('<tr><td>' + km + ' km</td><td>' + fmtTime(Math.round(perKm * km)) + '</td></tr>');
    }
    rows.push('<tr><td>' + (Number.isInteger(totalKm) ? totalKm : totalKm.toFixed(2)) + ' km（终点）</td><td>' + fmtTime(sec) + '</td></tr>');
    out.innerHTML = '<div class="pace-hero">目标 <b>' + fmtTime(sec) + '</b> · ' + distLabel
      + '<span>平均配速 <b>' + fmtTime(perKm) + ' /km</b></span></div>'
      + '<table class="pace-table"><thead><tr><th>分段</th><th>累计用时</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  });

  /* ---------- 14.5 报名日历（regtime.js 已核实的报名窗口） ---------- */
  function renderRegCalendar() {
    const host = $('#regTrack');
    if (!host) return;
    host.innerHTML = '';
    const now = new Date();
    const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items = [];
    ALL.forEach(r => {
      if (r.reg) {
        // 已核实报名窗口：按当前时间区分「即将开抢」与「报名中（按截止日倒计时）」
        const openAt = parseDT(r.reg.open), closeAt = parseDT(r.reg.close);
        if (openAt && openAt > now) items.push({ r, at: openAt, type: 'soon' });
        else if (closeAt && closeAt > now) items.push({ r, at: closeAt, type: 'open' });
        // 已截止（closeAt <= now）不显示
      } else if (r.status === 'open') {
        // 状态为报名中、但无官方核实报名窗口：纳入并标注「待核实」，绝不臆造截止日
        items.push({ r, at: null, type: 'unverified' });
      }
    });
    // 带日期的按时间升序，无日期（待核实）排最后
    items.sort((a, b) => {
      const da = a.at ? a.at.getTime() : Infinity;
      const db = b.at ? b.at.getTime() : Infinity;
      return da - db;
    });
    if (!items.length) {
      host.innerHTML = '<div class="empty" style="flex:1">近期暂无已核实的报名窗口，将随官方公告持续补录。</div>';
      return;
    }
    items.slice(0, 8).forEach(it => {
      let card;
      if (it.at) {
        const openAt = it.r.reg ? parseDT(it.r.reg.open) : null;
        const isSoon = openAt && openAt > now;
        // 按自然日计算剩余天数（同日=今天），避免 ceil 把当天误判为 1 天
        const days = Math.round((new Date(it.at.getFullYear(), it.at.getMonth(), it.at.getDate()) - dNow) / 86400000);
        card = el('div', 'reg-card');
        card.innerHTML = `
          <div class="rc-when"><b>${fmtMD(it.at)}</b><span>${fmtHM(it.at)}</span><em>${isSoon ? '开抢' : '报名中'}</em></div>
          <div class="rc-name">${esc(it.r.name)}</div>
          <div class="rc-meta">${it.r.reg.mode ? `<i class="rc-mode">${REG_MODE[it.r.reg.mode] || ''}</i>` : ''}${it.r.date} 鸣枪 · ${esc(it.r.province)}·${esc(it.r.city)}</div>
          <div class="rc-left">${isSoon ? ('还有 ' + days + ' 天开抢') : (days <= 0 ? '今天截止' : ('剩 ' + days + ' 天'))}</div>`;
      } else {
        card = el('div', 'reg-card rc-unverified');
        card.innerHTML = `
          <div class="rc-when"><b>待核实</b><span>—</span><em>报名中</em></div>
          <div class="rc-name">${esc(it.r.name)}</div>
          <div class="rc-meta">${it.r.date} 鸣枪 · ${esc(it.r.province)}·${esc(it.r.city)}</div>
          <div class="rc-left">截止日待官方公布</div>`;
      }
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', it.r.name + ' · 查看赛事详情');
      card.addEventListener('click', () => openModal(it.r));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(it.r); } });
      host.appendChild(card);
    });
  }

  /* ---------- 12c. 内容轻栏目：近期值得跑（报告 P2-8，数据驱动不编造） ---------- */
  function renderWorth() {
    const host = $('#worthGrid');
    if (!host) return;
    const cand = ALL.filter(r => !r.past && r.diff && r.date >= '2026-09-01');
    const score = r => {
      const lv = r.diff.level === '低' ? 0 : r.diff.level === '中' ? 1 : 2;
      const open = r.status === 'open' ? 0 : 1;
      const far = r.date > '2026-12-31' ? 1 : 0;
      return lv * 10 + open * 6 + far * 3 - (r.pbScore || 0) * 0.05;
    };
    cand.sort((a, b) => score(a) - score(b));
    const top = cand.slice(0, 3);
    host.innerHTML = '';
    if (!top.length) { host.innerHTML = '<div class="empty">近期暂无适合推荐的赛事，将持续更新。</div>'; return; }
    top.forEach((r, i) => {
      const lv = r.diff.level;
      const lvCls = lv === '低' ? 'low' : lv === '中' ? 'mid' : 'high';
      const card = el('div', 'worth-card');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', r.name + ' · ' + r.province + '·' + r.city + ' · 查看赛事详情');
      card.innerHTML = `
        <div class="worth-rank">TOP ${i + 1} · 值得跑</div>
        <div class="worth-name">${esc(r.name)}</div>
        <div class="worth-meta">${r.date} · ${esc(r.province)}·${esc(r.city)}</div>
        <div class="worth-tags">
          <span class="worth-tag ${lvCls}">${lv === '低' ? '▼ 低难度' : lv === '中' ? '◆ 中等' : '🔺 高难度'}</span>
          ${r.pbScore != null ? `<span class="worth-tag pb">PB ${r.pbScore}</span>` : ''}
          <span class="worth-tag">${STATUS_TEXT[r.status]}</span>
        </div>`;
      card.addEventListener('click', () => openModal(r));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(r); } });
      host.appendChild(card);
    });
  }

  /* ---------- 12d. 跑者口碑评分框架（报告 12-3，诚实占位绝不编造） ---------- */
  function reviewsSection(r) {
    const dims = [['组织运营', '—'], ['赛道体验', '—'], ['补给服务', '—'], ['现场氛围', '—']];
    return `<div class="m-sec reviews-sec">
      <h4>RACE REVIEWS · 跑者口碑</h4>
      <div class="rv-dims">${dims.map(([l, v]) => `<div class="rv-dim"><div class="rv-lab">${l}</div><div class="rv-val">${v}</div></div>`).join('')}</div>
      <p class="rv-note">跑者口碑评分即将开放。赛后欢迎回站为「${esc(r.name)}」的 组织运营 / 赛道体验 / 补给服务 / 现场氛围 四维打分，帮助后来者决策。</p>
    </div>`;
  }

  /* ---------- 12c. 城市赛道榜（P2-6 替代可视化：省份热力矩阵 + 城市榜，零合规风险，不画地图轮廓） ---------- */
  /* 城市筛选统一入口：城市赛道榜 / 全国城市成绩榜 共用。
     写入 F.province/F.city → 重渲赛事库 → 同步清除按钮与两处榜单高亮 → 滚动到赛事库 */
  function applyCityFilter(prov, city) {
    F.province.clear(); F.city.clear();
    if (city) F.city.add(prov + '/' + city); else F.province.add(prov);
    renderRaces();
    const cb = $('#cityClear');
    if (cb) {
      const on = F.province.size || F.city.size;
      cb.hidden = !on;
      if (on) {
        const labs = F.province.size ? [...F.province] : [...F.city].map(k => k.split('/')[1]);
        cb.textContent = '清除筛选（' + labs.join('、') + '）';
      }
    }
    if (typeof window.__cityBoardRefresh === 'function') window.__cityBoardRefresh();
    const rs = document.getElementById('races');
    if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderCityBoard() {
    const hostM = $('#provMatrix'), hostR = $('#cityRank');
    if (!hostM || !hostR) return;
    let cityRankExpanded = false;

    // 聚合：省份 / 城市（省+市 唯一键，避免重名城市跨省误并）
    const provMap = {}, cityMap = {};
    ALL.forEach(r => {
      const p = r.province || '未知', c = r.city || '未知', ck = p + '/' + c;
      if (!provMap[p]) provMap[p] = { name: p, count: 0, pbSum: 0, pbN: 0, gainSum: 0, gainN: 0 };
      const pp = provMap[p]; pp.count++;
      if (r.pbScore != null) { pp.pbSum += r.pbScore; pp.pbN++; }
      if (r.diff && r.diff.gain != null) { pp.gainSum += r.diff.gain; pp.gainN++; }
      if (!cityMap[ck]) cityMap[ck] = { name: c, prov: p, key: ck, count: 0, pbSum: 0, pbN: 0, gainSum: 0, gainN: 0 };
      const cc = cityMap[ck]; cc.count++;
      if (r.pbScore != null) { cc.pbSum += r.pbScore; cc.pbN++; }
      if (r.diff && r.diff.gain != null) { cc.gainSum += r.diff.gain; cc.gainN++; }
    });
    const provs = Object.values(provMap).map(p => ({
      name: p.name, count: p.count,
      pbAvg: p.pbN ? p.pbSum / p.pbN : null,
      gainAvg: p.gainN ? p.gainSum / p.gainN : null
    }));
    const cities = Object.values(cityMap).map(c => ({
      name: c.name, prov: c.prov, key: c.key, count: c.count,
      pbAvg: c.pbN ? c.pbSum / c.pbN : null,
      gainAvg: c.gainN ? c.gainSum / c.gainN : null
    }));

    const METRICS = {
      count: { label: '赛事数', get: x => x.count, fmt: v => v + ' 场', hint: '场次越多色越深' },
      pb:    { label: 'PB友好指数', get: x => x.pbAvg, fmt: v => v == null ? '—' : v.toFixed(1), hint: '指数越高（越易出成绩）色越深；无难度数据赛事不计' },
      gain:  { label: '平均爬升', get: x => x.gainAvg, fmt: v => v == null ? '—' : Math.round(v) + ' m', hint: '爬升越高（赛道越难）色越深；无难度数据赛事不计' }
    };
    let metric = 'count';

    // 暖色强度映射 [0,1]：浅暖 → 橙，强制深字确保浅/深色主题下均可读
    function heat(norm) {
      const lo = [255, 246, 235], hi = [226, 88, 34];
      const r = Math.round(lo[0] + (hi[0] - lo[0]) * norm);
      const g = Math.round(lo[1] + (hi[1] - lo[1]) * norm);
      const b = Math.round(lo[2] + (hi[2] - lo[2]) * norm);
      return `rgb(${r},${g},${b})`;
    }

    function syncFilterUI() {
      const cb = $('#cityClear');
      if (!cb) return;
      const on = F.province.size || F.city.size;
      cb.hidden = !on;
      if (on) {
        const labs = F.province.size ? [...F.province]
          : [...F.city].map(k => k.split('/')[1]);
        cb.textContent = '清除筛选（' + labs.join('、') + '）';
      }
    }

    function drawMatrix() {
      const m = METRICS[metric];
      const vals = provs.map(m.get).filter(v => v != null);
      const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
      const span = (max - min) || 1;
      hostM.innerHTML = '';
      provs.slice().sort((a, b) => (m.get(b) ?? -1) - (m.get(a) ?? -1)).forEach(p => {
        const v = m.get(p);
        const norm = v == null ? 0 : (v - min) / span;
        const active = F.province.has(p.name);
        const cell = el('div', 'prov-cell' + (active ? ' on' : ''));
        cell.tabIndex = 0; cell.setAttribute('role', 'button');
        cell.style.background = v == null ? 'transparent' : heat(norm);
        cell.innerHTML = `<span class="pn">${esc(p.name)}</span><span class="pv">${m.fmt(v)}</span>`;
        cell.setAttribute('aria-pressed', active ? 'true' : 'false');
        cell.setAttribute('aria-label', `${p.name}：${m.label} ${m.fmt(v)}，点击筛选该省赛事`);
        const act = () => {
          if (F.province.has(p.name)) F.province.delete(p.name);
          else { F.province.clear(); F.city.clear(); F.province.add(p.name); }
          renderRaces(); syncFilterUI(); drawMatrix(); drawRank();
          const rs = document.getElementById('races'); if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        cell.addEventListener('click', act);
        cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
        hostM.appendChild(cell);
      });
      const hint = $('#provHint');
      if (hint) hint.textContent = '指标：' + m.label + ' · ' + m.hint;
    }

    function drawRank() {
      const m = METRICS[metric];
      const arr = cities.slice().sort((a, b) => {
        const va = m.get(a), vb = m.get(b);
        if (va == null && vb == null) return b.count - a.count;
        if (va == null) return 1; if (vb == null) return -1;
        return vb - va;
      });
      const vals = arr.map(m.get).filter(v => v != null);
      const max = Math.max(...vals, 0), min = Math.min(...vals, 0);
      const span = (max - min) || 1;
      const LIMIT = 10;
      const show = cityRankExpanded ? arr : arr.slice(0, LIMIT);
      hostR.innerHTML = '';
      show.forEach((c, i) => {
        const v = m.get(c);
        const norm = v == null ? 0 : (v - min) / span;
        const active = F.city.has(c.key);
        const row = el('div', 'city-row' + (active ? ' on' : ''));
        row.tabIndex = 0; row.setAttribute('role', 'button');
        row.style.setProperty('--bar', (v == null ? 0 : norm * 100).toFixed(0) + '%');
        row.innerHTML = `<span class="rk">${i + 1}</span><span class="cn">${esc(c.name)}<em>${esc(c.prov)}</em></span><span class="cv">${m.fmt(v)}</span>`;
        row.setAttribute('aria-label', `第${i + 1}名 ${c.name}${c.prov}：${m.label} ${m.fmt(v)}，点击筛选该城市赛事`);
        const act = () => {
          if (F.city.has(c.key)) F.city.delete(c.key);
          else { F.city.clear(); F.province.clear(); F.city.add(c.key); }
          renderRaces(); syncFilterUI(); drawMatrix(); drawRank();
          const rs = document.getElementById('races'); if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        row.addEventListener('click', act);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
        hostR.appendChild(row);
      });
      const more = $('#cityRankMore');
      if (more) {
        if (arr.length > LIMIT) { more.hidden = false; more.textContent = cityRankExpanded ? '收起' : `展开全部（共 ${arr.length} 城）`; }
        else more.hidden = true;
      }
    }

    $$('#cityMetric .chip').forEach(b => b.addEventListener('click', () => {
      $$('#cityMetric .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); metric = b.dataset.v;
      drawMatrix(); drawRank();
    }));
    const moreBtn = $('#cityRankMore');
    if (moreBtn) moreBtn.addEventListener('click', () => { cityRankExpanded = !cityRankExpanded; drawRank(); });
    const clearBtn = $('#cityClear');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      F.province.clear(); F.city.clear();
      renderRaces(); syncFilterUI(); drawMatrix(); drawRank();
    });

    syncFilterUI();
    drawMatrix(); drawRank();
    // 供外部（全国城市成绩榜的「筛选该市赛事」）刷新本榜高亮与清除按钮
    window.__cityBoardRefresh = () => { syncFilterUI(); drawMatrix(); drawRank(); };
  }

  /* ---------- 13. 初始渲染 ---------- */
  renderRaces();
  renderRegCalendar();
  renderWorth();
  renderCityBoard();

  /* ---------- 13a. 数据更新记录（报告 6.6：页脚固定「数据快照 + 查看更新记录」） ---------- */
  /* 仅记录本站点真实发生的变更，日期取数据核实日，绝不编造。 */
  (function initChangelog() {
    const CHANGELOG = [
      {
        d: '2026-09-13',
        items: [
          '报名窗口扩充至 20 场：新增太原（7/15 15:00–7/29 23:59，先缴费后抽签）、衡水湖（预报名 7/24 10:00–7/30 18:00）、郑州（8/10 10:00–8/19 17:00，费用 200 元/人）三场已核实窗口，均逐条带来源',
          '新增沈阳马拉松 2026 赛果（9/6 举办，22000 人）：男子冠军 Francis Kipkorir Langat（肯尼亚）、女子冠军 Minalle（埃塞俄比亚）；中国籍女子第一朱卿 2:30:48（女子组季军）',
          '报名状态一致性修正：8 场已完赛赛事由「待开启 / 已截止」改为「已结束」；6 场 9-13 当日开赛赛事由「待开启」改为「已截止」（报名窗口均已关闭）',
          '赛道数据来源标注改为跟随数据快照日期，不再写死'
        ]
      },
      {
        d: '2026-09-05',
        items: [
          '赛道难度扩充至 65 场：头部全程马拉松 72 场全覆盖（新增盐城 / 淮安 / 杨凌农科城 / 新余仙女湖 / 桂林，含关门时间表与来源）',
          '报名窗口扩充至 17 场：新增桂林（报名中至 9/29）、泗洪、武汉光谷、常州西太湖、杭州钱塘女子、合肥、杭马等核实窗口；多场规模按官方公告修正（杭马 3.6 万、合肥 3 万、杨凌 2 万等）',
          '报名日历卡片新增「名额规则」标签（超额抽签 / 先报先得 / 抽签+候补），弹窗 KEY DATA 同步展示',
          '「全国城市成绩榜」城市行新增「筛选该市赛事」按钮，与数据洞察「城市赛道榜」行为统一（整行点击仍打开代表赛事弹窗）',
          '赛事详情弹窗官方报名入口从 9 个扩至 20 个（全部为已核实的赛事官网）',
          '赛事库搜索支持自然语言：「本周六 全马 A1」「下周 金标 报名中」等口语组合自动解析为筛选条件',
          '我的赛程新增报名截止 D-Day 预警（7 天内琥珀 / 3 天内红色加急），首屏新增个人提醒条',
          '补充 MIT 开源许可证'
        ]
      },
      {
        d: '2026-09-01',
        items: [
          '赛道难度数据扩充：新增省会级全马与直辖市/特别行政区区县分支赛事（累计 40+ 场，含累计爬升、关门时间、海拔、比赛日历史均温）',
          '新增「PB 赛道指数榜 TOP15」：基于累计爬升 / 海拔 / 关门时间 / 世界田联标牌 / 参赛规模的可量化模型，S–D 五档',
          '赛事卡片支持键盘 Tab 聚焦，Enter / 空格 打开详情，并带可见焦点环',
          '报名状态语义色调整：待开启=黄、已截止=灰红，与「待官宣」虚线徽章区分',
          '新增「城市赛道榜」（P2-6 替代可视化）：省份热力矩阵 + 城市榜，按赛事数 / PB友好指数 / 平均爬升三指标排序；点击省份或城市直接筛选赛事库。采用零合规风险的矩阵/榜单形态，不绘制地图轮廓'
        ]
      },
      {
        d: '2026-08-31',
        items: [
          '上线「报名日历」：按官方核实的报名窗口展示开抢 / 截止倒计时，截止日未获官方公布的赛事统一标注「待核实」',
          '新增「近期值得跑」推荐与跑者口碑评分框架（评分功能尚未开放收录）',
          '新增浅色主题切换、赛事分享链接、收藏赛程、单场 .ics 日历导出',
          '上线 IP 访问量统计（同一访客 5 分钟内不重复计数）',
          '赛事详情弹窗无障碍优化：焦点陷阱、ESC 关闭、aria 语义',
          '数字排版统一为等宽数字（tabular-nums），避免倒计时跳动'
        ]
      },
      {
        d: '2026-08-30',
        items: [
          '跑历 RunCal 建档：收录 2026—2027 赛季 473 场中国马拉松赛事',
          '上线赛季总览、数据洞察、赛历时间轴、赛事库六维筛选与七张排行榜'
        ]
      }
    ];
    const mask = $('#logMask'), body = $('#logBody'), btn = $('#changelogBtn'), closeBtn = $('#logClose');
    if (!mask || !body || !btn) return;
    let lastFocus = null;

    body.innerHTML = CHANGELOG.map(day => `
      <div class="log-day">
        <div class="d">${day.d}</div>
        <ul>${day.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </div>`).join('') + `
      <div class="log-foot">
        以上为本站点的功能与数据更新记录，数据快照日期见页脚；赛事信息如有变动，以组委会官方渠道为准。
      </div>`;

    const open = () => {
      lastFocus = document.activeElement;
      mask.hidden = false;
      document.body.style.overflow = 'hidden';
      closeBtn && closeBtn.focus();
    };
    const close = () => {
      mask.hidden = true;
      document.body.style.overflow = '';
      lastFocus && lastFocus.focus();
    };
    btn.addEventListener('click', open);
    closeBtn && closeBtn.addEventListener('click', close);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !mask.hidden) close(); });
  })();

  /* ---------- 13a2. 访问量统计（按 IP、5 分钟内不重复，见 server.js /api/visit） ---------- */
  (function reportVisit() {
    try {
      fetch('/api/visit', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const el = document.getElementById('visitCount');
          if (el && d && typeof d.total === 'number') el.textContent = d.total.toLocaleString('zh-CN');
        })
        .catch(() => { /* 离线 / 隐私模式：保留「—」 */ });
    } catch (e) { /* fetch 不可用时静默 */ }
  })();

  /* ---------- 13b. 主题（晨光模式）持久化（报告 5.5） ---------- */
  (function initTheme() {
    const btn = $('#themeToggle');
    const saved = localStorage.getItem('runcal-theme') || 'dark';
    const apply = t => {
      document.documentElement.setAttribute('data-theme', t);
      if (btn) btn.textContent = t === 'light' ? '🌙 暗色' : '☀️ 明亮';
    };
    apply(saved);
    if (btn) btn.onclick = () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      localStorage.setItem('runcal-theme', next);
      apply(next);
    };
  })();

  /* ---------- 14. 深链：#race=<赛事名> 直接打开详情弹窗 ---------- */
  (function openFromHash() {
    const m = location.hash.match(/^#race=(.+)$/);
    if (!m) return;
    const r = ALL.find(x => x.name === decodeURIComponent(m[1]));
    if (r) openModal(r);
  })();

  window.ALL = ALL;
  window.openModal = openModal;
})();

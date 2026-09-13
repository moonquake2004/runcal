/* ============================================================
 * 跑历 RunCal —— 数据层加载器（P3-10 / P1-12）
 * ------------------------------------------------------------
 * 替代原先 10 个 data-*.js <script> 标签：
 *   1) 拉取 data/index.json 清单
 *   2) 并行拉取各 data/*.json，挂载到 window（与旧 JS 全局名一致）
 *   3) 注入 assets/js/app.js（确保数据就绪后再初始化）
 *
 * 容错策略（P1-12）：
 *   · 每个请求 8 秒超时（AbortController）—— 避免某个请求挂起时
 *     页面永久停在「正在加载赛事数据…」且用户没有重试入口
 *   · Promise.allSettled —— 单个文件失败不再拖垮整站，改为「局部降级」
 *   · 仅当「全部」失败时才显示错误页；部分失败只挂一条可关闭的提示条
 *   · 数据键名白名单校验，避免 window['__proto__'] 之类的原型污染路径
 * ============================================================ */
(function () {
  var VER = '20260913b';
  var q = '?v=' + VER;
  var TIMEOUT = 8000;
  var KEY_RE = /^[A-Z][A-Z0-9_]*$/;   // 只接受 RACES_2026 / COURSE_RECORDS 这类全大写键名

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showError(msg) {
    var box = document.getElementById('dataError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dataError';
      box.setAttribute('role', 'alert');
      box.style.cssText =
        'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(8,10,14,.94);color:#e8eef6;' +
        'font:15px/1.7 system-ui,sans-serif;padding:24px;text-align:center;';
      document.body.appendChild(box);
    }
    box.innerHTML =
      '<div style="max-width:520px"><div style="font-size:20px;margin-bottom:10px">⚠️ 数据加载失败</div>' +
      '<div style="color:#9fb0c3">' + escHtml(msg) + '</div>' +
      '<div style="margin-top:14px;color:#6f8196;font-size:13px">若以 file:// 直接打开本页会触发浏览器限制；' +
      '请通过 http(s) 服务访问（如本地 node server.js 或已部署站点）。</div>' +
      '<div style="margin-top:16px"><button onclick="location.reload()" ' +
      'style="padding:8px 18px;border-radius:8px;border:1px solid #4a5568;background:#1b2029;color:#e8eef6;' +
      'font:14px system-ui,sans-serif;cursor:pointer">重新加载</button></div></div>';
  }

  function noticePartial(failed) {
    var bar = document.getElementById('dataPartial');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'dataPartial';
      bar.setAttribute('role', 'status');
      bar.style.cssText =
        'position:fixed;left:12px;right:12px;bottom:12px;z-index:900;background:#5a4300;color:#ffe9a8;' +
        'padding:10px 14px;border-radius:10px;font:13px/1.6 system-ui,sans-serif;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;gap:12px;align-items:center;justify-content:space-between';
      document.body.appendChild(bar);
    }
    bar.innerHTML = '<span>⚠ 部分数据加载失败（' + escHtml(failed.join('、')) +
      '），相关模块已自动降级，其余功能正常。</span>' +
      '<button aria-label="关闭提示" style="background:transparent;border:1px solid #ffe9a8;color:#ffe9a8;' +
      'border-radius:6px;padding:2px 10px;cursor:pointer;font:13px system-ui,sans-serif">知道了</button>';
    bar.querySelector('button').onclick = function () { bar.remove(); };
  }

  function fetchJSON(url) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, TIMEOUT) : null;
    var name = url.split('?')[0].split('/').pop();
    return fetch(url, { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error(name + ' HTTP ' + r.status);
        return r.json();
      })
      .then(function (v) { if (timer) clearTimeout(timer); return v; })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        if (e && e.name === 'AbortError') throw new Error(name + ' 请求超时（' + TIMEOUT + 'ms）');
        throw e;
      });
  }

  function boot() {
    // 还原旧 course.js 暴露的辅助函数，调用方无需改动
    window.hasCourseImage = function (raceName) {
      return !!(window.COURSE_IMAGES && window.COURSE_IMAGES[raceName]);
    };
    // 数据已就绪，注入主程序。
    // 注意：加载提示 #boot 必须等 app.js 执行成功后再移除。旧实现在注入前就删掉，
    // 一旦 app.js 运行期抛异常，页面会变成「无任何提示的空页」。
    var s = document.createElement('script');
    s.src = 'assets/js/app.js' + q;
    s.onerror = function () {
      showError('主程序 app.js 加载失败（' + s.src + '）。');
    };
    s.onload = function () {
      var bootEl = document.getElementById('boot');
      if (bootEl && bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);
    };
    document.body.appendChild(s);
  }

  fetchJSON('data/index.json' + q)
    .then(function (manifest) {
      var files = (manifest && manifest.files) || [];
      if (!files.length) throw new Error('数据清单为空（data/index.json 未声明任何文件）');
      return Promise.allSettled(files.map(function (item) {
        if (!item || !KEY_RE.test(String(item.k || ''))) {
          return Promise.reject(new Error('非法数据键名：' + (item && item.k)));
        }
        return fetchJSON('data/' + item.f + '.json' + q).then(function (val) {
          window[item.k] = val;
        });
      })).then(function (results) {
        var failed = [];
        results.forEach(function (r, i) {
          if (r.status === 'rejected') failed.push(files[i].f);
        });
        if (failed.length === files.length) {
          throw new Error('全部数据文件加载失败：' + failed.join('、'));
        }
        if (failed.length) {
          console.warn('[RunCal] 部分数据加载失败：', failed);
          noticePartial(failed);
        }
      });
    })
    .then(boot)
    .catch(function (e) {
      showError((e && e.message) || '未知错误。');
    });
})();

/* ============================================================
 * 跑历 RunCal —— 数据层加载器（P3-10）
 * ------------------------------------------------------------
 * 替代原先 10 个 data-*.js <script> 标签：
 *   1) 拉取 data/index.json 清单
 *   2) 并行拉取各 data/*.json，挂载到 window（与旧 JS 全局名一致）
 *   3) 注入 assets/js/app.js（确保数据就绪后再初始化）
 * 任一请求失败都会显示明确错误，而不是白屏。
 * ============================================================ */
(function () {
  var VER = '20260905a';
  var q = '?v=' + VER;

  function showError(msg) {
    var box = document.getElementById('dataError');
    if (!box) {
      box = document.createElement('div');
      box.id = 'dataError';
      box.style.cssText =
        'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;' +
        'justify-content:center;background:rgba(8,10,14,.94);color:#e8eef6;' +
        'font:15px/1.7 system-ui,sans-serif;padding:24px;text-align:center;';
      document.body.appendChild(box);
    }
    box.innerHTML =
      '<div style="max-width:520px"><div style="font-size:20px;margin-bottom:10px">⚠️ 数据加载失败</div>' +
      '<div style="color:#9fb0c3">' + msg + '</div>' +
      '<div style="margin-top:14px;color:#6f8196;font-size:13px">若以 file:// 直接打开本页会触发浏览器限制；' +
      '请通过 http(s) 服务访问（如本地 node server.js 或已部署站点）。</div></div>';
  }

  fetch('data/index.json' + q, { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('index.json HTTP ' + r.status);
      return r.json();
    })
    .then(function (manifest) {
      return Promise.all(
        manifest.files.map(function (item) {
          return fetch('data/' + item.f + '.json' + q, { cache: 'no-cache' })
            .then(function (r) {
              if (!r.ok) throw new Error(item.f + '.json HTTP ' + r.status);
              return r.json();
            })
            .then(function (val) {
              window[item.k] = val;
            });
        })
      );
    })
    .then(function () {
      // 还原旧 course.js 暴露的辅助函数，调用方无需改动
      window.hasCourseImage = function (raceName) {
        return !!(window.COURSE_IMAGES && window.COURSE_IMAGES[raceName]);
      };
      // 数据已就绪，移除加载提示并注入主程序
      var boot = document.getElementById('boot');
      if (boot) boot.parentNode.removeChild(boot);
      var s = document.createElement('script');
      s.src = 'assets/js/app.js' + q;
      s.onerror = function () {
        showError('主程序 app.js 加载失败（' + s.src + '）。');
      };
      document.body.appendChild(s);
    })
    .catch(function (e) {
      showError((e && e.message) || '未知错误。');
    });
})();

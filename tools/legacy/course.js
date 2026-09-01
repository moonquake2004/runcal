/* ============================================================
   官方赛道图映射
   说明：官方赛道图分散在各赛事官网，没有统一数据源，
   仅对已成功下载的赛事配置真实图片；其余赛事弹窗顶部
   显示“官方赛道图暂未收录”占位，不再使用示意图。
   ============================================================ */
window.COURSE_IMAGES = {
  "厦门马拉松": "assets/img/courses/xiamen.jpg",
  "眉山仁寿半程马拉松": "assets/img/courses/meishan.jpg",
  "济南马拉松": "assets/img/courses/jinan.jpg"
};

window.hasCourseImage = function (raceName) {
  return !!window.COURSE_IMAGES[raceName];
};

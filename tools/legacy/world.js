/* ============================================================
   世界马拉松成绩数据（参考榜 · 外部权威来源）
   - 世界纪录：World Athletics / Runner's World（截至 2026 年）
   - 世界马拉松大满贯（Abbott World Marathon Majors）赛会纪录：
     各赛事官网、Olympics.com、The Running Channel（2026 年更新）
   字段：m=男子 / w=女子 / t=成绩 / n=创造者 / y=年份 / c=国籍
   说明：世界纪录与大满贯赛会纪录来自公开权威报道，与本站「全国赛事数据」
        相互独立，仅供横向对照参考。
   ============================================================ */
window.WORLD_RECORDS = {
  men: { t: "1:59:30", n: "Sabastian Sawe", c: "肯尼亚", y: 2026, race: "伦敦马拉松" },
  women: { t: "2:09:56", n: "Ruth Chepngetich", c: "肯尼亚", y: 2024, race: "芝加哥马拉松" }
};

// 七大世界马拉松大满贯，按男子赛会纪录最快排序
window.WORLD_MAJORS = [
  { city: "伦敦", race: "London Marathon", m: { t: "1:59:30", n: "Sabastian Sawe", c: "肯尼亚", y: 2026 }, w: { t: "2:15:25", n: "Paula Radcliffe", c: "英国", y: 2003 } },
  { city: "芝加哥", race: "Chicago Marathon", m: { t: "2:00:35", n: "Kelvin Kiptum", c: "肯尼亚", y: 2023 }, w: { t: "2:09:56", n: "Ruth Chepngetich", c: "肯尼亚", y: 2024 } },
  { city: "柏林", race: "Berlin Marathon", m: { t: "2:01:09", n: "Eliud Kipchoge", c: "肯尼亚", y: 2022 }, w: { t: "2:11:53", n: "Tigist Assefa", c: "埃塞俄比亚", y: 2023 } },
  { city: "波士顿", race: "Boston Marathon", m: { t: "2:01:52", n: "John Korir", c: "肯尼亚", y: 2026 }, w: { t: "2:17:22", n: "Sharon Lokedi", c: "肯尼亚", y: 2025 } },
  { city: "东京", race: "Tokyo Marathon", m: { t: "2:02:16", n: "Benson Kipruto", c: "肯尼亚", y: 2024 }, w: { t: "2:15:55", n: "Sutume Asefa Kebede", c: "埃塞俄比亚", y: 2024 } },
  { city: "纽约", race: "New York City Marathon", m: { t: "2:04:58", n: "Tamirat Tola", c: "埃塞俄比亚", y: 2023 }, w: { t: "2:19:51", n: "Hellen Obiri", c: "肯尼亚", y: 2025 } },
  { city: "悉尼", race: "Sydney Marathon", m: { t: "2:06:06", n: "Hailemaryam Kiros", c: "埃塞俄比亚", y: 2025 }, w: { t: "2:18:22", n: "Sifan Hassan", c: "荷兰", y: 2025 } }
];

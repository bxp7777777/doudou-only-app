/* 逻辑烟测：不需要浏览器，用 localStorage 桩跑一遍所有时段、课表、周期、故事、备忘 */

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  key: (i) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  }
};

const problems = [];
const check = (cond, msg) => {
  if (!cond) problems.push(msg);
};

const date = await import('../public/js/date.js');
const store = await import('../public/js/store.js');
const plan = await import('../public/js/plan.js');
const cycleUtil = await import('../public/js/cycle.js');
const storyUtil = await import('../public/js/story.js');
const jokeUtil = await import('../public/js/joke.js');
const schedule = await import('../public/js/schedule.js');

store.ensureDefaults();
const today = date.dateKey();

/* 存储层 */
check(store.CHECK_ITEMS.length === 7, '打卡项应为 7 条');
check(store.CHECK_ITEMS.some((i) => i.id === 'qin'), '打卡缺练琴');

store.addMemo('明天带琴谱');
store.addMemo('买松香');
check(store.getMemos().length === 2, '备忘录新增失败');
const first = store.getMemos()[0];
store.toggleMemo(first.id);
check(store.getMemos().filter((m) => m.done).length === 1, '备忘录勾选失败');
store.removeMemo(first.id);
check(store.getMemos().length === 1 && store.getMemos()[0].text === '明天带琴谱', '备忘录删除/顺序不对');

store.toggleCup(today, 0);
check(store.waterCount(today) === 1, '喝水计数不对');
store.toggleCup(today, 0);
check(store.waterCount(today) === 0, '喝水取消不对');

/* 模拟天气数据（形状和 /api/weather 返回一致） */
const weatherOk = [
  { key: 'nanning', name: '南宁', note: '学校', temp: 24, feels: 26, humidity: 78, max: 29, min: 20, diff: 9, rain: 60, text: '小雨', icon: '🌧' },
  { key: 'shenzhen', name: '深圳', note: '家里', temp: 27, feels: 29, humidity: 70, max: 30, min: 24, diff: 6, rain: 20, text: '多云', icon: '⛅' }
];

const BAN = ['穿搭', '外套', '毛衣', '羽绒', '裙子', '棉衣', '加件衣服'];
const textOf = (m) => {
  let s = [m.title, m.sub || '', ...(m.lines || [])].join(' ');
  (m.items || []).forEach((i) => (s += ' ' + i.label));
  if (m.story) s += ' ' + m.story.title + ' ' + m.story.body;
  if (m.cta) s += ' ' + m.cta.text;
  (m.cities || []).forEach((c) => (s += ' ' + c.name + c.text));
  return s;
};

/* 8 个时段 × 3 种天气状态 */
for (const [status, list] of [
  ['ok', weatherOk],
  ['fail', []],
  ['loading', []]
]) {
  for (const p of ['deepnight', 'morning', 'noon', 'afternoon', 'evening', 'late', 'bedtime', 'sleep']) {
    const mods = plan.build({
      today,
      period: p,
      now: new Date(2026, 10, 2, 16, 0),
      water: store.getWater(today),
      checkin: store.getCheckin(today),
      cycle: null,
      weather: list,
      weatherStatus: status
    });
    check(mods.length > 0, `时段 ${p} 没有模块`);
    const ids = mods.map((m) => m.id);
    check(new Set(ids).size === ids.length, `时段 ${p} 模块 id 重复`);
    for (const m of mods) {
      check(!!m.id && !!m.title && !!m.icon, `时段 ${p} 模块缺字段：${m.id}`);
      const t = textOf(m);
      for (const b of BAN) check(!t.includes(b), `时段 ${p} 的 ${m.id} 出现禁用词「${b}」`);
    }
  }
}

/* 吃饭不再推具体菜，指向食堂 */
const morning = plan.build({
  today,
  period: 'morning',
  now: new Date(2026, 10, 4, 7, 30),
  water: { cups: [true, false, false] },
  checkin: {},
  cycle: null,
  weather: weatherOk,
  weatherStatus: 'ok'
});
const mealText = textOf(morning.find((m) => m.id === 'meal'));
for (const dish of ['番茄', '馄饨', '南瓜粥', '三文鱼', '饭团']) {
  check(!mealText.includes(dish), `吃饭模块还在推具体菜：${dish}`);
}
check(mealText.includes('食堂'), '吃饭模块应引导去食堂');

/* 天气卡 */
const wxCard = morning.find((m) => m.id === 'weather');
check(wxCard.cities.length === 2, '天气卡应同时有南宁和深圳');
check(textOf(wxCard).includes('温差'), '天气卡缺温差提醒');
check(textOf(wxCard).includes('伞'), '降水 60% 应提醒带伞');

/* 天气失败兜底 */
const wxFail = plan.build({
  today,
  period: 'afternoon',
  now: new Date(2026, 10, 2, 16, 0),
  water: { cups: [false, false, false] },
  checkin: {},
  cycle: null,
  weather: [],
  weatherStatus: 'fail'
});
check(wxFail.some((m) => textOf(m).includes('没查到')), '天气失败时应温柔兜底');

/* 课表：未填写时只提示「待填写」，不拿默认猜测当结论；星期映射仍要对 */
const WEEK_DATES = [
  [new Date(2026, 10, 2), '周一'],
  [new Date(2026, 10, 3), '周二'],
  [new Date(2026, 10, 4), '周三'],
  [new Date(2026, 10, 5), '周四'],
  [new Date(2026, 10, 6), '周五'],
  [new Date(2026, 10, 7), '周六'],
  [new Date(2026, 10, 8), '周日']
];
for (const [d, name] of WEEK_DATES) {
  check(schedule.of(d).name === name, `星期映射错误：${name}`);
  check(schedule.of(d).known === false, `未填的 ${name} 不应被当作已确定`);
  const mods = plan.build({
    today: date.dateKey(d),
    period: 'morning',
    now: d,
    water: { cups: [false, false, false] },
    checkin: {},
    cycle: null,
    weather: weatherOk,
    weatherStatus: 'ok'
  });
  const sch = mods.find((m) => m.id === 'schedule');
  check(!!sch, `${name} 缺节奏卡`);
  check(textOf(sch).includes('待豆豆填写'), `${name} 未填时应标注待豆豆填写`);
}

/* 豆豆自己填课表：填了必须压过默认 */
const customMap = {
  3: { first: '10:00', afternoon: true, note: '合唱排练' },
  4: { first: '', afternoon: false, note: '睡饱' }
};
store.setSchedule(customMap);
check(store.getSchedule()[3].first === '10:00', '课表没存进 dd:schedule');
check(store.getSchedule()[4].afternoon === false, '课表下午标记没存对');
schedule.setCustom(store.getSchedule());
const wed = schedule.of(new Date(2026, 10, 4));
check(wed.custom === true, '覆盖后应标记 custom');
check(wed.first === '10:00' && wed.busy === 'mid', `周三应被改成早十/中强度，实际 ${wed.first}/${wed.busy}`);
check(wed.note.includes('合唱排练') && wed.note.includes('下午有课'), `周三备注没带上，实际「${wed.note}」`);
const thu = schedule.of(new Date(2026, 10, 5));
check(thu.first === '' && thu.busy === 'low', `周四应改成上午没课/低强度，实际 ${thu.first}/${thu.busy}`);
check(thu.note.includes('睡饱'), '周四备注没带上');
const mon = schedule.of(new Date(2026, 10, 2));
check(mon.custom === false && mon.first === '10:00', '没填的日子应继续用默认');
const tTom = schedule.tomorrow(new Date(2026, 10, 5));
check(tTom.name === '周五', 'tomorrow 星期算错');
const modsCustom = plan.build({
  today: date.dateKey(new Date(2026, 10, 4)),
  period: 'morning',
  now: new Date(2026, 10, 4),
  water: { cups: [false, false, false] },
  checkin: {},
  cycle: null,
  weather: weatherOk,
  weatherStatus: 'ok'
});
const schCustom = modsCustom.find((m) => m.id === 'schedule');
check(textOf(schCustom).includes('早十'), '自定义课表没进首页节奏卡');
schedule.setCustom({});
check(schedule.of(new Date(2026, 10, 4)).first === '08:00', '清空自定义后应回到默认周三早八');

/* 周二下午练琴；周三晚安包预告周四 */
const tue = plan.build({
  today: date.dateKey(new Date(2026, 10, 3)),
  period: 'afternoon',
  now: new Date(2026, 10, 3, 15, 0),
  water: { cups: [false, false, false] },
  checkin: {},
  cycle: null,
  weather: weatherOk,
  weatherStatus: 'ok'
});
check(tue.some((m) => m.id === 'qin'), '周二下午应有练琴块');

const wedBed = plan.build({
  today: date.dateKey(new Date(2026, 10, 4)),
  period: 'bedtime',
  now: new Date(2026, 10, 4, 23, 5),
  water: { cups: [true, true, false] },
  checkin: {},
  cycle: null,
  weather: weatherOk,
  weatherStatus: 'ok'
});
check(wedBed.some((m) => m.id === 'review'), '晚安包缺回顾');
const bedStory = wedBed.find((m) => m.type === 'story');
check(!!bedStory && bedStory.title === '每日小故事' && Array.isArray(bedStory.lines) && bedStory.lines.length > 0, '每日收尾包缺每日小故事模块');
check(!bedStory || !bedStory.nn || !bedStory.nn.includes('晚安'), '故事模块不应再带“晚安”收尾');
check(wedBed.some((m) => m.id === 'memo'), '晚安包缺备忘录入口');
check(textOf(wedBed.find((m) => m.id === 'tomorrow')).includes('周四'), '晚安包应预告明天周四');

/* 周期四相位 */
const a1 = cycleUtil.analyze({ lastStart: date.addDays(today, -2), cycleLength: 28, periodLength: 5 }, today);
check(a1.phase === 'period' && a1.headline.includes('第3天'), '经期相位错');
const a2 = cycleUtil.analyze({ lastStart: date.addDays(today, -24), cycleLength: 28, periodLength: 5 }, today);
check(a2.phase === 'premenstrual' && a2.daysToNext === 4, '经前相位错');
const a3 = cycleUtil.analyze({ lastStart: date.addDays(today, -10), cycleLength: 28, periodLength: 5 }, today);
check(a3.phase === 'normal' && a3.cycleDay === 11, '常规相位错');
const a4 = cycleUtil.analyze({ lastStart: date.addDays(today, -35), cycleLength: 28, periodLength: 5 }, today);
check(a4.phase === 'overdue', '推迟相位错');

/* 经期具体照顾动作：四个相位都要有，而且首页卡的头两句要能马上照做 */
for (const [a, name] of [[a1, '经期'], [a2, '经前'], [a3, '常规'], [a4, '推迟']]) {
  check(Array.isArray(a.care) && a.care.length >= 3, name + '相位缺具体照顾动作');
  check(a.lines.length >= a.care.length, name + '相位 lines 应包含照顾动作');
}
check(a1.lines[0] === a1.care[0], '经期头一句应来自照顾动作');
check(a1.care.some((l) => l.includes('敷') || l.includes('热水')), '经期缺热敷类动作');
check(a2.care.some((l) => l.includes('热敷') || l.includes('温水脚')), '经前缺暖身类动作');
check(a1.care.some((l) => l.includes('卫生用品')), '经期应提醒勤换卫生用品');
const a1next = cycleUtil.analyze({ lastStart: date.addDays(today, -1), cycleLength: 28, periodLength: 5 }, date.addDays(today, 1));
check(a1.care.join('|') !== a1next.care.join('|') || a1.care.length < 2, '照顾动作应隔天轮换');

/* 期末周 2026-12-28 ~ 2027-01-03：考前一周开始出现，结束后两天收尾，平时不出现 */
const examBuild = (todayKey, period, now) =>
  plan.build({ today: todayKey, period, now, water: { cups: [false, false, false] }, checkin: {}, cycle: null, weather: weatherOk, weatherStatus: 'ok' });
const examIn = examBuild('2026-12-29', 'morning', new Date(2026, 11, 29, 8, 0)).find((m) => m.id === 'exam');
check(!!examIn && examIn.title.includes('期末'), '期末周内应出现期末卡');
check(!!examIn && examIn.title.includes('第 2 天'), '期末卡应标出考试第几天');
const examBefore = examBuild('2026-12-24', 'afternoon', new Date(2026, 11, 24, 15, 0)).find((m) => m.id === 'exam');
check(!!examBefore && examBefore.title.includes('还有 4 天'), '考前一周应显示倒计时');
const examEve = examBuild('2026-12-27', 'evening', new Date(2026, 11, 27, 20, 0)).find((m) => m.id === 'exam');
check(!!examEve && examEve.title.includes('还有 1 天'), '考前最后一晚应是「还有 1 天」');
const examLate = examBuild('2026-12-28', 'morning', new Date(2026, 11, 28, 8, 0)).find((m) => m.id === 'exam');
check(!!examLate && examLate.title.includes('第 1 天'), '开考当天应切到「第 1 天」');
const examOff = examBuild('2026-11-04', 'morning', new Date(2026, 10, 4, 8, 0));
check(!examOff.some((m) => m.id === 'exam'), '非期末周不该出现期末卡');
const examOver = examBuild('2026-12-30', 'morning', new Date(2026, 11, 30, 8, 0));
check(examOver.filter((m) => m.id === 'exam').length === 1, '期末卡只应出现一次');

/* 1000 篇每日小故事：全量走一遍，检查字数区间、正文唯一、禁用词；标题允许复用 */
let lastBody = null;
const bodySeen = new Set();
const storyBodies = [];
for (let i = 0; i < 1000; i++) {
  const s = storyUtil.current(date.addDays('2026-01-01', i));
  check(s.body.length >= 100, `故事太短（${s.body.length}字）：${s.title}`);
  check(s.body.length <= 300, `故事太长（${s.body.length}字）：${s.title}`);
  bodySeen.add(s.body);
  storyBodies.push(s.body);
  if (lastBody) check(lastBody !== s.body, `连续两天正文相同：${s.title}`);
  lastBody = s.body;
}
check(bodySeen.size === 1000, `故事正文应正好 1000 篇且唯一，实际 ${bodySeen.size}`);
const storyAll = storyBodies.join('');
for (const b of ['榴莲', '臭豆腐', '螺蛳粉', '穿搭', '外套', '羽绒', '加件衣服']) {
  check(!storyAll.includes(b), `故事里出现禁用词「${b}」`);
}

/* 1000 条每日一笑：数量、字数区间、正文唯一、禁用词、取篇/换篇可用 */
const JOKES = (await import('../public/js/jokes.js')).default;
check(JOKES.length === 1000, `笑话应 1000 条，实际 ${JOKES.length}`);
const jokeSeen = new Set();
const jokeAll = [];
for (const j of JOKES) {
  check(j.body.length >= 45, `笑话太短（${j.body.length}字）：${j.title}`);
  check(j.body.length <= 140, `笑话太长（${j.body.length}字）：${j.title}`);
  jokeSeen.add(j.body);
  jokeAll.push(j.body);
}
check(jokeSeen.size === JOKES.length, '笑话正文存在重复');
for (const b of ['榴莲', '臭豆腐', '螺蛳粉', '穿搭', '外套', '羽绒', '加件衣服']) {
  check(!jokeAll.join('').includes(b), `笑话里出现禁用词「${b}」`);
}
const j1 = jokeUtil.current('2026-11-03');
const j2 = jokeUtil.another('2026-11-03');
check(j1.total === 1000 && j2.total === 1000, '笑话总数不对');
check(j1.body !== j2.body, '换一个笑话应得到不同正文');

/* 陪伴勋章数据层：初始五枚均未解锁，结构完整、类型齐全 */
const badges = store.getBadges();
check(badges.length === 5, `应有五枚陪伴勋章，实际 ${badges.length}`);
check(badges.every((b) => !b.unlocked), '初始状态勋章都不应解锁');
check(badges.every((b) => typeof b.progress === 'string' && b.progress.includes('/')), '勋章应显示进度 x/y');
const badgeKinds = badges.map((b) => b.kind);
check(badgeKinds.filter((k) => k === 'storyStreak').length === 2, '应有 2 枚连续天数勋章');
check(badgeKinds.filter((k) => k === 'jokeCount').length === 2, '应有 2 枚笑话累计勋章');
check(badgeKinds.includes('storyTotal'), '应有 1 枚故事累计篇数勋章');
check(badges.some((b) => b.key === 'book' && b.goal === 30), '故事收藏家阈值应为累计 30 篇');

/* 小日子：写、读、标签、搜索、统计、删除 */
const d1 = date.addDays(today, -2);
const d2 = date.addDays(today, -1);
store.saveDiary(d1, { text: '琴房练了两小时，手指有点酸', mood: 'ok', body: 'tired', tags: ['练琴', '食堂'] });
store.saveDiary(d2, { text: '下雨，食堂的汤很暖' });
store.saveDiary(today, { text: '今天想早点睡', mood: 'happy' });
check(store.getDiary(d1) && store.getDiary(d1).mood === 'ok', '日记没存上');
check(store.getDiary(d1).tags.length === 2, '日记标签没存上');
const diaryList = store.listDiary(10);
check(diaryList.length === 3, `日记列表应有 3 天，实际 ${diaryList.length}`);
check(diaryList[0].date === today, '日记列表应按日期倒序');
const dStats = store.diaryStats(today);
check(dStats.streak === 3, `连续天数应为 3，实际 ${dStats.streak}`);
check(dStats.total === 3, `总天数应为 3，实际 ${dStats.total}`);
check(dStats.chars === '琴房练了两小时，手指有点酸'.length + '下雨，食堂的汤很暖'.length + '今天想早点睡'.length, '字数统计不对');
check(store.hasDiary(d1) && !store.hasDiary(date.addDays(today, -5)), 'hasDiary 判断不对');
store.saveDiary(d1, { text: '', mood: '', body: '', tags: [] });
check(!store.getDiary(d1), '清空内容后应把那天删掉');
store.deleteDiary(d2);
check(!store.getDiary(d2), 'deleteDiary 没删掉');
const db = date.addDays(today, -3);
store.saveDiary(db, { body: 'tired' });
check(store.hasDiary(db), '只填身体状态 body 也应判定为写过（日历角标要点亮）');
store.deleteDiary(db);
check(!store.hasDiary(db), '删除后 hasDiary 应为 false');
const dStats2 = store.diaryStats(today);
check(dStats2.total === 1 && dStats2.streak === 1, `删完只剩今天，实际 total=${dStats2.total} streak=${dStats2.streak}`);

if (problems.length) {
  console.error(`❌ 问题 ${problems.length} 条：`);
  for (const p of problems) console.error(' - ' + p);
  process.exit(1);
}

console.log(`✅ 逻辑烟测通过：8 时段 × 3 天气状态、7 天课表、周期 4 相位、${bodySeen.size} 篇故事、${JOKES.length} 条笑话、5 枚勋章`);
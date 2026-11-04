import * as date from './date.js';

const ASK_TEXT =
  '豆豆大王～小猪想帮你记着小日子，方便的时候告诉小猪：①最近一次例假第一天是几月几号；' +
  '②大概隔多少天来一次（不知道就说“差不多”，小猪先按28天记）；③一般来几天呀？' +
  '记好以后小猪就悄悄帮你算着，提前提醒你保暖～';

const DEFAULT = { lastStart: '', cycleLength: 28, periodLength: 5 };

function normalize(cfg) {
  const c = Object.assign({}, DEFAULT, cfg || {});
  c.cycleLength = Math.min(60, Math.max(15, Number(c.cycleLength) || 28));
  c.periodLength = Math.min(12, Math.max(2, Number(c.periodLength) || 5));
  return c;
}

function hasParams(cfg) {
  return !!(cfg && cfg.lastStart && /^\d{4}-\d{2}-\d{2}$/.test(cfg.lastStart));
}

/** 全部按当前日期现算，不做任何编造 */
function analyze(cfg, todayKey) {
  if (!hasParams(cfg)) return null;
  const c = normalize(cfg);
  const today = todayKey || date.dateKey();
  const diff = date.dayDiff(c.lastStart, today); // 今天 - 末次第一天
  const nextKey = date.addDays(c.lastStart, c.cycleLength);
  const daysToNext = date.dayDiff(today, nextKey); // 正数=还有几天
  const ovuKey = date.addDays(nextKey, -14);
  const fertileStart = date.addDays(ovuKey, -5);
  const fertileEnd = date.addDays(ovuKey, 4);
  const cycleDay = (((diff % c.cycleLength) + c.cycleLength) % c.cycleLength) + 1;

  let phase = 'normal';
  let headline = '';
  let lines = [];

  if (diff >= 0 && diff < c.periodLength) {
    phase = 'period';
    const dayIn = diff + 1;
    const left = c.periodLength - dayIn;
    headline = '经期第' + dayIn + '天' + (left === 0 ? ' · 快结束啦' : '');
    lines = [
      left === 0
        ? '今天大概就是尾巴了，别急着吃生冷的东西。'
        : '大概还有 ' + left + ' 天，量多的这两天多躺着歇一会儿。',
      '暖宝宝、温水红糖姜茶挑一个；生冷、剧烈运动这几天先放放。',
      '情绪大一点不怪你，小金毛把毯子烘暖了在门口等着。'
    ];
  } else if (daysToNext < 0) {
    phase = 'overdue';
    headline = '这轮晚了 ' + Math.abs(daysToNext) + ' 天';
    lines = [
      '小猪不来催你，也不算数，先把自己照顾好。',
      '这几天少熬夜、少冰饮，腰腹别吹风；不舒服就早点睡。',
      '有新日期了随时告诉小猪，小猪立刻重新算。'
    ];
  } else if (daysToNext <= 5) {
    phase = 'premenstrual';
    headline = '经前第 ' + (6 - daysToNext) + ' 天 · 快到了';
    lines = [
      '还有 ' + daysToNext + ' 天就要来啦，别熬夜、少盐少冰。',
      '提前暖肚子，腰上搭件薄毯子，这几天对自己松一点。',
      '情绪上下起伏是激素在闹，不怪你，小猪陪着。'
    ];
  } else {
    phase = 'normal';
    headline = '距下次还有 ' + daysToNext + ' 天';
    lines = [
      '日常养护别断：少冰、护好腰腹、睡够、多喝温水。',
      '身体有点小变化就记下来，小猪帮你攒着看规律。'
    ];
  }

  const chips = [
    { label: '周期第', value: cycleDay + ' 天' },
    { label: '距下次', value: daysToNext >= 0 ? daysToNext + ' 天' : '晚 ' + Math.abs(daysToNext) + ' 天' },
    { label: '下次约', value: date.cnShort(nextKey) }
  ];

  const reference =
    '参考：排卵日约 ' + date.cn(ovuKey) + '，易孕期约 ' +
    date.cn(fertileStart) + '–' + date.cn(fertileEnd) +
    '。都是按你给的参数记的，小猪陪你留意着。';

  return {
    phase,
    cycleDay,
    headline,
    lines,
    chips,
    reference,
    nextKey,
    daysToNext,
    ovuKey,
    fertileStart,
    fertileEnd,
    cycleLength: c.cycleLength,
    periodLength: c.periodLength,
    lastStart: c.lastStart
  };
}

export { ASK_TEXT, DEFAULT, normalize, hasParams, analyze };

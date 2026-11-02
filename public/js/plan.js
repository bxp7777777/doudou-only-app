import * as store from './store.js';
import * as cycleUtil from './cycle.js';
import * as storyUtil from './story.js';
import * as schedule from './schedule.js';
import SKINCARE from './skincare.js';
import * as HEALTH from './health.js';

const GREETING = {
  morning: '豆豆大王，早上好呀',
  noon: '豆豆大王，午安',
  afternoon: '豆豆大王，下午好',
  evening: '豆豆大王，晚上好',
  late: '豆豆大王，该收工啦',
  bedtime: '豆豆大王，故事时间到',
  deepnight: '豆豆大王，这么晚还没睡呀',
  sleep: '豆豆大王，该睡啦'
};

const CUP_TEXT = {
  morning: '上午这一杯',
  noon: '午间也来一口',
  afternoon: '午后这一杯',
  evening: '晚间这一杯',
  late: '睡前只抿两口',
  bedtime: '睡前只抿两口'
};

function dayIndex(key) {
  const parts = String(key || '').split('-');
  return Math.floor(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime() / 86400000);
}

function greeting(period) {
  return GREETING[period] || GREETING.morning;
}

/* ------------------------- 1. 喝水 ------------------------- */

function waterModule(period, day, water) {
  const cups = water && water.cups ? water.cups : [false, false, false];
  const done = cups.filter(Boolean).length;
  let lines = [];

  if (done >= 3) {
    lines = ['3杯全搞定啦！小金毛尾巴摇成小风扇，夸夸你！', '还想喝就小口抿一点，别灌。'];
  } else if (period === 'late' || period === 'bedtime') {
    lines = ['睡前这杯只抿两口润润嘴，喝多了夜里要起夜。', '今天已经喝了 ' + done + '/3 杯，剩下的明天小猪接着陪。'];
  } else {
    const head = CUP_TEXT[period] || '这一杯';
    lines = [head + '，小口慢喝、别加冰，别一口闷。'];
    if (done === 0) lines.push('先喝半杯就好，小猪已经把温水端过来了。');
    if (done === 1) lines.push('已经1杯啦，还差2杯，小猪陪你慢慢喝。');
    if (done === 2) lines.push('就差最后一杯，小猪陪你一起喝掉它。');
  }

  return {
    id: 'water',
    type: 'water',
    icon: '💧',
    title: '喝水 · 今天 ' + done + '/3 杯',
    sub: '小口、温的、不加冰',
    lines: lines,
    cups: [0, 1, 2].map(function (i) {
      return { index: i, done: !!cups[i] };
    })
  };
}

/* ------------------- 2. 吃饭（不推具体菜，她在学校吃） ------------------- */

function mealModule(period, now) {
  const s = schedule.of(now || new Date());
  const M = {
    morning: {
      title: '吃饭 · 早餐',
      sub: '在学校食堂吃，别空着肚子去上课',
      lines: [
        '去食堂吃早饭，热的、七分饱，别省。',
        s.first === '08:00'
          ? '今天早八，先吃再出门；来不及就带一份能拿在手上的热乎的。'
          : '今天不早八，可以慢慢吃，吃完再晃过去。',
        '别用冰饮开胃，配温水。'
      ]
    },
    noon: {
      title: '吃饭 · 午餐',
      sub: '错峰去食堂，不用挤',
      lines: ['去食堂打热的菜，一荤一素，七分饱。', '吃完饭慢慢走两分钟，别马上趴桌睡。', '少冷饮，少重油重辣。']
    },
    afternoon: {
      title: '吃饭 · 下午垫一口（可选）',
      sub: '饿就吃一点，别硬撑到晚饭',
      lines: ['饿了就在食堂或小卖部垫一小份温的，别用零食顶一顿。', '不饿也别硬塞，等晚饭好好吃。']
    },
    evening: {
      title: '吃饭 · 晚餐',
      sub: '再忙也坐下把饭吃完',
      lines: ['晚饭七分饱，热的菜多打一点。', '吃完走两圈，别直接回宿舍躺。', '少冰、少重油重辣。']
    },
    late: {
      title: '别再加餐啦',
      sub: '',
      lines: ['这会儿不饿就别吃了，最多抿两口温水。', '胃也要睡觉，留着明天好好吃早饭。']
    }
  };

  const m = M[period];
  if (!m) return null;
  return { id: 'meal', type: 'text', icon: '🍚', title: m.title, sub: m.sub, lines: m.lines };
}

/* ------------------------- 天气：南宁 + 深圳 ------------------------- */

function weatherModule(ctx) {
  const list = ctx.weather || [];
  const status = ctx.weatherStatus || (list.length ? 'ok' : 'loading');
  const lines = [];

  if (status === 'fail' || (!list.length && status !== 'loading')) {
    lines.push('小猪没查到今天的天气，出门前自己看一眼窗外。');
    lines.push(HEALTH.pick(dayIndex(ctx.today))[0]);
  } else if (!list.length) {
    lines.push('小猪正在踮脚看天……');
  } else {
    const nn = list.filter(function (c) {
      return c.key === 'nanning';
    })[0];

    if (nn && nn.diff !== null && nn.diff !== undefined) {
      if (nn.diff >= 8) {
        lines.push('南宁今天温差 ' + nn.diff + ' 度：多喝温水、护好肚子和脚，别对着风口。');
      } else if (nn.diff >= 6) {
        lines.push('南宁今天温差 ' + nn.diff + ' 度，早晚凉一点，温水别断。');
      } else {
        lines.push('南宁今天温差不大 ' + nn.diff + ' 度，照样记着喝温水。');
      }
    }
    if (nn && nn.humidity >= 80) lines.push('湿度偏高，出汗及时擦干，别对着风口吹。');
    if (nn && nn.humidity !== null && nn.humidity <= 40) lines.push('有点干：护手霜、润唇带上，少量多次补水。');

    list.forEach(function (c) {
      if (c.rain !== null && c.rain >= 50) {
        lines.push(c.name + '可能下雨（降水概率 ' + c.rain + '%），伞放进包里。');
      }
    });
  }

  return {
    id: 'weather',
    type: 'weather',
    icon: '🌤',
    title: '南宁 · 深圳',
    sub: '只看身体感受，不谈穿什么',
    lines: lines,
    cities: list,
    status: status
  };
}

/* ------------------------- 今天的节奏（课表） ------------------------- */

function scheduleModule(now) {
  const s = schedule.of(now);
  const lines = [];

  // 她没排之前，小猪不拿默认猜测当事实下结论
  if (!s.known) {
    lines.push('这周课表还没排，小猪先不替你猜；去「设置 · 课表节奏」按真实课表填好，之后每天就按你排的来提醒。');
    return {
      id: 'schedule',
      type: 'text',
      icon: '📅',
      title: '今天的节奏 · ' + s.name,
      sub: '待豆豆填写',
      lines: lines
    };
  }

  if (s.first === '08:00') {
    lines.push('今天早八，先吃早饭再出门，别空着肚子上课。');
  } else if (s.first === '10:00') {
    lines.push('今天早十，早饭可以慢慢吃，吃完再过去。');
  } else {
    lines.push('今天上午没早课，睡饱一点，起来先喝半杯温水。');
  }

  if (s.noteRaw) lines.push(s.noteRaw + '。');
  if (s.busy === 'high') lines.push('最忙的一天：水杯放桌角，下课先喝两口。');
  if (s.afternoon) lines.push('下午有课，记得留好课间和练琴的空档。');
  if (s.wd === 0 || s.wd === 6) lines.push('今天没课，可以睡饱、练琴、把备忘录清一清。');

  return {
    id: 'schedule',
    type: 'text',
    icon: '📅',
    title: '今天的节奏 · ' + s.name,
    sub: '按豆豆自己填的课表',
    lines: lines
  };
}

/* ------------------------- 练琴 · 护手 ------------------------- */

function qinModule(period, now) {
  const s = schedule.of(now);
  let lines = [];

  if (period === 'afternoon') {
    lines = [
      s.wd === 2 ? '下午很空，正好练30分钟。' : '有空档就练30分钟，慢练比硬练有用。',
      '练前洗手擦干，练完涂护手霜、手指拉伸两下。'
    ];
  } else if (period === 'evening') {
    lines = ['今天练琴了吗？练完别马上冲凉水。', '睡前给手抹点护手霜，明天按弦才不疼。'];
  } else {
    lines = ['洗过手擦干再碰琴，别用冷水泡手。', '弹完涂一层护手霜，指甲修短一点更好按弦。'];
  }

  return {
    id: 'qin',
    type: 'text',
    icon: '🎼',
    title: '练琴 · 护手',
    sub: s.known && s.first === '08:00' ? '早八的日子，练琴挪到下午或晚上' : '手是练琴的本钱，别泡冷水',
    lines: lines
  };
}

/* ------------------------- 敏感肌护肤 ------------------------- */

function skincareModule(period) {
  if (period === 'morning') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.morning.title,
      sub: '敏感肌越简单越稳',
      lines: SKINCARE.morning.steps.concat([SKINCARE.morning.note])
    };
  }
  if (period === 'evening' || period === 'late') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.evening.title,
      sub: '不刷酸、不去角质、不上猛药',
      lines: SKINCARE.evening.steps.concat([SKINCARE.evening.note])
    };
  }
  if (period === 'afternoon') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 下午补一下',
      sub: '',
      lines: ['太阳还在的话，帽子、伞、口罩别落下，物理遮挡最省事。', '脸干了就薄涂一点保湿修护，别用手一直摸。']
    };
  }
  if (period === 'bedtime' || period === 'sleep') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 睡前一步',
      sub: '',
      lines: ['嘴唇干就补一层润唇，其他都留给明天早上。']
    };
  }
  return null;
}

/* --------------------- 温差健康提醒（天气拿不到时兜底） --------------------- */

function healthModule(day) {
  const tips = HEALTH.pick(dayIndex(day));
  return {
    id: 'health',
    type: 'text',
    icon: '🧣',
    title: '温差 · 身体小提醒',
    sub: '只看身体舒不舒服，不谈穿什么',
    lines: tips.concat([SKINCARE.extra])
  };
}

/* ------------------------- 打卡 ------------------------- */

function checkinModule(day, mode) {
  const items = store.checkinList(day);
  const doneCount = items.filter(function (i) {
    return i.done;
  }).length;
  const water = store.waterCount(day);

  if (mode === 'review') {
    return {
      id: 'review',
      type: 'checklist',
      icon: '📮',
      title: '今天的小成绩',
      sub: '喝水 ' + water + '/3 杯 · 打卡 ' + doneCount + '/' + items.length + ' 项',
      lines: water >= 3 ? ['3杯喝满了，小金毛尾巴摇成小风扇，夸夸你！'] : ['还差 ' + (3 - water) + ' 杯，明天小猪接着陪你喝。'],
      items: items
    };
  }

  return {
    id: 'checkin',
    type: 'checklist',
    icon: '📌',
    title: '今日小习惯',
    sub: '先催前两条：喝水3杯、吃饭按时',
    lines: ['做完一项点一下，小金毛就摇一次尾巴。'],
    items: items
  };
}

/* ------------------------- 小日子 ------------------------- */

function cycleModule(ctx) {
  if (!ctx.cycle) {
    const askDay = store.get(store.K.cycleAsk, '');
    const askedToday = askDay === ctx.today;
    if (!askedToday) store.set(store.K.cycleAsk, ctx.today);

    return {
      id: 'cycle',
      type: 'text',
      icon: '🌷',
      title: '小日子 · 小猪想帮你记着',
      sub: '',
      lines: askedToday ? ['小猪就等你一句话啦，方便的时候说～'] : [cycleUtil.ASK_TEXT],
      cta: { text: '小猪记一下', url: '/pages/cycle/cycle', tab: true }
    };
  }

  const c = ctx.cycle;
  return {
    id: 'cycle',
    type: 'text',
    icon: '🌷',
    title: '小日子 · ' + c.headline,
    sub: '',
    lines: c.lines.slice(0, 2),
    cta: { text: '看看我的小日子', url: '/pages/cycle/cycle', tab: true }
  };
}

/* ------------------------- 备忘录 ------------------------- */

function memoModule() {
  const list = store.getMemos();
  const left = list.filter(function (m) {
    return !m.done;
  });
  return {
    id: 'memo',
    type: 'text',
    icon: '📝',
    title: '备忘录',
    sub: left.length ? '还有 ' + left.length + ' 条没勾掉' : '想写点什么都行',
    lines: left.length
      ? left.slice(0, 2).map(function (m) {
          return '· ' + m.text;
        })
      : ['明天要带的东西、要问老师的事，都可以先记进去。'],
    cta: { text: '去写备忘录', url: '/pages/memo/memo', tab: true }
  };
}

/* --------------------- 晚安包 / 睡前 --------------------- */

function bedtimeModules(ctx, now) {
  const story = storyUtil.current(ctx.today);
  const t = schedule.tomorrow(now || new Date());
  const tomorrowLine = !t.known
    ? '明天' + t.name + '课表还没填，先照常早点睡，作息别乱。'
    : t.first === '08:00'
      ? '明天' + t.name + '早八，今晚更得早点睡，故事讲完就放下手机。'
      : t.first === '10:00'
        ? '明天' + t.name + '早十，可以多睡一会儿，但别熬夜。'
        : '明天' + t.name + '上午没早课，还是照常早点睡，作息别乱。';

  return [
    checkinModule(ctx.today, 'review'),
    {
      id: 'tomorrow',
      type: 'text',
      icon: '🌤',
      title: '明天的计划',
      sub: '',
      lines: [
        tomorrowLine,
        '3杯温水：上午1杯 / 午后1杯 / 晚间1杯，睡前只抿两口。',
        '三餐在食堂按时吃，温热、七分饱，少冰、少重油重辣。'
      ]
    },
    {
      id: 'story',
      type: 'story',
      icon: '🌙',
      title: '睡前小故事',
      sub: '',
      story: story,
      lines: ['讲完就放下手机，23:30前睡，梦里有小猪和小金毛。'],
      nn: '晚安豆豆大王'
    },
    memoModule(),
    cycleModule(ctx)
  ].filter(Boolean);
}

function lateModules(ctx) {
  const t = schedule.tomorrow(new Date());
  return [
    waterModule(ctx.period, ctx.today, ctx.water),
    skincareModule(ctx.period),
    {
      id: 'sleep-push',
      type: 'text',
      icon: '⏰',
      title: '收工啦',
      sub: '',
      lines: [
        '23:00 小猪讲故事，23:30 前放下手机。',
        t.known && t.first === '08:00' ? '明天早八，今晚就别熬了。' : '明天也早点歇着，作息别往后拖。',
        '今天已经很棒了，剩下的明天再弄。'
      ]
    },
    checkinModule(ctx.today, 'review'),
    memoModule(),
    cycleModule(ctx)
  ].filter(Boolean);
}

function build(ctx) {
  const p = ctx.period;
  const now = ctx.now || new Date();
  let mods = [];

  if (p === 'morning') {
    mods = [
      waterModule(p, ctx.today, ctx.water),
      scheduleModule(now),
      mealModule(p, now),
      weatherModule(ctx),
      skincareModule(p),
      checkinModule(ctx.today, 'today')
    ];
  } else if (p === 'noon') {
    mods = [mealModule(p, now), waterModule(p, ctx.today, ctx.water), scheduleModule(now), cycleModule(ctx)];
  } else if (p === 'afternoon') {
    mods = [
      waterModule(p, ctx.today, ctx.water),
      mealModule(p, now),
      qinModule(p, now),
      weatherModule(ctx),
      cycleModule(ctx)
    ];
  } else if (p === 'evening') {
    mods = [
      waterModule(p, ctx.today, ctx.water),
      mealModule(p, now),
      skincareModule(p),
      qinModule(p, now),
      checkinModule(ctx.today, 'today'),
      cycleModule(ctx)
    ];
  } else if (p === 'late') {
    mods = lateModules(ctx);
  } else if (p === 'bedtime') {
    mods = bedtimeModules(ctx, now);
  } else if (p === 'sleep') {
    mods = [
      {
        id: 'sleep',
        type: 'text',
        icon: '🌛',
        title: '该睡了，豆豆大王',
        sub: '',
        lines: ['已经过 23:30 啦，先放下手机。', '小猪和小金毛在梦里等你，明天继续来盯你。']
      }
    ];
  } else {
    mods = [
      {
        id: 'deepnight',
        type: 'text',
        icon: '🌜',
        title: '这么晚还没睡呀',
        sub: '',
        lines: ['小猪不说话，就趴在你旁边陪着。', '手机放远一点，闭上眼，明天再说。']
      }
    ];
  }

  return mods.filter(Boolean);
}

export {
  build,
  greeting,
  waterModule,
  mealModule,
  weatherModule,
  scheduleModule,
  qinModule,
  skincareModule,
  healthModule,
  checkinModule,
  cycleModule,
  memoModule,
  dayIndex
};

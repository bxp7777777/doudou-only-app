import * as store from './store.js';
import * as cycleUtil from './cycle.js';
import * as storyUtil from './story.js';
import * as schedule from './schedule.js';
import SKINCARE from './skincare.js';
import * as HEALTH from './health.js';

const GREETING = {
  morning: ['豆豆大王，早上好呀', '豆豆大王，醒啦，新的一天慢慢来', '早安豆豆大王，今天也轻松一点开始', '早上好呀，小猪小金毛在这儿陪你', '醒过来先笑一个，今天顺一点'],
  noon: ['豆豆大王，午安', '豆豆大王，中午好呀', '午安豆豆大王，先歇口气再忙', '中午好，吃口热的补补精神'],
  afternoon: ['豆豆大王，下午好', '豆豆大王，下午好呀', '下午啦，困了就起身动一动', '午后好，温水别忘抿一口'],
  evening: ['豆豆大王，晚上好', '豆豆大王，晚上好呀', '晚上好，忙了一天先松口气', '傍晚好，慢慢收个尾就好'],
  late: ['豆豆大王，该收工啦', '豆豆大王，差不多收尾啦', '今天辛苦啦，慢慢收个尾', '不着急，把手头的事存好就歇'],
  bedtime: ['豆豆大王，故事时间到', '豆豆大王，来看今天的小故事吧', '故事时间，和两只小家伙轻松一会儿', '今天的小故事和笑话在等你'],
  deepnight: ['豆豆大王，这么晚还没睡呀', '豆豆大王，夜深啦，先让自己静下来', '这么晚啦，小猪就在旁边陪着', '别熬太狠，先让眼睛歇一歇'],
  sleep: ['豆豆大王，该歇着啦', '豆豆大王，慢慢准备休息吧', '该歇啦，把手机放远一点', '放松下来，好好歇一觉']
};

const CUP_HEADS = {
  morning: ['上午这一杯', '起床后的第一杯', '早自习先来一口', '早晨慢慢润一杯'],
  noon: ['午间也来一口', '饭前先抿两口温水', '午后补一杯', '午饭前后喝两口'],
  afternoon: ['午后这一杯', '犯困时来一口', '下午慢慢补一杯', '课间喝两口温水'],
  evening: ['晚间这一杯', '晚饭前后润一口', '傍晚再来一杯', '收工前补一杯'],
  late: ['睡前只抿两口', '夜里口干抿一小口'],
  bedtime: ['睡前只抿两口', '润润喉咙就好']
};

function rot(arr, seed) {
  if (!arr || !arr.length) return '';
  return arr[(((seed % arr.length) + arr.length) % arr.length)];
}

function dayIndex(key) {
  const parts = String(key || '').split('-');
  return Math.floor(new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime() / 86400000);
}

function greeting(period, seed) {
  const arr = GREETING[period] || GREETING.morning;
  if (seed === undefined || seed === null) return arr[0];
  return rot(arr, seed);
}

/* ------------------------- 1. 喝水 ------------------------- */

function waterModule(period, day, water, weather) {
  const cups = water && water.cups ? water.cups : [false, false, false];
  const done = cups.filter(Boolean).length;
  const seed = Number(dayIndex(day)) || 0;
  let lines = [];

  if (done >= 3) {
    lines = [
      rot([
        '3杯全搞定啦！小金毛尾巴摇成小风扇，夸夸你！',
        '今天的水量很棒，人也会跟着轻快，继续保持就好。',
        '喝够啦，想喝就小口抿一点，别一口气灌。',
        '三杯打卡完成，小猪悄悄把水杯又添满了。'
      ], seed),
      rot([
        '还想喝就小口抿一点，别灌。',
        '温水慢慢喝，身体会记得这份舒服。',
        '多出来的那口慢慢抿，不追求喝完一整杯。'
      ], seed + 1)
    ];
  } else if (period === 'late' || period === 'bedtime') {
    lines = [
      rot([
        '睡前这杯只抿两口润润嘴，喝多了夜里要起夜。',
        '夜里口干就抿一小口温水，别一大杯灌下去。',
        '临睡前别喝太猛，润一润就好，安安稳稳睡。'
      ], seed),
      '今天已经喝了 ' + done + '/3 杯，剩下的明天小猪接着陪。'
    ];
  } else {
    const head = rot(CUP_HEADS[period] || ['这一杯'], seed);
    lines = [head + '，小口慢喝、别加冰，别一口闷。'];
    if (done === 0) lines.push(rot([
      '先喝半杯就好，小猪已经把温水端过来了。',
      '还没开始也不急，先倒一杯放手边，想起来就喝一口。',
      '第一杯最关键，慢慢喝，不用有压力。'
    ], seed));
    if (done === 1) lines.push(rot([
      '已经1杯啦，还差2杯，小猪陪你慢慢喝。',
      '进度三分之一啦，下午记得再补一口温水。'
    ], seed + 1));
    if (done === 2) lines.push(rot([
      '就差最后一杯，小猪陪你一起喝掉它。',
      '只差临门一脚，把最后一杯喝完就达标啦。'
    ], seed + 2));
  }

  // 按南宁当天天气追加补水建议，不影响杯子计数结构
  const nn = (Array.isArray(weather) ? weather : []).filter(function (c) {
    return c && c.key === 'nanning';
  })[0] || null;
  if (nn) {
    const wl = [];
    if (nn.temp !== null && nn.temp !== undefined && nn.temp >= 30) {
      wl.push('南宁今天约' + nn.temp + '度偏热，温水少量多次补，别等口渴才喝。');
    }
    if (nn.humidity !== null && nn.humidity !== undefined && nn.humidity <= 40) {
      wl.push('南宁空气偏干（湿度' + nn.humidity + '%），白天多抿两口温水、润润嘴唇。');
    }
    if (nn.rain !== null && nn.rain !== undefined && nn.rain >= 50) {
      wl.push('南宁可能下雨（' + nn.rain + '%），在屋里也记得按时喝水。');
    }
    if (nn.diff !== null && nn.diff !== undefined && nn.diff >= 8) {
      wl.push('南宁昼夜差' + nn.diff + '度，温水随时抿两口，护好肚子别着凉。');
    }
    wl.slice(0, 2).forEach(function (x) { lines.push(x); });
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
  const d = now || new Date();
  const s = schedule.of(d);
  const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
  const M = {
    morning: {
      title: '吃饭 · 早餐',
      sub: '在学校食堂吃，别空着肚子去上课',
      lines: [
        '去食堂吃早饭，热的、七分饱，别省。',
        s.first === '08:00'
          ? '今天早八，先吃再出门；来不及就带一份能拿在手上的热乎的。'
          : '今天不早八，可以慢慢吃，吃完再晃过去。',
        rot([
          '别用冰饮开胃，配温水更舒服。',
          '早餐来一口主食垫肚子，上午不容易发慌。',
          '哪怕只买个热乎的包子豆浆，也比空着肚子强。'
        ], seed)
      ]
    },
    noon: {
      title: '吃饭 · 午餐',
      sub: '错峰去食堂，不用挤',
      lines: [
        '去食堂打热的菜，一荤一素，七分饱。',
        rot([
          '吃完饭慢慢走两分钟，别马上趴桌睡。',
          '饭后别立刻瘫着，站一站、走两步更舒服。'
        ], seed + 1),
        rot([
          '少冷饮，少重油重辣。',
          '今天也记得配口热汤或温水，别只用冰的下饭。',
          '七分饱就停筷子，下午不容易犯困。'
        ], seed)
      ]
    },
    afternoon: {
      title: '吃饭 · 下午垫一口（可选）',
      sub: '饿就吃一点，别硬撑到晚饭',
      lines: [
        rot([
          '饿了就在食堂或小卖部垫一小份温的，别用零食顶一顿。',
          '下午有点饿，选个温热的小份点心垫一下就好。'
        ], seed),
        rot([
          '不饿也别硬塞，等晚饭好好吃。',
          '不饿就多喝两口温水，别边忙边无意识地吃。'
        ], seed + 1)
      ]
    },
    evening: {
      title: '吃饭 · 晚餐',
      sub: '再忙也坐下把饭吃完',
      lines: [
        '晚饭七分饱，热的菜多打一点。',
        rot([
          '吃完走两圈，别直接回宿舍躺。',
          '晚饭别拖到太晚，也别只拿零食凑合。'
        ], seed),
        rot([
          '少冰、少重油重辣。',
          '晚饭吃舒服点，肠胃不闹脾气，夜里才睡得香。'
        ], seed + 1)
      ]
    },
    late: {
      title: '别再加餐啦',
      sub: '',
      lines: [
        rot([
          '这会儿不饿就别吃了，最多抿两口温水。',
          '睡前别再找东西吃啦，胃也要歇一歇。'
        ], seed),
        rot([
          '胃也要睡觉，留着明天好好吃早饭。',
          '真饿到睡不着，就抿一小口温水，别开零食袋。'
        ], seed + 1)
      ]
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

function skincareModule(period, weather) {
  const nn = (Array.isArray(weather) ? weather : []).filter(function (c) {
    return c && c.key === 'nanning';
  })[0] || null;
  const extra = [];
  if (nn) {
    if (nn.humidity !== null && nn.humidity !== undefined && nn.humidity <= 40) {
      extra.push('空气偏干：保湿和润唇少量多次补，别让脸和手绷着。');
    }
    if (nn.temp !== null && nn.temp !== undefined && nn.temp >= 30) {
      extra.push('天气偏热：出汗及时温和清洁、擦干，防晒优先帽子和伞。');
    }
    if (nn.rain !== null && nn.rain !== undefined && nn.rain >= 50) {
      extra.push('阴雨天湿度大：护肤从简、少叠层，保持清爽不闷。');
    }
    if (nn.humidity !== null && nn.humidity !== undefined && nn.humidity >= 80) {
      extra.push('湿度偏高：洁面后薄涂一层就好，别叠太多层。');
    }
  }
  const skinExtra = extra.slice(0, 2);

  if (period === 'morning') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.morning.title,
      sub: '敏感肌越简单越稳',
      lines: SKINCARE.morning.steps.concat([SKINCARE.morning.note]).concat(skinExtra)
    };
  }
  if (period === 'evening' || period === 'late') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.evening.title,
      sub: '不刷酸、不去角质、不上猛药',
      lines: SKINCARE.evening.steps.concat([SKINCARE.evening.note]).concat(skinExtra)
    };
  }
  if (period === 'afternoon') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 下午补一下',
      sub: '',
      lines: ['太阳还在的话，帽子、伞、口罩别落下，物理遮挡最省事。', '脸干了就薄涂一点保湿修护，别用手一直摸。'].concat(skinExtra)
    };
  }
  if (period === 'bedtime' || period === 'sleep') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 睡前一步',
      sub: '',
      lines: ['嘴唇干就补一层润唇，其他都留给明天早上。'].concat(skinExtra)
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

  let todayLines = ['做完一项点一下，小金毛就摇一次尾巴。'];
  if (items.length && doneCount === items.length) {
    todayLines.push('今天的小习惯全部打勾啦，小猪记一笔大大的表扬！');
  } else if (doneCount > 0) {
    todayLines.push(`已完成 ${doneCount} 项，不着急，慢慢来就好。`);
  }

  return {
    id: 'checkin',
    type: 'checklist',
    icon: '📌',
    title: '今日小习惯',
    sub: '先催前两条：喝水3杯、吃饭按时',
    lines: todayLines,
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
    ? '明天' + t.name + '课表还没填，先按自己舒服的节奏安排就好。'
    : t.first === '08:00'
      ? '明天' + t.name + '早八，今晚早点收个尾，看完小故事让自己轻松一下。'
      : t.first === '10:00'
        ? '明天' + t.name + '早十，可以从容一点，把状态调整舒服。'
        : '明天' + t.name + '上午没早课，也按自己的节奏慢慢来，保持好心情。';

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
      icon: '☀️',
      title: '每日小故事',
      sub: '',
      story: story,
      lines: ['看完今天这篇，把小开心收好，明天还有新的小故事和笑话等着你。']
    },
    memoModule(),
    cycleModule(ctx)
  ].filter(Boolean);
}

function lateModules(ctx) {
  const t = schedule.tomorrow(new Date());
  return [
    waterModule(ctx.period, ctx.today, ctx.water, ctx.weather),
    skincareModule(ctx.period, ctx.weather),
    {
      id: 'sleep-push',
      type: 'text',
      icon: '⏰',
      title: '收工啦',
      sub: '',
      lines: [
        '想看小故事就点开今天这一篇，和小猪小金毛一起松快一会儿。',
        t.known && t.first === '08:00' ? '明天早八，今晚从容收尾就好。' : '明天也按舒服节奏来，别把状态拖得太累。',
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
      waterModule(p, ctx.today, ctx.water, ctx.weather),
      scheduleModule(now),
      mealModule(p, now),
      skincareModule(p, ctx.weather),
      checkinModule(ctx.today, 'today')
    ];
  } else if (p === 'noon') {
    mods = [mealModule(p, now), waterModule(p, ctx.today, ctx.water, ctx.weather), scheduleModule(now), cycleModule(ctx)];
  } else if (p === 'afternoon') {
    mods = [
      waterModule(p, ctx.today, ctx.water, ctx.weather),
      mealModule(p, now),
      qinModule(p, now),
      cycleModule(ctx)
    ];
  } else if (p === 'evening') {
    mods = [
      waterModule(p, ctx.today, ctx.water, ctx.weather),
      mealModule(p, now),
      skincareModule(p, ctx.weather),
      qinModule(p, now),
      checkinModule(ctx.today, 'today'),
      cycleModule(ctx)
    ];
  } else if (p === 'late') {
    mods = lateModules(ctx);
  } else if (p === 'bedtime') {
    mods = bedtimeModules(ctx, now);
  } else if (p === 'sleep') {
    const sk = dayIndex(ctx.today);
    mods = [
      {
        id: 'sleep',
        type: 'text',
        icon: '🌛',
        title: '慢慢歇下来，豆豆大王',
        sub: '不赶时间，先放松',
        lines: [
          rot([
            '把今天没做完的事先搁到明天，现在只负责让自己舒服。',
            '灯光调柔、手机放远，做几次长长的呼吸。',
            '肩膀提一提再松开，把白天的紧绷一点点卸掉。',
            '窝进软和的位置，回想一件今天的小开心事。',
            '手脚捂暖一点，整个人慢慢就松下来。'
          ], sk),
          rot([
            '小猪和小金毛在旁边安静陪着，一点也不催你。',
            '放松躺着也是休息，不用逼自己立刻睡着。',
            '脑子里的事说一句“明天再想”，先歇着。',
            '呼吸慢慢放匀，让身边的安静裹住自己。',
            '今天已经很棒了，剩下的交给明天。'
          ], sk + 1)
        ]
      }
    ];
  } else {
    const sk = dayIndex(ctx.today);
    mods = [
      {
        id: 'deepnight',
        type: 'text',
        icon: '🌜',
        title: '这么晚啦，慢慢安静下来',
        sub: '小猪就在旁边陪着',
        lines: [
          rot([
            '小猪不说话，就趴在你旁边陪着，不催也不劝。',
            '手机先放远一点，让眼睛和脑子歇一歇。',
            '累了就躺下，盖好软和的被子，别硬撑着刷。',
            '做几次深呼吸，把肩膀和眉头松开来。',
            '没做完的事记在备忘录里，明天再处理。'
          ], sk),
          rot([
            '身边安安静静的，两只小家伙陪着你。',
            '不用着急立刻有困意，放松躺着就好。',
            '灯光调暗一些，节奏自然会慢下来。',
            '回想一点温暖的小细节，心也跟着软下来。',
            '今天辛苦了，先把自己照顾舒服最重要。'
          ], sk + 1)
        ]
      }
    ];
  }

  // 天气卡常驻首页第一张：南宁（学校）+ 深圳（家里）随时能看一眼，不分时段
  return [weatherModule(ctx)].concat(mods).filter(Boolean);
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

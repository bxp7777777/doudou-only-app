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
  morning: ['上午这一杯', '起床后的第一杯', '早自习先来一口', '早晨慢慢润一杯', '刷完牙之后这一杯', '出门前补半杯'],
  noon: ['午间也来一口', '饭前先抿两口温水', '午后补一杯', '午饭前后喝两口', '吃完饭这一杯', '回教室路上这一杯'],
  afternoon: ['午后这一杯', '犯困时来一口', '下午慢慢补一杯', '课间喝两口温水', '趴在桌上之前这一杯', '练琴前先润一口'],
  evening: ['晚间这一杯', '晚饭前后润一口', '傍晚再来一杯', '收工前补一杯', '洗澡前这一杯', '坐下歇的时候这一杯'],
  late: ['睡前只抿两口', '夜里口干抿一小口', '这会儿润个嘴就好', '临睡前这一小口'],
  bedtime: ['睡前只抿两口', '润润喉咙就好', '躺下之前抿一口', '别喝完再躺']
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
  let line = (seed === undefined || seed === null) ? arr[0] : rot(arr, seed);
  // 标题保留原有的味道，只去掉尾句里多余的「好」：
  //「傍晚好，慢慢收个尾就好」→「傍晚好，慢慢收个尾」
  const parts = line.split('，');
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (/就好$/.test(last)) parts[parts.length - 1] = last.replace(/就好$/, '').trim();
    else if (/好呀$/.test(last)) parts[parts.length - 1] = last.replace(/呀$/, '');
    else if (/^(好呀|好哦|好呢)$/.test(last)) parts.pop();
    line = parts.filter(Boolean).join('，');
  }
  return /豆豆大王|早安/.test(line) ? line : '豆豆大王，' + line;
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
        '三杯打卡完成，小猪悄悄把水杯又添满了。',
        '3杯满了，嘴唇不干、嗓子也舒服，这份状态留到明天。',
        '水喝够了，头也没那么沉，做事都顺手一点。',
        '今天的杯子都亮灯啦，小猪给你记一笔大大的好。',
        '三杯稳稳喝下来，这才是最省事的自我照顾。'
      ], seed),
      rot([
        '还想喝就小口抿一点，别灌。',
        '温水慢慢喝，身体会记得这份舒服。',
        '多出来的那口慢慢抿，不追求喝完一整杯。',
        '后面渴了再补，别为了凑数硬喝。',
        '喝够了就停，撑着一肚子水也不舒服。',
        '杯子放回桌角，想起来再抿一口就好。'
      ], seed + 1)
    ];
  } else if (period === 'late' || period === 'bedtime') {
    lines = [
      rot([
        '睡前这杯只抿两口润润嘴，喝多了夜里要起夜。',
        '夜里口干就抿一小口温水，别一大杯灌下去。',
        '临睡前别喝太猛，润一润就好，安安稳稳睡。',
        '这会儿喝水只求嘴里不干，别贪那半杯。',
        '躺下前把杯子放远一点，省得半夜想喝又不敢喝。',
        '要是觉着嘴干，先抿一口再慢慢咽，别一口闷。'
      ], seed),
      '今天已经喝了 ' + done + '/3 杯，剩下的明天小猪接着陪。'
    ];
  } else {
    const head = rot(CUP_HEADS[period] || ['这一杯'], seed);
    lines = [head + '，小口慢喝、别加冰，别一口闷。'];
    if (done === 0) lines.push(rot([
      '先喝半杯就好，小猪已经把温水端过来了。',
      '还没开始也不急，先倒一杯放手边，想起来就喝一口。',
      '第一杯最关键，慢慢喝，不用有压力。',
      '一整天还没动杯子，先喝两口润润喉咙再忙。',
      '先去接杯温水，坐下来喝两口，比一直干着嘴强。',
      '今天的第一杯不用多，半杯就够开个头。'
    ], seed));
    if (done === 1) lines.push(rot([
      '已经1杯啦，还差2杯，小猪陪你慢慢喝。',
      '进度三分之一啦，下午记得再补一口温水。',
      '一杯下肚，嗓子舒服多了，下一杯隔一会儿再补。',
      '一杯到手，别等口渴了才想起第二杯。',
      '喝了1杯，杯子里留一点，路过就抿两口。'
    ], seed + 1));
    if (done === 2) lines.push(rot([
      '就差最后一杯，小猪陪你一起喝掉它。',
      '只差临门一脚，把最后一杯喝完就达标啦。',
      '两杯了，最后这杯慢点喝，别一下灌完。',
      '就差一口杯的事，想起来顺手喝掉就好。',
      '两杯在手，最后一杯分成几口喝完更舒服。'
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
          '早餐来点热乎的垫肚子，上午不容易发慌。',
          '哪怕只买个热乎的带在手上，也比空着肚子强。',
          '食堂人多就早点去，别为了排队干脆不吃。',
          '早饭吃到七分饱，留点余地，上课不犯困。',
          '起来先喝半杯温水，再去吃早饭，肠胃会舒服些。',
          '赶时间也别边走边吃，找个位置坐下吃两口。'
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
          '饭后别立刻瘫着，站一站、走两步更舒服。',
          '吃完先坐着缓一缓，再起身去自习。',
          '饭后想睡就靠一会儿，别直接趴桌上压着胃。',
          '吃完把碗筷归位，顺手走两步，人反而清醒。'
        ], seed + 1),
        rot([
          '少冷饮，少重油重辣。',
          '今天也记得配口热汤或温水，别只用冰的下饭。',
          '七分饱就停筷子，下午不容易犯困。',
          '打菜挑热的、看着清爽的，胃会舒服很多。',
          '辣的就少量尝一点，别拿它当主菜。',
          '一边看手机一边吃容易吃多，先放下再看。'
        ], seed)
      ]
    },
    afternoon: {
      title: '吃饭 · 下午垫一口（可选）',
      sub: '饿就吃一点，别硬撑到晚饭',
      lines: [
        rot([
          '饿了就在食堂或小卖部垫一小份温的，别用零食顶一顿。',
          '下午有点饿，选个温热的小份点心垫一下就好。',
          '饿到心慌就先吃点东西，别硬撑到晚饭。',
          '课间饿就垫一口，量不用多，别把晚饭吃掉。',
          '嘴馋的时候先喝两口水，常常就不那么想吃了。'
        ], seed),
        rot([
          '不饿也别硬塞，等晚饭好好吃。',
          '不饿就多喝两口温水，别边忙边无意识地吃。',
          '这会儿不饿就略过，晚饭再好好吃一顿热的。',
          '想拿零食当消遣时，先起来走两步再决定。',
          '下午犯困未必是饿，先喝口水、动一动看。'
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
          '晚饭别拖到太晚，也别只拿零食凑合。',
          '饭点过了也别将就，热的吃一口比空着强。',
          '吃完把桌面收拾一下，顺手活动两分钟。',
          '晚饭慢慢吃，别一边赶作业一边往嘴里塞。'
        ], seed),
        rot([
          '少冰、少重油重辣。',
          '晚饭吃舒服点，肠胃不闹脾气，夜里才睡得香。',
          '菜的份量按胃口来，吃完不撑是最舒服的量。',
          '热菜配热汤，比冰饮下饭舒服得多。',
          '吃到七分饱就停，夜里不容易反酸。',
          '饭后别马上喝一大杯冰的，缓一缓再说。'
        ], seed + 1)
      ]
    },
    late: {
      title: '别再加餐啦',
      sub: '',
      lines: [
        rot([
          '这会儿不饿就别吃了，最多抿两口温水。',
          '睡前别再找东西吃啦，胃也要歇一歇。',
          '夜里的饿常常是一阵，喝两口温水等一等就过去了。',
          '真想吃先刷牙，刷完往往就不想再动嘴了。',
          '今天吃得够不够，回想一下再决定要不要加餐。'
        ], seed),
        rot([
          '胃也要睡觉，留着明天好好吃早饭。',
          '真饿到睡不着，就抿一小口温水，别开零食袋。',
          '想开零食袋的时候先坐五分钟，多数时候就过去了。',
          '半夜吃多了夜里容易反酸，明天早上也不舒服。',
          '实在胃里空得难受，喝点温水垫着，别吃硬的。'
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
  let lines = [];

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
    // 先说要紧的（温差、要不要带伞），其余提示排在后面，最多留四条，别把卡片撑成一堵字墙
    list.forEach(function (c) {
      if (c.rain !== null && c.rain !== undefined && c.rain >= 50) {
        lines.push(c.name + '可能下雨（降水概率 ' + c.rain + '%），伞放进包里。');
      } else if (c.rain !== null && c.rain !== undefined && c.rain >= 30) {
        lines.push(c.name + '有点可能下阵雨（' + c.rain + '%），出门顺手把伞塞包里。');
      }
    });

    if (nn && nn.humidity >= 80) lines.push('湿度偏高，出汗及时擦干，别对着风口吹。');
    if (nn && nn.humidity !== null && nn.humidity <= 40) lines.push('有点干：护手霜、润唇带上，少量多次补水。');
    if (nn && nn.temp !== null && nn.temp !== undefined && nn.temp >= 32) {
      lines.push('南宁今天偏热，正午那阵尽量待在阴凉处，回来先喝两口温水。');
    }
    if (nn && String(nn.text || '').includes('晴')) {
      lines.push('出太阳了：晒的时候走阴凉那边，帽子和伞顺手带上。');
    }
    if (nn && nn.rain !== null && nn.rain !== undefined && nn.rain >= 80) {
      lines.push('南宁降水概率很高，鞋袜备一双干的，别湿着坐一下午。');
    }

    // 两座城市差得多，来回跑的时候身体最容易不舒服
    const szCity = list.filter(function (c) {
      return c && c.key === 'shenzhen';
    })[0];
    if (nn && szCity && nn.temp !== null && nn.temp !== undefined && szCity.temp !== null && szCity.temp !== undefined) {
      const cityGap = Math.abs(Number(nn.temp) - Number(szCity.temp));
      if (cityGap >= 4) {
        lines.push('南宁和深圳差 ' + cityGap + ' 度，两头跑的时候慢慢适应当地的温度，别一落地就灌冰的。');
      }
    }

    if (lines.length > 4) lines = lines.slice(0, 4);
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

/* -------------- 期末周（2026-12-28 ~ 2027-01-03） ------------- */

const EXAM = {
  start: '2026-12-28',
  end: '2027-01-03',
  /* 考前 7 天 */
  before: [
    '把复习切成每天一块，写完打个勾，比一口气啃一整天省力。',
    '熬夜补不回状态：今天十一点半前躺下，第二天记得反而更牢。',
    '复习一小时就起身走两分钟，腰和眼睛都会谢谢你。',
    '考前一晚别再开新章节，翻一遍错题、把笔装好就够。',
    '书桌收拾干净，水杯放手边，坐下来就能直接开始。',
    '这几天饭要按时吃，别拿零食顶着复习。'
  ],
  /* 考试周内 */
  during: [
    '进考场前先吃口热的，别空着肚子硬撑一上午。',
    '证件、笔、水杯睡前就装进包里，早上能少慌一件。',
    '考完这一科先别急着对答案，把脑子腾给下一科。',
    '中场歇的时候喝口温水、站一会儿，别一直低头盯书。',
    '午休能睡二十分钟就睡，睡过头反而更昏。',
    '手写多了手腕会僵，进考场前转两圈、捏一捏。'
  ],
  after: [
    '考完了，先把这一觉补回来，别的明天再说。',
    '不管考得怎么样，这几天你已经很用力了，夸夸自己。',
    '别急着复盘分数，先把落下的饭和睡眠补上。'
  ]
};

function dateDiffKey(aKey, bKey) {
  const a = new Date(String(aKey) + 'T00:00:00');
  const b = new Date(String(bKey) + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function examModule(ctx) {
  const today = ctx.today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return null;

  const toStart = dateDiffKey(today, EXAM.start); // 正数＝还有几天
  const toEnd = dateDiffKey(today, EXAM.end); // 负数＝已结束几天
  const seed = Number(dayIndex(today)) || 0;

  // 考前一周开始提醒，结束后留两天收个尾，其余时间不出现
  if (toStart > 7 || toEnd < -2) return null;

  let title = '';
  let sub = '';
  let lines = [];

  if (toStart > 0) {
    title = '期末周 · 还有 ' + toStart + ' 天';
    sub = '把复习切成小块，一天一块';
    lines = [rot(EXAM.before, seed), rot(EXAM.before, seed + 2)];
  } else if (toEnd >= 0) {
    const examDay = 1 - toStart;
    title = '期末周 · 第 ' + examDay + ' 天';
    sub = '考完一科放下一科';
    lines = [rot(EXAM.during, seed), rot(EXAM.during, seed + 1)];
    if (toEnd === 0) lines.push('今天就全部考完了，回去好好睡一觉。');
  } else {
    title = '考完啦';
    sub = '先把状态补回来';
    lines = EXAM.after.slice(0, 2);
  }

  return {
    id: 'exam',
    type: 'text',
    icon: '📝',
    title: title,
    sub: sub,
    lines: lines
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

/* 练琴拆成「练前 / 练中 / 练后 / 护手」四组轮换：每天只说同一句，她会看腻 */
const QIN = {
  before: [
    '练前洗手擦干，琴放稳了再坐下。',
    '先把谱子摊开，翻到今天要练的那一页，别一坐下就到处找。',
    '先调好音，耳朵定下来，手也会跟着稳。',
    '松香、肩托、调音器摆到手边，练起来才不打断。',
    '先弹两分钟空弦，让手和琴都对上。',
    '练前松一松手腕，慢慢热起来再上手。'
  ],
  during: [
    '慢练比硬练有用：一小段一小段过，弹顺了再连起来。',
    '卡住的地方慢一半再弹，别硬冲过去。',
    '难的四个小节单独抠三遍，比整首过五遍有用。',
    '每练二十分钟歇一歇，甩甩手、看看远处。',
    '录一段下来听听，比一直弹更容易发现哪里不对。',
    '手开始发酸就停一停，酸着练只会越来越僵。'
  ],
  after: [
    '练完检查好东西：琴谱、弓、松香、调音器、水杯、钥匙，一样样收进琴盒和包里。',
    '练完把弓毛松一松，琴擦一遍再合盖，别带着松香灰过夜。',
    '练完别马上用冷水洗手，温水冲一冲，再涂层护手霜。',
    '收琴前看一眼肩托和小件，别落在琴房。',
    '练完坐两分钟再起身，手别一松就去拎重东西。',
    '谱子夹回原位、琴盒扣好，下次打开就能接着练。',
    '走出琴房前摸一遍：手机、门卡、水杯，别到了楼下才折回去。'
  ],
  hand: [
    '指甲修短一点，按弦才不顶手指。',
    '护手霜薄涂一层就够，涂太厚手会滑。',
    '手腕酸就轻轻转两圈，别用力掰。',
    '洗过手擦干再碰琴，别用冷水泡手。',
    '手凉的时候先捂暖，冷手按弦容易僵。'
  ]
};

function qinModule(period, now) {
  const d = now || new Date();
  const s = schedule.of(d);
  const seed = Math.floor(d.getTime() / 86400000);
  let lines = [];

  if (period === 'afternoon') {
    lines = [
      s.wd === 2 ? '下午很空，正好练30分钟。' : '有空档就练30分钟，慢练比硬练有用。',
      rot(QIN.before, seed),
      rot(QIN.during, seed + 1),
      rot(QIN.after, seed + 2)
    ];
  } else if (period === 'evening') {
    lines = [
      '今天练琴了吗？练完别马上冲凉水。',
      rot(QIN.after, seed + 3),
      rot(QIN.hand, seed + 4)
    ];
  } else {
    lines = [rot(QIN.before, seed + 1), rot(QIN.hand, seed + 2)];
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
  const skinSeed = Math.floor(Date.now() / 86400000);
  const dailySkin = SKINCARE.daily && SKINCARE.daily.length ? rot(SKINCARE.daily, skinSeed) : '';
  const dayTips = [dailySkin, rot(SKINCARE.extras || [], skinSeed + 1)].filter(Boolean);
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
  const skinExtra = extra.slice(0, 1);

  if (period === 'morning') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.morning.title,
      sub: '敏感肌越简单越稳',
      lines: SKINCARE.morning.steps.concat([SKINCARE.morning.note]).concat(dayTips).concat(skinExtra)
    };
  }
  if (period === 'evening' || period === 'late') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: SKINCARE.evening.title,
      sub: '不刷酸、不去角质、不上猛药',
      lines: SKINCARE.evening.steps.concat([SKINCARE.evening.note]).concat(dayTips).concat(skinExtra)
    };
  }
  if (period === 'afternoon') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 下午补一下',
      sub: '',
      lines: ['太阳还在的话，帽子、伞、口罩别落下，物理遮挡最省事。', '脸干了就薄涂一点保湿修护，别用手一直摸。'].concat(dayTips).concat(skinExtra)
    };
  }
  if (period === 'bedtime' || period === 'sleep') {
    return {
      id: 'skin',
      type: 'text',
      icon: '🧴',
      title: '护肤 · 睡前一步',
      sub: '',
      lines: ['嘴唇干就补一层润唇，其他都留给明天早上。'].concat(dayTips).concat(skinExtra)
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

  // 天气卡常驻首页第一张：南宁（学校）+ 深圳（家里）随时能看一眼，不分时段；期末周期间紧跟一张期末卡
  return [weatherModule(ctx), examModule(ctx)].concat(mods).filter(Boolean);
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

/**
 * 课表节奏。
 * 默认值只是「先按之前记的猜」，真正的课表由豆豆自己在设置页填，
 * 填了就以她填的为准（存 dd:schedule），没填就还用这套默认。
 */
const DAYS = [
  { wd: 0, name: '周日', first: '', afternoon: false, busy: 'low', note: '没课，睡到自然醒也没关系' },
  { wd: 1, name: '周一', first: '10:00', afternoon: true, busy: 'mid', note: '没有早八，早十的课，早饭慢慢吃' },
  { wd: 2, name: '周二', first: '', afternoon: false, busy: 'mid', note: '没有早八，下午很空，适合练琴和补觉' },
  { wd: 3, name: '周三', first: '08:00', afternoon: true, busy: 'high', note: '一早就有课，前一天就别熬夜了' },
  { wd: 4, name: '周四', first: '08:00', afternoon: true, busy: 'high', note: '一周最忙的一天，晚上早点收工' },
  { wd: 5, name: '周五', first: '10:00', afternoon: true, busy: 'mid', note: '大概率早十，别赖到最后一刻' },
  { wd: 6, name: '周六', first: '', afternoon: false, busy: 'low', note: '没课，好好歇一天' }
];

let CUSTOM = {};

function normalizeFirst(v) {
  return v === '08:00' || v === '10:00' ? v : '';
}

/** 用她填的覆盖默认，并重新生成一句人话备注。known=true 表示这一天以她填写为准；false 时只是默认占位，不当事实下结论 */
function merged(day) {
  const c = CUSTOM[day.wd];
  if (!c) return { ...day, custom: false, known: false, noteRaw: '' };

  const first = normalizeFirst(c.first);
  const afternoon = !!c.afternoon;
  const busy = first === '08:00' ? 'high' : first === '10:00' || afternoon ? 'mid' : 'low';

  const bits = [
    first === '08:00' ? '早八，前一晚早点睡' : first === '10:00' ? '早十，早饭慢慢吃' : '上午没课，可以睡饱'
  ];
  bits.push(afternoon ? '下午有课' : '下午空着，适合练琴');
  const extra = String(c.note || '').trim();
  if (extra) bits.push(extra);

  return { ...day, first, afternoon, busy, note: bits.join('；'), custom: true, known: true, noteRaw: extra };
}

/** 已被她明确填写的天数 */
function filledCount() {
  return Object.keys(CUSTOM).length;
}

/** 某天是否以她的填写为准 */
function isKnown(wd) {
  return !!CUSTOM[String(wd)];
}

function of(dateObj) {
  const d = dateObj || new Date();
  return merged(DAYS[d.getDay()]);
}

function tomorrow(dateObj) {
  const d = new Date((dateObj || new Date()).getTime() + 86400000);
  return merged(DAYS[d.getDay()]);
}

/** 上午/下午空不空 */
function isEarly(day) {
  return !!day && day.first === '08:00';
}

/** 用她填的课表接管（传空对象 = 回到默认猜法） */
function setCustom(map) {
  CUSTOM = map && typeof map === 'object' ? map : {};
}

function hasCustom() {
  return Object.keys(CUSTOM).length > 0;
}

/** 一周七天（已合并她填的内容） */
function week() {
  return DAYS.map(merged);
}

export { DAYS, of, tomorrow, isEarly, setCustom, hasCustom, week, filledCount, isKnown };
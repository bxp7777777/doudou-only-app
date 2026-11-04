/* 渲染烟测：用最小 DOM 桩把 app.js 跑起来，逐个切 tab 检查页面真的渲染出来了 */

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

const nodes = {};
const handlers = {};
const makeEl = (id) => ({ id, innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, focus() {}, value: '' });

globalThis.document = {
  getElementById: (id) => (nodes[id] ||= makeEl(id)),
  createElement: () => makeEl('tmp'),
  addEventListener: (type, fn) => {
    (handlers[type] ||= []).push(fn);
  },
  body: { className: '', appendChild() {} },
  visibilityState: 'visible',
  documentElement: { style: { setProperty() {}, removeProperty() {} } }
};

globalThis.window = {
  location: { hash: '#/home' },
  scrollTo() {},
  confirm: () => true,
  addEventListener() {},
  dispatchEvent() {}
};

// Node 自带 navigator（没有 serviceWorker），正好对应「不支持 PWA」的分支

const problems = [];
const check = (ok, msg) => {
  if (!ok) problems.push(msg);
};

await import('../public/js/app.js');
const store = await import('../public/js/store.js');
await new Promise((r) => setTimeout(r, 50)); // 等 init 里的天气请求失败落地

function click(payload) {
  handlers.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: payload }) } }));
}

const homeHtml = () => nodes.app.innerHTML;
check(document.body.className === 'theme-duo', '默认背景应为「贴贴」，实际 ' + document.body.className);
check(homeHtml().includes('小猪盯吃喝'), '首页没渲染 hero');
check(homeHtml().includes('喝水'), '首页没渲染喝水卡');
check(homeHtml().includes('音乐氛围'), '首页缺音乐氛围卡');
check(homeHtml().includes('今日一曲'), '首页缺今日一曲纯文案卡');
// 天气卡只有部分时段出，出了就必须有兜底文案（不能白卡）
if (homeHtml().includes('南宁')) check(homeHtml().includes('没查到'), '天气卡失败时应兜底');

click({ act: 'tab', tab: 'cycle' });
check(homeHtml().includes('今天的小日子'), '小日子页没渲染日记卡');
check(homeHtml().includes('今天什么心情'), '小日子页缺心情选择');
check(homeHtml().includes('身体感觉'), '小日子页缺身体状况');
check(homeHtml().includes('例假与身体'), '小日子页缺周期卡');

click({ act: 'diary-mood', mood: 'happy' });
check(homeHtml().includes('mood-on'), '选了心情没高亮');
document.getElementById('diary-text').value = '今天练了琴，食堂的汤很暖';
click({ act: 'diary-save' });
check(homeHtml().includes('食堂的汤很暖'), '日记写进去后没出现在列表');
check(homeHtml().includes('#练琴') === false, '没选的标签不该出现');
click({ act: 'diary-tag', tag: '练琴' });
check(homeHtml().includes('#练琴'), '选标签后列表没显示');
document.getElementById('diary-q').value = '汤';
click({ act: 'diary-search' });
check(homeHtml().includes('食堂的汤很暖'), '搜索命中的那天没显示');
document.getElementById('diary-q').value = '不存在的词';
click({ act: 'diary-search' });
check(homeHtml().includes('没找到'), '搜索不命中时应提示没找到');
document.getElementById('diary-q').value = '';
click({ act: 'diary-search' });
check(homeHtml().includes('写过的日子'), '清空搜索后应回到全部列表');
click({ act: 'diary-search' });
check(homeHtml().includes('不推算任何日期') || homeHtml().includes('小猪先按 28 天记'), '周期卡没渲染参数说明');

click({ act: 'tab', tab: 'story' });
check(!homeHtml().includes('今天什么心情'), '切到每日故事后不该还留着日记表单');
check(homeHtml().includes('每日小故事'), '每日小故事页没渲染');
check(/《.+》/.test(homeHtml()), '小故事页没渲染故事标题');
check(homeHtml().includes('每日一笑'), '缺「每日一笑」笑话卡');
check(homeHtml().includes('陪伴小勋章'), '缺陪伴勋章卡');
check(homeHtml().includes('天天相伴') && homeHtml().includes('开心一刻') && homeHtml().includes('故事收藏家'), '主要勋章名称未展示');
check(homeHtml().includes('日常小提醒'), '故事页缺「日常小提醒」卡');
check(homeHtml().includes('睡前小建议'), '故事页缺「睡前小建议」卡');
check(homeHtml().includes('换一个笑话'), '缺「换一个笑话」按钮');
click({ act: 'joke-another' });
check(homeHtml().includes('每日一笑'), '换笑话后笑话卡应仍在');
check(store.jokeCount() >= 1, '看笑话后应累计计数');
click({ act: 'story-done' });
check(homeHtml().includes('今天这篇看完啦'), '看完后应进入开心回顾态文案');

click({ act: 'tab', tab: 'memo' });
check(homeHtml().includes('豆豆的备忘录'), '备忘页没渲染');
click({ act: 'memo-add' }); // 空内容应被拦下
check(!homeHtml().includes('先写一句'), '空备忘录不应写入');
nodes['memo-input'].value = '明天带琴谱';
click({ act: 'memo-add' });
check(homeHtml().includes('明天带琴谱'), '备忘录写入后没显示');

click({ act: 'tab', tab: 'settings' });
check(homeHtml().includes('小猪小金毛的记事本'), '设置页没渲染');
check(homeHtml().includes('课表节奏'), '设置页缺课表');
check(homeHtml().includes('跨设备同步'), '设置页缺同步模块');
check(homeHtml().includes('生成同步码'), '没同步码时应显示生成按钮');
check(homeHtml().includes('每日轮换'), '背景 chips 缺「每日轮换」');
check(homeHtml().includes('点心'), '背景 chips 缺第四套「点心」');

// 课表由豆豆自己填：存进去后首页/设置都要按她的来
check(homeHtml().includes('豆豆记好了'), '设置页缺课表保存按钮');
check(homeHtml().includes('sched-first-3'), '设置页缺周三的课表选择');
document.getElementById('sched-first-3').value = '10:00';
document.getElementById('sched-aft-3').dataset = { on: '1' };
document.getElementById('sched-note-3').value = '合唱排练';
click({ act: 'sched-save' });
check(store.getSchedule()['3'] && store.getSchedule()['3'].first === '10:00', '课表没写进 dd:schedule');
check(store.getSchedule()['3'].afternoon === true, '课表下午标记没存对');
check(homeHtml().includes('合唱排练'), '保存后课表备注没显示');
check(!homeHtml().includes('还没填'), '填过之后不该再显示「还没填」');

click({ act: 'theme', key: 'qingzhu' });
check(document.body.className === 'theme-qingzhu', '主题没切到青竹');

click({ act: 'tab', tab: 'home' });
click({ act: 'cup', index: '0' });
check(homeHtml().includes('第2杯'), '喝水卡点击后没重渲染');
click({ act: 'music-play' });
click({ act: 'tune-another' });
check(homeHtml().includes('今日一曲'), '换一首意境后文案卡仍应在');
check(nodes.tabs.innerHTML.includes('今陪伴'), '底部导航没渲染');
check(nodes.tabs.innerHTML.includes('养成'), '底部导航缺「养成」入口');

click({ act: 'tab', tab: 'game' });
check(window.location.href === '/game.html', '养成 tab 应跳到 /game.html，实际 ' + window.location.href);

if (problems.length) {
  console.error('❌ 渲染烟测问题 ' + problems.length + ' 条：');
  problems.forEach((p) => console.error(' - ' + p));
  process.exit(1);
}
console.log('✅ 渲染烟测通过：首页 / 小日子 / 小故事 / 备忘 / 设置，以及喝水点击与主题切换');
process.exit(0); // app.js 里有 setInterval，测试跑完要主动退出
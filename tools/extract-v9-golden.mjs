#!/usr/bin/env node
// 特性測試（golden）：在 Node 裡直接執行 v9 預覽頁的原始計算程式（redesign/v9/generate_v9.py 的 JS_APP），
// 以固定的「今天」與固定的測試資料算出標準答案，寫入 packages/core/test/fixtures/v9-golden.json。
// TypeScript 移植版（packages/core）的測試必須與這份答案完全一致。
// 用法：node tools/extract-v9-golden.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-10-21';
const fx = (f) => JSON.parse(readFileSync(resolve(root, 'packages/core/test/fixtures', f), 'utf8'));
const data = fx('training_data.json');
const journals = fx('journals_raw.json');

// 與 generate_v9.py 的 Python 前處理相同
const dailyIndex = {};
for (const ex of data.exercises)
  for (const h of ex.history) {
    (dailyIndex[h.date] ||= []).push(ex.id);
    if (ex.rep_unit) h._unit = ex.rep_unit;
    if (ex.zero_label) h._zero = ex.zero_label;
  }

const py = readFileSync(resolve(root, 'redesign/v9/generate_v9.py'), 'utf8');
const start = py.indexOf('JS_APP = r"""') + 'JS_APP = r"""'.length;
const jsApp = py.slice(start, py.indexOf('"""', start));

// 萬用 DOM 替身：任何屬性存取、呼叫都回傳替身本身，讓 UI 程式碼不會出錯
const stub = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : stub),
  apply: () => stub,
  construct: () => stub,
  set: () => true,
});
const [Y, M, D] = TODAY.split('-').map(Number);
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(Y, M - 1, D, 12, 0, 0);
    else super(...a);
  }
  static now() {
    return new FixedDate().getTime();
  }
}
const ctx = vm.createContext({
  Date: FixedDate,
  Math,
  JSON,
  Object,
  Array,
  Number,
  String,
  Set,
  Map,
  Symbol,
  RegExp,
  Intl,
  console,
  Promise,
  URL,
  Blob: stub,
  URLSearchParams,
  document: stub,
  window: stub,
  location: { search: '', pathname: '/' },
  history: stub,
  localStorage: stub,
  matchMedia: () => stub,
  addEventListener: () => {},
  requestAnimationFrame: () => 0,
  setTimeout: () => 0,
  clearTimeout: () => {},
  getComputedStyle: () => stub,
  innerWidth: 1440,
});
const dataJs =
  `const EXERCISES=${JSON.stringify(data.exercises)};const JOURNALS=${JSON.stringify(journals)};` +
  `const DAILY_INDEX=${JSON.stringify(dailyIndex)};const GROUP_ORDER=${JSON.stringify(data.meta.group_order)};` +
  `const GROUP_COLOR={};const ICON=new Proxy({}, {get:()=>''});const EX_MAP=Object.fromEntries(EXERCISES.map(e=>[e.id,e]));`;
vm.runInContext(dataJs, ctx);
vm.runInContext(jsApp, ctx);

// 從 v9 原始函式抽出計算段落（到產生 HTML 之前）並回傳所有區域變數
const body = (name, untilMarker) => {
  const s = jsApp.indexOf(`function ${name}(`);
  const b = jsApp.indexOf('{', s) + 1;
  const e = jsApp.indexOf(untilMarker, b);
  if (s < 0 || e < 0) throw new Error(`找不到 ${name} 的計算段落`);
  return jsApp.slice(b, e);
};
const dashBody = body('renderDashboard', "document.getElementById('view-dashboard').innerHTML");
vm.runInContext(
  `function __dash(p){DASH.period=p;${dashBody}
   return {wk,lwk,cur,prev,vC,vP,prC:prC.map(x=>({id:x.ex.id,date:x.date,from:x.from,to:x.to})),prP:prP.length,streak,
     bal,ex,exTot,neg:neg.map(e=>e.id),recent,ysLen:ys.length,best,wks,
     kspark:{days:wkSeries(ds=>ds.length),vol:wkSeries(ds=>ds.reduce((s,d)=>s+dayVol(d),0)),pr:wkSeries((ds,w)=>prByWeek(w))}};}`,
  ctx,
);
const weekBody = body('drawWeekChart', 'const key=DASH.metric');
vm.runInContext(
  `function __weeks(){const el={clientWidth:800};${weekBody.replace("const el=document.getElementById('chart-week');if(!el||!el.clientWidth)return;", '')} return weeks;}`,
  ctx,
);

const run = (code) => vm.runInContext(code, ctx);
const golden = {
  today: TODAY,
  perExercise:
    run(`EXERCISES.map(e=>({id:e.id,last:lastDate(e),status:statusOf(e),daysAgo:calcDaysAgo(lastDate(e)),
    vol:e.history.map(h=>calcVolume(h.sets)),maxWt:e.history.map(h=>getMaxWeight(h.sets)),cardio:cardioTotals(e.history)}))`),
  sorted: run(
    `Object.fromEntries(['group','recent','overdue','maxwt','volume','sessions','progress','name'].map(k=>[k,sortedExercises(k).map(e=>e.id)]))`,
  ),
  prEvents: run(`prEvents().map(p=>({id:p.ex.id,date:p.date,from:p.from,to:p.to}))`),
  days: run(`Object.fromEntries(ALL_DATES.map(d=>[d,{sets:daySets(d),vol:dayVol(d),groups:dayGroups(d)}]))`),
  dashboard: { 7: run('__dash(7)'), 30: run('__dash(30)'), 90: run('__dash(90)') },
  weeks: run('__weeks()'),
  palette: run(
    `Object.fromEntries(['10/19','1019','2026-10-19','深蹲','腿部','RDL','',' 背部 '].map(q=>[q,palItems(q).map(i=>i.sec+'|'+i.label)]))`,
  ),
  filters:
    run(`(()=>{const out={};for(const s of ['all','7','30','old']){FILTER.status=s;FILTER.q='';FILTER.groups.clear();out['status:'+s]=filteredExercises('group').map(e=>e.id);}
    FILTER.status='all';FILTER.q='深蹲';out['q:深蹲']=filteredExercises('recent').map(e=>e.id);FILTER.q='';FILTER.groups.add('胸部');FILTER.groups.add('背部');out['groups:胸部,背部']=filteredExercises('name').map(e=>e.id);FILTER.groups.clear();return out;})()`),
  labels:
    run(`({daysLabel:[0,1,2,15].map(daysLabel),daysTone:[0,3,4,7,8,100].map(daysTone),exhTone:['輕鬆','普通','吃力','力竭','力竭（左）','—',undefined].map(exhTone),
    datesInRange:datesInRange('2026-10-19',3),mondayOf:['2026-10-19','2026-10-21','2026-10-25'].map(mondayOf),longDate:longDate('2026-10-19')})`),
};
writeFileSync(
  resolve(root, 'packages/core/test/fixtures/v9-golden.json'),
  JSON.stringify(golden, null, 1) + '\n',
);
console.log(
  'golden 寫入完成：',
  Object.keys(golden).join('、'),
  `｜動作 ${golden.perExercise.length}、PR ${golden.prEvents.length}、訓練日 ${Object.keys(golden.days).length}`,
);

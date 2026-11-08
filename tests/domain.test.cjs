"use strict";
const test=require("node:test"), assert=require("node:assert/strict");
const {createController}=require("../src/domain/controller");
const {validateCatalog,evidenceAnswer,validateAnswer}=require("../src/domain/knowledge");
const {viewModel,paginate}=require("../src/ui/layout");
const catalog=require("../src/data/exhibition.json");
const basic={answer:"有依据的讲解",evidenceIds:["sun-basic"],insufficientEvidence:false,mode:"evidence"};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function controller(explain){return createController({catalog,explain:explain||((request)=>evidenceAnswer(catalog.exhibits.find(e=>e.id===request.exhibitId),request))});}

test("资料ID、来源与三件实际展品结构有效",()=>{assert.equal(validateCatalog(catalog).exhibits.length,3);assert.equal(catalog.endDate,"2025-01-19");});
test("未选择作品不能猜测这幅；确认后保留问题",async()=>{
  const c=controller();c.submit("这幅是什么作品");assert.equal(c.snapshot().status,"confirm");
  c.confirm(catalog.exhibits[0].id);await c.settled();assert.equal(c.snapshot().history[0].question,"这幅是什么作品");
});
test("风景歧义只提供两件候选；确认保留提问，取消使候选失效",async()=>{
  const c=controller();c.submit("这幅风景画讲了什么");assert.equal(c.snapshot().pending.candidateIds.length,2);c.confirm(catalog.exhibits[1].id);await c.settled();assert.equal(c.snapshot().answer.insufficientEvidence,false);
  c.submit("讲讲风景画");c.cancel();assert.throws(()=>c.confirm(catalog.exhibits[1].id),/失效/);
});
test("文字与语音转写使用同一展品和会话",async()=>{
  const c=controller();c.submit("讲讲一号作品");await c.settled();c.submit("作者是谁","voice");await c.settled();
  assert.equal(c.snapshot().exhibitId,catalog.exhibits[0].id);assert.equal(c.snapshot().history.length,2);assert.equal(c.snapshot().inputMode,"voice");
});
test("内容焦点修改与即时布局独立生效",async()=>{
  const c=controller();c.submit("讲讲向日葵");await c.settled();c.submit("讲讲背景，字大一点，重点放下面");await c.settled();
  const s=c.snapshot();assert.equal(s.font,"large");assert.equal(s.placement,"bottom");assert.equal(s.focus,"background");assert.match(s.answer.answer,/高更/);
});
test("选作品或确认歧义时，保留同一句话的关注点和篇幅要求",async()=>{
  const requests=[];const c=controller(request=>{requests.push(request);return evidenceAnswer(catalog.exhibits.find(e=>e.id===request.exhibitId),request);});
  c.submit("切换到《有柏树的麦田》，只讲构图，简短一点。","voice");await c.settled();
  assert.equal(c.snapshot().exhibitId,catalog.exhibits[2].id);assert.equal(c.snapshot().focus,"composition");assert.equal(requests.at(-1).focus,"composition");assert.equal(requests.at(-1).length,"short");
  c.submit("这幅风景画的背景，简短介绍。","voice");assert.equal(c.snapshot().status,"confirm");c.confirm(catalog.exhibits[1].id);await c.settled();
  assert.equal(requests.at(-1).focus,"background");assert.equal(requests.at(-1).length,"short");assert.equal(c.snapshot().history.at(-1).source,"voice");
});
test("语音转写附带句末标点时，取消、重试、翻页仍是指令",async()=>{
  let calls=0;const c=controller(()=>{calls++;return {...basic,answer:"画面有15朵向日葵。".repeat(30),evidenceIds:["sun-composition"]};});
  c.select(catalog.exhibits[0].id);await c.settled();const previous=calls;
  c.submit("下一页。","voice");assert.equal(c.snapshot().page,1);c.submit("上一页！","voice");assert.equal(c.snapshot().page,0);
  c.submit("取消。","voice");assert.equal(c.snapshot().notice,"已取消。");c.submit("重试？","voice");assert.equal(c.snapshot().notice,"没有需要重试的任务。");assert.equal(calls,previous);
});
test("无价格资料时明确拒答；不引用无关资料",async()=>{
  const c=controller();c.select(catalog.exhibits[0].id);await c.settled();c.submit("这幅画值多少钱");await c.settled();assert.equal(c.snapshot().answer.insufficientEvidence,true);assert.deepEqual(c.snapshot().answer.evidenceIds,[]);
});
test("切展品后忽略不响应abort的旧回复",async()=>{
  const tasks=[];const c=controller(request=>new Promise(resolve=>tasks.push({request,resolve})));
  c.select(catalog.exhibits[0].id);await flush();c.select(catalog.exhibits[1].id);await flush();
  tasks[1].resolve({...basic,answer:"河上夜景",evidenceIds:["night-basic"]});await c.settled();tasks[0].resolve(basic);await flush();
  assert.equal(c.snapshot().exhibitId,catalog.exhibits[1].id);assert.equal(c.snapshot().answer.answer,"河上夜景");assert.equal(c.snapshot().history.length,1);
});
test("普通追问排队，后续请求读取已完成历史",async()=>{
  const tasks=[];const c=controller(request=>new Promise(resolve=>tasks.push({request,resolve})));
  c.select(catalog.exhibits[0].id);await flush();c.submit("作者是谁");assert.equal(c.snapshot().queueCount,1);
  tasks[0].resolve(basic);await flush();assert.equal(tasks[1].request.history.length,1);tasks[1].resolve(basic);await c.settled();assert.equal(c.snapshot().history.length,2);
});
test("生成中合并修改，布局不被迟到响应回滚",async()=>{
  const tasks=[];const c=controller(request=>new Promise(resolve=>tasks.push({request,resolve})));
  c.select(catalog.exhibits[0].id);await flush();c.submit("多讲背景");await flush();c.submit("再短一点");await flush();c.submit("字大一点");
  assert.equal(tasks[2].request.focus,"background");assert.equal(tasks[2].request.length,"short");
  tasks[2].resolve(basic);await c.settled();tasks[0].resolve({...basic,answer:"过期"});tasks[1].resolve({...basic,answer:"过期"});await flush();
  assert.equal(c.snapshot().font,"large");assert.equal(c.snapshot().answer.answer,basic.answer);assert.equal(c.snapshot().history.length,1);
});
test("后台和销毁均使迟到结果失效",async()=>{
  for(const action of ["suspend","dispose"]){let finish;const c=controller(()=>new Promise(r=>finish=r));c.select(catalog.exhibits[0].id);await flush();c[action]();finish(basic);await flush();assert.equal(c.snapshot().history.length,0);}
});
test("失败后可重试，坏出处不能进入历史",async()=>{
  let first=true;const c=controller(()=>{if(first){first=false;throw new Error("网络失败");}return basic;});c.select(catalog.exhibits[0].id);await c.settled();assert.equal(c.snapshot().status,"error");c.retry();await c.settled();assert.equal(c.snapshot().status,"complete");
  assert.throws(()=>validateAnswer({...basic,evidenceIds:["invented"]},catalog.exhibits[0].facts),/依据/);
});
test("Unicode分页不丢字；大字号下内容都在边界内",()=>{
  const text="作品🌻".repeat(50), pages=paginate(text,17,4);assert.equal(pages.join("").replaceAll("\n",""),text);
  const state={...controller().snapshot(),answer:basic,font:"large",layout:"compact",page:99};const view=viewModel(state,catalog);
  assert.ok(view.body.split("\n").length<=3);assert.ok(view.bodyY+view.bodyHeight<=324);assert.ok(view.pageCount>=1);
});
test("背景讲解精简后更短，反复修改不无限累积问题",async()=>{
  const c=controller();c.select(catalog.exhibits[0].id);await c.settled();c.submit("讲讲背景");await c.settled();const full=c.snapshot().answer.answer;
  for(let i=0;i<10;i++){c.submit("再短一点");await c.settled();}
  assert.ok(c.snapshot().answer.answer.length<full.length);assert.match(c.snapshot().answer.answer,/高更/);assert.ok(c.snapshot().lastQuestion.length<80);
});
test("重点卡确实改变显示层级，历史展览提示保留",async()=>{
  const c=controller();c.select(catalog.exhibits[0].id);await c.settled();c.submit("讲讲背景");await c.settled();c.submit("重点卡");
  const vm=viewModel(c.snapshot(),catalog);assert.equal(vm.title,"创作背景");assert.match(vm.subtitle,/向日葵/);assert.match(vm.footnote,/历史展览/);
});

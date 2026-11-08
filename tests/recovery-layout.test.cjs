"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createController}=require("../src/domain/controller");
const {viewModel,paginate}=require("../src/ui/layout");
const catalog=require("../src/data/exhibition.json");
const answer={answer:"画面有15朵向日葵，呈现不同生长阶段。".repeat(24),evidenceIds:["sun-composition"],insufficientEvidence:false,mode:"evidence"};
const make=explain=>createController({catalog,explain:explain||(async()=>answer)});
test("长讲解在字号/布局/位置组合下完整分页，正文不覆盖来源和按钮",()=>{
  const base={...make().snapshot(),exhibitId:catalog.exhibits[0].id,status:"complete",answer};
  for(const font of ["normal","large"])for(const layout of ["standard","compact","focus"])for(const placement of ["top","bottom"]){
    const state={...base,font,layout,placement},initial=viewModel(state,catalog),bodies=[];
    for(let page=0;page<initial.pageCount;page++){
      const vm=viewModel({...state,page},catalog);bodies.push(vm.body);assert.ok(vm.bodyY>=108);assert.ok(vm.bodyY+vm.bodyHeight<=324);
      assert.ok(vm.body.split("\n").length*(vm.fontSize+8)<=vm.bodyHeight);assert.ok(vm.body.split("\n").every(line=>Array.from(line).length<=Math.floor(560/vm.fontSize)));
      assert.equal(vm.hasPreviousPage,page>0);assert.equal(vm.hasNextPage,page<initial.pageCount-1);
    }
    assert.equal(bodies.join("").replaceAll("\n",""),answer.answer);
  }
});
test("短数字和馆藏编号不会从中间断行",()=>{
  const lines=paginate("甲甲甲15朵NG3863向日葵",7,20)[0].split("\n");
  assert.ok(lines.some(line=>line.includes("15")));assert.ok(lines.some(line=>line.includes("NG3863")));assert.equal(lines.join(""),"甲甲甲15朵NG3863向日葵");
});
test("中文顿号不单独起行，书名号不悬在行末，正文保持完整",()=>{
  for(const text of ["甲甲甲、乙乙乙。","甲甲《向日葵》乙乙。"]){
    const lines=paginate(text,3,20)[0].split("\n");assert.equal(lines.join(""),text);
    assert.ok(lines.every(line=>!/^[、。，！？》]/u.test(line)));assert.ok(lines.every(line=>!/[《（]$/u.test(line)));
  }
});
test("反复翻到边界不累积无效页码，上一页一次即可返回",async()=>{
  const c=make();c.select(catalog.exhibits[0].id);await c.settled();c.submit("字大一点，精简卡");
  const count=viewModel(c.snapshot(),catalog).pageCount;
  for(let i=0;i<count+3;i++)c.submit("下一页");assert.equal(c.snapshot().page,count-1);assert.match(c.snapshot().notice,/最后/);
  c.submit("上一页");assert.equal(c.snapshot().page,count-2);
  for(let i=0;i<count+3;i++)c.submit("上一页");assert.equal(c.snapshot().page,0);
});
test("重复布局指令不调用讲解服务，也不改写对话历史",async()=>{
  let calls=0;const c=make(async()=>{calls++;return answer;});c.select(catalog.exhibits[0].id);await c.settled();
  for(const text of ["字大一点","字大一点","精简卡，放在底部","精简卡，放在底部","恢复布局","恢复布局"])c.submit(text);
  await c.settled();assert.equal(calls,1);assert.equal(c.snapshot().history.length,1);assert.match(c.snapshot().notice,/当前已使用/);
});
test("英文显示指令只修改布局，保留讲解和上下文，不调用模型",async()=>{
  let calls=0;const c=make(async()=>{calls++;return answer;});c.select(catalog.exhibits[0].id);await c.settled();const before=c.snapshot();
  c.submit("font size larger");assert.equal(c.snapshot().font,"large");assert.equal(viewModel(c.snapshot(),catalog).fontSize,32);
  c.submit("Please font size larger, compact card, at the bottom.","voice");
  const after=c.snapshot();assert.equal(after.layout,"compact");assert.equal(after.placement,"bottom");assert.equal(after.inputMode,"voice");
  assert.deepEqual(after.answer,before.answer);assert.deepEqual(after.history,before.history);assert.equal(calls,1);
  c.submit("font size smaller and standard layout and top");assert.equal(c.snapshot().font,"normal");assert.equal(c.snapshot().layout,"standard");assert.equal(c.snapshot().placement,"top");assert.equal(calls,1);
});
test("未选作品时英文布局可直接生效；提到字体的普通问题不误执行",async()=>{
  const requests=[];const c=make(async req=>{requests.push(req);return answer;});c.submit("font size larger");
  assert.equal(c.snapshot().font,"large");assert.equal(c.snapshot().pending,null);assert.equal(requests.length,0);
  c.select(catalog.exhibits[0].id);await c.settled();c.submit("font size smaller");
  const question="Why did the artist use a larger font in this painting?";c.submit(question);await c.settled();
  assert.equal(c.snapshot().font,"normal");assert.equal(requests.at(-1).question,question);assert.equal(requests.length,2);
});
test("英文精简指令沿用作品和原问题，文字与语音共享修改语义",async()=>{
  const requests=[];const c=make(async req=>{requests.push(req);return answer;});c.select(catalog.exhibits[0].id,"讲讲创作背景");await c.settled();
  c.submit("make it shorter","voice");await c.settled();
  assert.equal(requests.at(-1).exhibitId,catalog.exhibits[0].id);assert.equal(requests.at(-1).focus,"background");assert.equal(requests.at(-1).length,"short");assert.equal(requests.at(-1).source,"voice");assert.match(requests.at(-1).question,/讲讲创作背景/);
  c.submit("more details");await c.settled();assert.equal(requests.at(-1).length,"normal");
});
test("讲解失败保留旧答案，重试同一问题一次后恢复且不重复历史",async()=>{
  let fail=false,calls=0;const c=make(async()=>{calls++;if(fail){fail=false;throw new Error("外部服务请求失败 (503)");}return answer;});
  c.select(catalog.exhibits[0].id);await c.settled();c.submit("下一页");fail=true;c.submit("讲讲背景");await c.settled();
  const failed=c.snapshot();assert.equal(failed.page,0);assert.equal(failed.errorKind,"generation");assert.equal(failed.recoveryAction,"retry-question");assert.equal(failed.canRetry,true);assert.deepEqual(failed.answer,answer);
  const vm=viewModel(failed,catalog);assert.equal(vm.recovery.hasPreviousAnswer,true);assert.deepEqual(vm.sources,[]);
  c.retry();await c.settled();assert.equal(calls,3);assert.equal(c.snapshot().status,"complete");assert.equal(c.snapshot().history.length,2);assert.equal(c.snapshot().recoveryAction,null);
});
test("语音失败后的重试不会偷偷重发旧问题；取消能返回上一份讲解",async()=>{
  let fail=false,calls=0;const c=make(async()=>{calls++;if(fail)throw new Error("请求失败");return answer;});
  c.select(catalog.exhibits[0].id);await c.settled();fail=true;c.submit("讲讲背景");await c.settled();
  c.inputError("麦克风权限被拒绝");const failed=c.snapshot();assert.equal(failed.recoveryAction,"record-again");assert.equal(failed.canRetry,false);
  c.retry();await c.settled();assert.equal(calls,2);assert.match(c.snapshot().notice,/重新录音/);
  c.cancel();assert.equal(c.snapshot().status,"complete");assert.deepEqual(c.snapshot().answer,answer);c.retry();assert.equal(calls,2);
});
test("语音错误使正在生成的迟到讲解失效",async()=>{
  let resolve;const c=make(()=>new Promise(r=>{resolve=r;}));c.select(catalog.exhibits[0].id);await new Promise(r=>setImmediate(r));
  c.inputError("识别失败");resolve(answer);await new Promise(r=>setImmediate(r));assert.equal(c.snapshot().status,"error");assert.equal(c.snapshot().errorKind,"voice");assert.equal(c.snapshot().history.length,0);
});
test("显示失败重试只重新呈现已有内容，不调用AI或重复对话",async()=>{
  let calls=0;const c=make(async()=>{calls++;return answer;});c.select(catalog.exhibits[0].id);await c.settled();const before=c.snapshot();
  c.presentationFailed();assert.equal(c.snapshot().recoveryAction,"redisplay");c.retry();await c.settled();const after=c.snapshot();
  assert.equal(calls,1);assert.equal(after.status,"complete");assert.deepEqual(after.history,before.history);assert.equal(after.presentationRevision,before.presentationRevision+1);
});
test("取消旧失败后不能重试已撤销的请求；错误与确认总从第一页显示",async()=>{
  let fail=false,calls=0;const c=make(async()=>{calls++;if(fail)throw new Error("超时");return answer;});c.select(catalog.exhibits[0].id);await c.settled();
  c.submit("下一页");c.submit("这幅风景画讲什么");assert.equal(c.snapshot().page,0);assert.equal(viewModel(c.snapshot(),catalog).sourceLabel,"");
  c.cancel();fail=true;c.submit("讲讲背景");await c.settled();c.cancel();c.retry();assert.equal(calls,2);assert.equal(c.snapshot().canRetry,false);
});
test("返回旧讲解时也恢复其关注点与问题，后续精简不会沿用失败问题",async()=>{
  let fail=false;const requests=[];const c=make(async request=>{requests.push(request);if(fail)throw new Error("请求失败");return answer;});
  c.select(catalog.exhibits[0].id,"讲讲背景");await c.settled();fail=true;c.submit("只讲材料");await c.settled();c.cancel();
  assert.equal(c.snapshot().focus,"background");assert.equal(c.snapshot().lastQuestion,"讲讲背景");
  fail=false;c.submit("再短一点");await c.settled();assert.equal(requests.at(-1).focus,"background");assert.match(requests.at(-1).question,/讲讲背景/);assert.doesNotMatch(requests.at(-1).question,/材料/);
});

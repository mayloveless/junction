"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createController}=require("../src/domain/controller");
const {viewModel}=require("../src/ui/layout");
const catalog=require("../src/data/exhibition.json");
const result={answer:"梵高在阿尔勒创作这幅作品。",evidenceIds:["sun-background"],insufficientEvidence:false,mode:"evidence"};
function fixture(){const requests=[];const controller=createController({catalog,explain:async request=>{requests.push(request);return result;}});return {controller,requests};}
test("语音先显示原文与当前作品，确认前不请求讲解",async()=>{
  const {controller:c,requests}=fixture();c.select(catalog.exhibits[0].id);await c.settled();c.reviewTranscript("介绍下创作背景");
  assert.equal(requests.length,1);assert.equal(c.snapshot().status,"confirm");assert.equal(c.snapshot().pending,null);assert.equal(c.snapshot().pendingTranscript,"介绍下创作背景");
  const vm=viewModel(c.snapshot(),catalog);assert.match(vm.body,/识别为：介绍下创作背景/);assert.match(vm.body,/当前作品：向日葵/);
  c.submit("confirm");await c.settled();assert.equal(requests.length,2);assert.equal(requests[1].focus,"background");assert.equal(requests[1].source,"voice");assert.equal(requests[1].exhibitId,catalog.exhibits[0].id);assert.equal(c.snapshot().pendingTranscript,null);assert.match(viewModel(c.snapshot(),catalog).notice,/识别：介绍下创作背景/);
});
test("转写不对时可用英文修正，旧转写不能再被确认执行",async()=>{
  const {controller:c,requests}=fixture();c.select(catalog.exhibits[0].id);await c.settled();c.reviewTranscript("欢迎来坐坐");
  c.submit("background");await c.settled();assert.equal(requests.length,2);assert.equal(requests[1].question,"讲讲创作背景");assert.equal(requests[1].source,"text");assert.equal(c.snapshot().lastTranscript,"");
  c.submit("confirm");await c.settled();assert.equal(requests.length,2);
});
test("取消或重新录音清除待确认转写；布局调整不会偷偷发送语音",async()=>{
  const {controller:c,requests}=fixture();c.select(catalog.exhibits[0].id);await c.settled();c.reviewTranscript("欢迎来坐坐");
  c.submit("font size larger");assert.equal(c.snapshot().font,"large");assert.equal(c.snapshot().pendingTranscript,"欢迎来坐坐");assert.equal(requests.length,1);
  c.cancel();assert.equal(c.snapshot().pendingTranscript,null);assert.equal(c.snapshot().lastTranscript,"");c.confirmTranscript();assert.equal(requests.length,1);
  c.reviewTranscript("第一段");c.suspend();assert.equal(c.snapshot().pendingTranscript,null);c.reviewTranscript("介绍创作背景");assert.equal(c.snapshot().pendingTranscript,"介绍创作背景");
});

"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {inspectEnvironment,probeService}=require("../tools/check-env.cjs");
const catalog=require("../src/data/exhibition.json");
test("自检只报告凭证是否配置，不暴露密钥；仅便携检查不宣称原生验证",()=>{
  const marker="secret-marker-must-not-appear";
  const report=inspectEnvironment({env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:marker,AI_MODEL:"deepseek-flash",ASR_PROVIDER:"siliconflow"},nodeVersion:"24.13.0",npmVersion:"11.6.2",platform:"darwin",arch:"x64"});
  assert.equal(report.status,"pass");assert.equal(report.scope,"portable-project-only");assert.equal(report.checks.serviceConfig.detail.aiConfigured,true);assert.equal(JSON.stringify(report).includes(marker),false);
});
test("原生自检拒绝错误架构、系统版本、工具链和后端端口",()=>{
  const valid={env:{DISPLAY:":0"},nodeVersion:"24.13.0",npmVersion:"11.6.2",platform:"linux",arch:"x64",osRelease:'ID=ubuntu\nVERSION_ID="22.04"',native:true};
  assert.equal(inspectEnvironment(valid).status,"pass");
  for(const changed of [{arch:"arm64"},{platform:"darwin"},{osRelease:'ID=ubuntu\nVERSION_ID="24.04"'},{nodeVersion:"22.0.0"},{npmVersion:"10.0.0"},{env:{PORT:"8000",DISPLAY:":0"}},{env:{}}])assert.equal(inspectEnvironment({...valid,...changed}).status,"fail");
});
test("端口探测区分本应用、没有服务和其他服务，不能误杀或复用其他服务",async()=>{
  const response=value=>new Response(JSON.stringify(value));
  assert.equal((await probeService(async()=>response({catalogId:catalog.id,answerMode:"evidence",aiConfigured:false,asrConfigured:false}))).code,0);
  assert.equal((await probeService(async()=>response({catalogId:"other",answerMode:"evidence",aiConfigured:false}))).code,4);
  assert.equal((await probeService(async()=>new Response("not-json"))).code,4);
  assert.equal((await probeService(async()=>{throw Object.assign(new Error("refused"),{cause:{code:"ECONNREFUSED"}});})).code,3);
  assert.equal((await probeService(async()=>{throw new Error("timeout");})).code,4);
});

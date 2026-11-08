"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createProviders}=require("../backend/providers.cjs");
const {createServer}=require("../backend/server.cjs");
const {createServiceClient}=require("../src/services/client");
const {pcmToWav}=require("../src/input/voice");
const catalog=require("../src/data/exhibition.json");
const request={exhibitId:catalog.exhibits[0].id,question:"讲讲背景",length:"normal",history:[]};
const fixture={answer:"有依据的摘要",evidenceIds:["sun-background"],insufficientEvidence:false};
const json=value=>new Response(JSON.stringify(value),{headers:{"Content-Type":"application/json"}});
function ai(fetchImpl){return createProviders({catalog,env:{ANSWER_MODE:"openai",OPENAI_API_KEY:"test-key-not-real",AI_MODEL:"test-model",ASR_MODEL:"test-asr"},fetchImpl});}

test("默认仅资料摘录，无隐式外部请求",async()=>{
  let called=false;const p=createProviders({catalog,env:{},fetchImpl:()=>{called=true;throw new Error("不应联网");}});
  assert.equal((await p.explain(request)).mode,"evidence");assert.equal(called,false);assert.equal(p.status().asrConfigured,false);
});
test("Responses 请求使用结构化合同；凭证只在后端",async()=>{
  let body;const p=ai(async(url,init)=>{assert.equal(url.pathname,"/v1/responses");body=JSON.parse(init.body);assert.equal(init.headers.Authorization,"Bearer test-key-not-real");return json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(fixture)}]}]});});
  assert.equal((await p.explain(request)).mode,"ai");assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(body.model,"test-model");
});
test("拒答、不完整回复和虚构依据均失败",async()=>{
  for(const result of [{status:"incomplete",output:[]},{status:"completed",output:[{content:[{type:"refusal",refusal:"no"}]}]},
    {status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({...fixture,evidenceIds:["fake"]})}]}]}]){
    await assert.rejects(ai(async()=>json(result)).explain(request));
  }
});
test("ASR传入WAV multipart；无音频或无配置不能伪造结果",async()=>{
  const wav=pcmToWav(Buffer.alloc(640));const p=ai(async(url,init)=>{
    assert.equal(url.pathname,"/v1/audio/transcriptions");assert.equal(init.body.get("model"),"test-asr");assert.equal(init.body.get("file").name,"question.wav");assert.equal(init.body.get("response_format"),"json");return json({text:"作者是谁"});
  });assert.deepEqual(await p.transcribe(wav),{text:"作者是谁"});await assert.rejects(p.transcribe(Buffer.from("invalid")));
  await assert.rejects(createProviders({catalog,env:{}}).transcribe(wav),/尚未配置/);
});
test("真实本地HTTP往返：原生服务客户端、预览会话、输入校验",async t=>{
  const server=createServer({env:{}});await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`, client=createServiceClient(base);
  assert.equal((await client.explain(request)).mode,"evidence");
  const session=await (await fetch(base+"/api/sessions",{method:"POST"})).json();
  const send=body=>fetch(base+`/api/sessions/${session.id}/command`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  await send({action:"select",exhibitId:catalog.exhibits[0].id});
  const state=await(await fetch(base+`/api/sessions/${session.id}`)).json();assert.equal(state.state.exhibitId,catalog.exhibits[0].id);assert.equal(state.state.status,"complete");
  const blocked=await fetch(base+"/api/sessions",{method:"POST",headers:{Origin:"https://other.example"}});assert.equal(blocked.status,403);
  const bad=await fetch(base+"/api/explain",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:"x".repeat(4097)})});assert.equal(bad.status,400);
  assert.equal((await fetch(base+"/api/health")).status,200);assert.equal((await fetch(base+"/")).status,200);
  assert.equal((await fetch(base+"/recorder.js")).status,200);
  await send({action:"voice-phase",phase:"permission"});await send({action:"voice-phase",phase:"recording"});
  const recording=await(await fetch(base+`/api/sessions/${session.id}`)).json();assert.equal(recording.state.phase,"recording");assert.equal(recording.state.inputMode,"voice");
  await send({action:"submit",text:"讲讲创作背景",source:"voice"});await new Promise(resolve=>setImmediate(resolve));
  const spoken=await(await fetch(base+`/api/sessions/${session.id}`)).json();assert.equal(spoken.state.history.at(-1).source,"voice");
  await send({action:"voice-error",message:"麦克风权限被拒绝"});
  const failed=await(await fetch(base+`/api/sessions/${session.id}`)).json();assert.equal(failed.state.status,"error");assert.match(failed.state.error,/权限/);
  assert.equal((await send({action:"voice-phase",phase:"invented"})).status,400);
});
test("DeepSeek使用官方Chat Completions JSON合同并关闭思考",async()=>{
  const p=createProviders({catalog,env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:"deepseek-test",ASR_PROVIDER:"siliconflow"},fetchImpl:async(url,init)=>{
    assert.equal(url.origin,"https://api.deepseek.com");assert.equal(url.pathname,"/chat/completions");assert.equal(init.headers.Authorization,"Bearer deepseek-test");
    const body=JSON.parse(init.body);assert.equal(body.model,"deepseek-flash");assert.equal(body.response_format.type,"json_object");assert.equal(body.thinking.type,"disabled");assert.match(body.messages[0].content,/JSON/);
    return json({choices:[{finish_reason:"stop",message:{content:JSON.stringify(fixture)}}]});
  }});
  assert.equal((await p.explain(request)).mode,"ai");assert.equal(p.status().asrConfigured,false);
});
test("DeepSeek空白、截断或无效依据不会显示为成功",async()=>{
  for(const choice of [{finish_reason:"stop",message:{content:"  "}},{finish_reason:"length",message:{content:"{}"}},{finish_reason:"stop",message:{content:JSON.stringify({...fixture,evidenceIds:["invented"]})}}]){
    const p=createProviders({catalog,env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:"deepseek-test"},fetchImpl:async()=>json({choices:[choice]})});await assert.rejects(p.explain(request));
  }
});
test("硅基流动ASR不复用DeepSeek凭证，只提交已文档化的file/model",async()=>{
  let called=false;
  const p=createProviders({catalog,env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:"deepseek-test",ASR_PROVIDER:"siliconflow",SILICONFLOW_API_KEY:"siliconflow-test",ASR_MODEL:"FunAudioLLM/SenseVoiceSmall"},fetchImpl:async(url,init)=>{
    called=true;assert.equal(url.origin,"https://api.siliconflow.cn");assert.equal(url.pathname,"/v1/audio/transcriptions");assert.equal(init.headers.Authorization,"Bearer siliconflow-test");
    assert.deepEqual([...init.body.keys()].sort(),["file","model"]);return json({text:"讲讲构图"});
  }});
  assert.equal((await p.transcribe(pcmToWav(Buffer.alloc(640)))).text,"讲讲构图");assert.equal(called,true);
  const missing=createProviders({catalog,env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:"deepseek-test",ASR_PROVIDER:"siliconflow",ASR_MODEL:"test"},fetchImpl:()=>{throw new Error("不应发送DeepSeek凭证");}});
  await assert.rejects(missing.transcribe(pcmToWav(Buffer.alloc(640))),/尚未配置/);
});
test("Omni语音经Chat传入完整WAV，不混入讲解与会话历史",async()=>{
  const wav=pcmToWav(Buffer.alloc(640));
  const p=createProviders({catalog,env:{ASR_PROVIDER:"siliconflow",ASR_API:"chat-completions",ASR_MODEL:"Qwen/Qwen3-Omni-30B-A3B-Instruct",SILICONFLOW_API_KEY:"sf-test",DEEPSEEK_API_KEY:"ds-test"},fetchImpl:async(url,init)=>{
    assert.equal(url.origin,"https://api.siliconflow.cn");assert.equal(url.pathname,"/v1/chat/completions");assert.equal(init.headers.Authorization,"Bearer sf-test");
    const body=JSON.parse(init.body);assert.equal(body.model,"Qwen/Qwen3-Omni-30B-A3B-Instruct");assert.equal(body.stream,false);assert.equal(body.messages.length,1);
    const [audio,prompt]=body.messages[0].content;assert.equal(audio.type,"audio_url");
    assert.deepEqual(Buffer.from(audio.audio_url.url.split(",")[1],"base64"),wav);assert.match(prompt.text,/不回答问题/);
    return json({choices:[{finish_reason:"stop",message:{content:"  只讲构图  "}}]});
  }});
  assert.deepEqual(await p.transcribe(wav),{text:"只讲构图"});
});
test("Omni截断、拒答、空白和无独立凭证不作为成功转写",async()=>{
  const env={ASR_PROVIDER:"siliconflow",ASR_API:"chat-completions",ASR_MODEL:"Qwen/Qwen3-Omni-30B-A3B-Instruct",SILICONFLOW_API_KEY:"sf-test"},wav=pcmToWav(Buffer.alloc(640));
  for(const choice of [{finish_reason:"length",message:{content:"半句"}},{finish_reason:"stop",message:{content:" "}},{finish_reason:"stop",message:{refusal:"no",content:"拒绝"}}]){
    await assert.rejects(createProviders({catalog,env,fetchImpl:async()=>json({choices:[choice]})}).transcribe(wav));
  }
  await assert.rejects(createProviders({catalog,env:{...env,SILICONFLOW_API_KEY:"",DEEPSEEK_API_KEY:"ds-test"},fetchImpl:()=>{throw new Error("不应请求");}}).transcribe(wav),/尚未配置/);
});

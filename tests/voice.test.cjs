"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pcmToWav,createVoiceAdapter}=require("../src/input/voice");
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(transcribe=async()=>"讲讲向日葵"){
  const events=[],texts=[],errors=[],phases=[];let requests=0,cancels=0,finishes=0;
  const session={takeEvent:()=>events.shift()||null,cancel(){cancels++;return true;},finish(){finishes++;return true;}};
  const input={getVoiceInputAvailability:()=>({canRequest:true,ready:false}),requestVoiceInput(){requests++;return session;}};
  const adapter=createVoiceAdapter({input,transcribe,onText:t=>texts.push(t),onError:e=>errors.push(e),onPhase:p=>phases.push(p)});
  const audio=(sequence=0,amplitude=1200)=>{const data=Buffer.alloc(640);for(let i=0;i<640;i+=2)data.writeInt16LE(amplitude,i);return {type:"audio",sampleRate:16000,channels:1,format:"s16le",sequence,sampleOffset:sequence*320,sampleCount:320,data};};
  return {adapter,events,texts,errors,phases,audio,input,get requests(){return requests;},get cancels(){return cancels;},get finishes(){return finishes;}};
}
test("WAV正确标记16kHz单声道16位PCM长度",()=>{const wav=pcmToWav(Buffer.alloc(640));assert.equal(wav.length,684);assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt32LE(40),640);assert.throws(()=>pcmToWav(Buffer.alloc(1)));});
test("ready=false但canRequest=true仍可请求；finish后等end才转写",async()=>{
  const f=fixture();f.adapter.start();f.events.push({type:"state",state:"recording"},f.audio());f.adapter.pump();f.adapter.finish();f.adapter.pump();assert.equal(f.texts.length,0);assert.equal(f.adapter.busy,true);
  f.events.push({type:"end",status:"completed",reason:"none"});f.adapter.pump();await flush();assert.deepEqual(f.texts,["讲讲向日葵"]);assert.equal(f.adapter.busy,false);
});
test("取消后收到end前不得开启新会话；队列暂空不是结束",()=>{
  const f=fixture();f.adapter.start();f.adapter.cancel();f.adapter.pump();f.adapter.start();assert.equal(f.requests,1);
  f.events.push({type:"end",status:"cancelled",reason:"user-cancelled"});f.adapter.pump();f.adapter.start();assert.equal(f.requests,2);
});
test("取消使迟到ASR结果无效",async()=>{
  let finish;const f=fixture(()=>new Promise(r=>finish=r));f.adapter.start();f.events.push(f.audio(),{type:"end",status:"completed"});f.adapter.pump();await flush();f.adapter.cancel();finish("旧问题");await flush();assert.deepEqual(f.texts,[]);
});
test("原生静音录音不发送到ASR，明确提示检查麦克风",async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return "欢迎来坐坐";});f.adapter.start();f.events.push(f.audio(0,0),{type:"end",status:"completed"});f.adapter.pump();await flush();
  assert.equal(calls,0);assert.equal(f.texts.length,0);assert.match(f.errors[0],/音量过低|没有声音/);
});
test("音频缺帧显式失败，后续只清理不提交",async()=>{
  const f=fixture();f.adapter.start();f.events.push(f.audio(1));f.adapter.pump();assert.match(f.errors[0],/顺序/);assert.equal(f.cancels,1);f.events.push({type:"end",status:"cancelled"});f.adapter.pump();await flush();assert.equal(f.texts.length,0);
});
test("空录音、空识别和权限拒绝都有明确失败",async()=>{
  const f=fixture();f.adapter.start();f.events.push({type:"end",status:"completed"});f.adapter.pump();assert.match(f.errors[0],/录音长度/);
  const empty=fixture(async()=>"");empty.adapter.start();empty.events.push(empty.audio(),{type:"end",status:"completed"});empty.adapter.pump();await flush();assert.match(empty.errors[0],/没有识别/);
  const denied=fixture();denied.input.getVoiceInputAvailability=()=>({canRequest:false,reason:"permission-denied"});denied.adapter.start();assert.match(denied.errors[0],/权限/);
});

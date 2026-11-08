"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {pcmToWav,createRecorder}=require("../preview/recorder");
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness({getUserMedia,transcribe=async()=>"讲讲向日葵的背景",samples=new Float32Array(16000).fill(0.1),now=()=>0}={}){
  const events=[],contexts=[],tracks=[{stopped:false,stop(){this.stopped=true;},addEventListener(){}}];
  const stream={getTracks:()=>tracks,getAudioTracks:()=>tracks};
  class AudioContext{
    constructor(){this.state="running";contexts.push(this);}
    async resume(){}async close(){this.state="closed";}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createAnalyser(){return {fftSize:256,getByteTimeDomainData(array){array.fill(128);},disconnect(){}};}
    async decodeAudioData(){return {duration:1};}
  }
  class OfflineAudioContext{
    createBufferSource(){return {connect(){},start(){}};}
    async startRendering(){return {getChannelData:()=>samples};}
  }
  class MediaRecorder{
    static isTypeSupported(){return true;}
    constructor(){this.state="inactive";this.mimeType="audio/webm";}
    start(){this.state="recording";}
    stop(){this.state="inactive";queueMicrotask(()=>{this.ondataavailable({data:new Blob(["test-audio"])});this.onstop();});}
  }
  let timer;
  const recorder=createRecorder({mediaDevices:{getUserMedia:getUserMedia||(async()=>stream)},AudioContext,OfflineAudioContext,MediaRecorder,
    now,setTimer:callback=>{timer=callback;return 1;},clearTimer:()=>{},transcribe,onPhase:(phase)=>events.push(phase),onText:text=>events.push({text}),onError:e=>events.push({error:e.message})});
  return {recorder,events,tracks,stream,contexts,timer:()=>timer()};
}
test("浏览器WAV符合16kHz单声道PCM合同并夹取过载样本",()=>{
  const wav=Buffer.from(pcmToWav(new Float32Array([-2,-1,0,1,2])));
  assert.equal(wav.toString("ascii",0,4),"RIFF");assert.equal(wav.readUInt32LE(24),16000);assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(40),10);
  assert.equal(wav.readInt16LE(44),-32768);assert.equal(wav.readInt16LE(52),32767);
  assert.throws(()=>pcmToWav(new Float32Array(960001)));assert.throws(()=>pcmToWav(new Float32Array()));
});
test("浏览器结束后才上传WAV，释放麦克风并将真实转写交给同一会话",async()=>{
  let uploads=0;const h=harness({transcribe:async(wav,{signal})=>{uploads++;assert.equal(signal.aborted,false);assert.equal(Buffer.from(wav).length,32044);assert.equal(h.tracks[0].stopped,true);return "  只讲构图  ";}});
  await h.recorder.start();assert.equal(uploads,0);assert.equal(h.recorder.isActive(),true);
  h.recorder.stop();await tick();assert.equal(uploads,1);assert.deepEqual(h.events.at(-2),{text:"只讲构图"});assert.equal(h.events.at(-1),"idle");assert.equal(h.contexts[0].state,"closed");
});
test("权限被拒绝仍可重试且不会发送音频",async()=>{
  const h=harness({getUserMedia:async()=>{throw Object.assign(new Error("denied"),{name:"NotAllowedError"});},transcribe:()=>assert.fail("不应上传")});
  await h.recorder.start();assert.match(h.events.at(-1).error,/权限/);assert.equal(h.recorder.isActive(),false);assert.equal(h.contexts[0].state,"closed");
});
test("等待权限时取消，迟到的麦克风流会被立即关闭",async()=>{
  let allow;const h=harness({getUserMedia:()=>new Promise(resolve=>{allow=resolve;}),transcribe:()=>assert.fail("不应上传")});
  const pending=h.recorder.start();await tick();h.recorder.cancel();allow(h.stream);await pending;
  assert.equal(h.tracks[0].stopped,true);assert.equal(h.recorder.isActive(),false);assert.equal(h.events.includes("recording"),false);
});
test("取消正在识别的语音会中止请求，并丢弃迟到文字",async()=>{
  let resolveText,signal,entered;const started=new Promise(resolve=>{entered=resolve;});
  const h=harness({transcribe:(_wav,options)=>{signal=options.signal;entered();return new Promise(resolve=>{resolveText=resolve;});}});
  await h.recorder.start();h.recorder.stop();await started;h.recorder.cancel();assert.equal(signal.aborted,true);
  resolveText("迟到的旧问题");await tick();assert.equal(h.events.some(event=>event.text),false);assert.equal(h.events.at(-1),"idle");
});
test("静音不上传，避免模型把无声录音猜成问题",async()=>{
  const h=harness({samples:new Float32Array(16000),transcribe:()=>assert.fail("静音不应上传")});
  await h.recorder.start();h.recorder.stop();await tick();assert.match(h.events.at(-1).error,/声音/);assert.equal(h.tracks[0].stopped,true);
});
test("达到60秒自动结束采音，释放麦克风并转写",async()=>{
  let time=0,uploaded=0;const h=harness({now:()=>time,transcribe:async()=>{uploaded++;return "自动结束的录音";}});
  await h.recorder.start();time=60000;h.timer();await tick();assert.equal(h.tracks[0].stopped,true);assert.equal(uploaded,1);assert.equal(h.events.at(-1),"idle");
});
test("识别超时提供可操作提示并释放录音资源",async()=>{
  const h=harness({transcribe:async()=>{throw Object.assign(new Error("The operation timed out"),{name:"TimeoutError"});}});
  await h.recorder.start();h.recorder.stop();await tick();assert.match(h.events.at(-1).error,/识别响应超时/);assert.equal(h.recorder.isActive(),false);assert.equal(h.tracks[0].stopped,true);
});

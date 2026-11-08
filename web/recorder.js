(function(root,factory){
  if(typeof module==="object"&&module.exports)module.exports=factory();
  else root.ExhibitRecorder=factory();
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  function pcmToWav(samples){
    if(!samples.length||samples.length>960000)throw new Error("录音长度无效，最长60秒");
    const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
    const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
    text(0,"RIFF");view.setUint32(4,36+samples.length*2,true);text(8,"WAVEfmt ");view.setUint32(16,16,true);
    view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);
    view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,"data");view.setUint32(40,samples.length*2,true);
    for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(44+i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);}
    return buffer;
  }
  const messages={NotAllowedError:"麦克风权限未开启。请在浏览器地址栏或系统设置中允许麦克风，再重试。",NotFoundError:"没有找到麦克风，请连接麦克风后重试。",NotReadableError:"麦克风无法使用，可能正被其他应用占用。",SecurityError:"浏览器阻止了录音，请用 Chrome 打开本机预览。",TimeoutError:"语音识别响应超时，请重新录音或改用文字。",EncodingError:"浏览器无法读取这段录音，请重新录音或换用 Chrome。"};
  function createRecorder({mediaDevices=globalThis.navigator?.mediaDevices,AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,
    OfflineAudioContext=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext,MediaRecorder=globalThis.MediaRecorder,
    onPhase=()=>{},onMeter=()=>{},onText=()=>{},onError=()=>{},transcribe,now=()=>Date.now(),setTimer=setInterval,clearTimer=clearInterval}={}){
    let current=null;
    const supported=Boolean(mediaDevices?.getUserMedia&&AudioContext&&OfflineAudioContext&&MediaRecorder);
    const valid=s=>current===s&&!s.abort.signal.aborted;
    function release(s){
      if(s.timer)clearTimer(s.timer);
      s.stream?.getTracks().forEach(track=>track.stop());
      try{s.source?.disconnect();}catch{}try{s.analyser?.disconnect();}catch{}
    }
    function close(s){release(s);if(s.context&&s.context.state!=="closed")Promise.resolve(s.context.close()).catch(()=>{});}
    function fail(s,error){if(!valid(s))return;current=null;s.abort.abort();close(s);onMeter(0,0);onError(new Error(messages[error.name]||error.message||"录音失败，请重试或使用文字。"));}
    async function finish(s){
      release(s);
      if(!valid(s)){close(s);return;}
      try{
        if(!s.chunks.length)throw new Error("没有录到声音，请重新录音。");
        onPhase("transcribing","正在识别语音…");
        const blob=new Blob(s.chunks,{type:s.recorder.mimeType});s.chunks=[];
        const decoded=await s.context.decodeAudioData(await blob.arrayBuffer());
        if(!valid(s))return;
        if(decoded.duration<0.3)throw new Error("录音太短，请说完后再结束。");
        const count=Math.min(960000,Math.ceil(decoded.duration*16000));
        const offline=new OfflineAudioContext(1,count,16000),source=offline.createBufferSource();
        source.buffer=decoded;source.connect(offline.destination);source.start();
        const rendered=await offline.startRendering();if(!valid(s))return;
        const samples=rendered.getChannelData(0);
        let energy=0;for(const sample of samples)energy+=sample*sample;
        if(Math.sqrt(energy/samples.length)<0.001)throw new Error("声音太小或没有录到声音，请靠近麦克风重试。");
        const text=await transcribe(pcmToWav(samples),{signal:s.abort.signal});if(!valid(s))return;
        if(typeof text!=="string"||!text.trim())throw new Error("没有识别到文字，请重新录音或使用文字。");
        onPhase("sending","已识别，正在发送…");await onText(text.trim());if(!valid(s))return;
        current=null;onMeter(0,0);onPhase("idle","已发送。可继续说话或改用文字。");
      }catch(error){fail(s,error);}finally{close(s);}
    }
    async function start(){
      if(current)return;
      if(!supported){onError(new Error("当前浏览器不支持录音，请用 Chrome 打开 http://127.0.0.1:4317。"));return;}
      const s={abort:new AbortController(),chunks:[],bytes:0,stream:null,context:null,recorder:null,timer:null};current=s;
      onPhase("permission","请允许使用麦克风；允许后开始录音。");
      try{
        s.context=new AudioContext();await s.context.resume();if(!valid(s)){close(s);return;}
        const stream=await mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
        s.stream=stream;if(!valid(s)){close(s);return;}
        const mimeType=["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(type=>MediaRecorder.isTypeSupported?.(type));
        s.recorder=new MediaRecorder(stream,mimeType?{mimeType}:undefined);
        s.source=s.context.createMediaStreamSource(stream);s.analyser=s.context.createAnalyser();s.analyser.fftSize=256;s.source.connect(s.analyser);
        s.recorder.ondataavailable=event=>{if(!valid(s)||!event.data.size)return;s.bytes+=event.data.size;if(s.bytes>8388608){fail(s,new Error("录音数据过大，请缩短后重试。"));return;}s.chunks.push(event.data);};
        s.recorder.onerror=event=>fail(s,event.error||new Error("录音中断，请重试。"));
        s.recorder.onstop=()=>finish(s);
        for(const track of stream.getAudioTracks())track.addEventListener("ended",()=>{if(valid(s)&&s.recorder.state==="recording")fail(s,new Error("麦克风已断开，请重试。"));});
        s.started=now();s.recorder.start(250);onPhase("recording","正在录音，说完后点击「结束并发送」。");
        const values=new Uint8Array(s.analyser.fftSize);
        s.timer=setTimer(()=>{if(!valid(s))return;const seconds=Math.min(60,(now()-s.started)/1000);s.analyser.getByteTimeDomainData(values);let energy=0;for(const value of values)energy+=((value-128)/128)**2;onMeter(Math.min(1,Math.sqrt(energy/values.length)*4),seconds);if(seconds>=60)stop();},150);
      }catch(error){fail(s,error);}
    }
    function stop(){const s=current;if(!s||s.recorder?.state!=="recording")return;onPhase("transcribing","录音已结束，正在识别…");s.recorder.stop();release(s);}
    function cancel(){const s=current;if(!s)return;current=null;s.abort.abort();try{if(s.recorder?.state==="recording")s.recorder.stop();}catch{}close(s);s.chunks=[];onMeter(0,0);onPhase("idle","录音已取消。可继续使用文字。");}
    return {supported,start,stop,cancel,isActive:()=>Boolean(current)};
  }
  return {pcmToWav,createRecorder};
});

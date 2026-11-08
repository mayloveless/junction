"use strict";
function pcmToWav(pcm) {
  const bytes=Buffer.from(pcm);
  if (!bytes.length || bytes.length%2 || bytes.length>1920000) throw new Error("录音长度或PCM格式无效");
  const header=Buffer.alloc(44);
  header.write("RIFF",0);header.writeUInt32LE(36+bytes.length,4);header.write("WAVEfmt ",8);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);
  header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);
  header.write("data",36);header.writeUInt32LE(bytes.length,40);return Buffer.concat([header,bytes]);
}

const REASONS={unsupported:"当前Client未提供录音能力", "not-declared":"应用未声明录音能力", "not-foreground":"请先将应用切到前台",
  disconnected:"设备连接已断开", "permission-denied":"麦克风权限被拒绝", "device-unavailable":"没有可用麦克风", busy:"上一次录音尚未结束",
  overflow:"音频缓冲溢出，请重录", timeout:"等待麦克风超时", "user-cancelled":"已取消录音"};

function hasAudibleSignal(pcm){
  let energy=0,peak=0;
  for(let i=0;i<pcm.length;i+=2){const value=pcm.readInt16LE(i)/32768;energy+=value*value;peak=Math.max(peak,Math.abs(value));}
  return Math.sqrt(energy/Math.max(1,pcm.length/2))>=0.001||peak>=0.01;
}

function createVoiceAdapter({input,transcribe,onText,onPhase,onError}) {
  let session=null, frames=[], bytes=0, nextSequence=0, generation=0, discarded=false, upload=null, disposed=false;
  const fail=e=>onError(e.message||String(e));
  function start() {
    if (disposed) return;
    if(session||upload){fail(new Error("上一段语音尚未结束，请稍后重试"));return;}
    try {
      const available=input.getVoiceInputAvailability("audio");
      if(!available.canRequest) throw new Error(REASONS[available.reason]||`录音不可用：${available.reason}`);
      generation++;discarded=false;frames=[];bytes=0;nextSequence=0;
      session=input.requestVoiceInput({mode:"audio"});onPhase("permission","等待麦克风确认…");
    } catch(e){fail(e);}
  }
  function finish(){if(session)try{session.finish();}catch(e){fail(e);}}
  function cancel() {
    generation++;discarded=true;
    if(upload){upload.abort();upload=null;}
    if(session)try{session.cancel();}catch(e){fail(e);}
    frames=[];bytes=0;
  }
  function pump() {
    if(!session)return;
    try {
      // Drain a bounded batch without awaiting network; null does not end a session.
      for(let i=0;i<128 && session;i++){
        const event=session.takeEvent();if(event===null)break;
        if(event.type==="state"){
          if(!discarded && event.state==="recording")onPhase("recording","录音中 · 说完后选择结束录音");
        }else if(event.type==="audio"){
          if(discarded)continue;
          if(event.sampleRate!==16000||event.channels!==1||event.format!=="s16le"||event.sequence!==nextSequence++||event.sampleOffset*2!==bytes||event.data.length!==event.sampleCount*2)throw new Error("音频帧格式或顺序错误");
          bytes+=event.data.length;
          if(bytes>1920000)throw new Error("录音超过60秒限制");
          frames.push(Buffer.from(event.data));
        }else if(event.type==="end"){
          session=null;
          if(discarded){frames=[];bytes=0;continue;}
          if(event.status!=="completed"){frames=[];bytes=0;throw new Error(REASONS[event.reason]||`录音失败：${event.reason}`);}
          const pcm=Buffer.concat(frames);const wav=pcmToWav(pcm);frames=[];bytes=0;
          if(!hasAudibleSignal(pcm))throw new Error("录音音量过低或没有声音，请检查Ubuntu麦克风后重录。");
          const token=generation, abort=new AbortController();upload=abort;onPhase("transcribing","正在识别语音…");
          Promise.resolve().then(()=>transcribe(wav,{signal:abort.signal})).then(text=>{
            if(token!==generation||disposed)return;
            if(typeof text!=="string"||!text.trim())throw new Error("没有识别到文字，请重录或输入文字");
            onText(text.trim());
          }).catch(e=>{if(token===generation&&!disposed)fail(e);}).finally(()=>{if(upload===abort)upload=null;});
        }
      }
    }catch(e){cancel();fail(e);}
  }
  return {start,finish,cancel,pump,get busy(){return Boolean(session||upload);},dispose(){cancel();disposed=true;}};
}
module.exports={pcmToWav,createVoiceAdapter};

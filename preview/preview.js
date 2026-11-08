"use strict";
let catalog,sessionId,lastRevision=-1,polling=false,recorder,recordingPhase="idle",commands=Promise.resolve(),currentState=null,asrReady=false;
const $=id=>document.getElementById(id);
async function api(path,body){const response=await fetch(path,{...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});const value=await response.json();if(!response.ok)throw new Error(value.error||"请求失败");return value;}
function error(e){$("error").textContent=e.name==="TimeoutError"?"本地服务响应超时，请确认服务已启动后再试。":/fetch|network|Load failed/i.test(e.message||"")?"暂时无法连接本地服务，请检查服务后刷新页面。":e.message;}
function fit(){const scale=$("screen").parentElement.clientWidth/640;$("screen").style.transform=`scale(${scale})`;}
function paint({state,view}){
  if(state.revision<=lastRevision)return;lastRevision=state.revision;currentState=state;
  for(const key of ["title","subtitle","status","body","notice","footnote"] )$(key).textContent=view[key];
  $("body").style.top=`${view.bodyY}px`;$("body").style.height=`${view.bodyHeight}px`;$("body").style.fontSize=`${view.fontSize}px`;$("body").style.lineHeight=`${view.fontSize+8}px`;
  $("source").textContent=view.sourceLabel;$("exhibits").replaceChildren();
  $("previous-page").disabled=!view.hasPreviousPage;$("next-page").disabled=!view.hasNextPage;$("page-position").textContent=`${view.pageIndex+1} / ${view.pageCount}`;
  $("cancel").textContent=state.status==="error"&&state.answer?"返回讲解":"取消任务";
  $("task-progress").hidden=state.status!=="processing";
  $("task-progress").textContent=view.phaseLabel+(view.queueCount?` · ${view.queueCount} 条追问等待中`:"");
  $("recovery").hidden=!view.recovery;
  if(view.recovery){$("recovery-title").textContent=view.recovery.title;$("recovery-message").textContent=view.recovery.message;
    $("retry").textContent=view.recovery.buttonLabel;$("retry").disabled=view.recovery.action==="record-again"?!(recorder?.supported&&asrReady):!state.canRetry;
    $("recovery-dismiss").textContent=state.answer?"返回上一份讲解":"改用文字";}
  for(const e of catalog.exhibits){const button=document.createElement("button");button.textContent=`0${e.number} / ${e.title}`;const small=document.createElement("small");small.textContent=`${e.year} · ${e.collection}`;button.append(small);button.className=state.exhibitId===e.id?"selected":"";
    const eligible=!state.pending||state.pending.candidateIds.includes(e.id);button.disabled=!eligible;
    button.onclick=()=>dispatch({action:state.pending?"confirm":"select",exhibitId:e.id});$("exhibits").append(button);}
  $("sources").replaceChildren();for(const source of view.sources){const link=document.createElement("a");link.href=source.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent=source.title;$("sources").append(link,document.createElement("br"));}
  if(state.history.length){$("history").replaceChildren();for(const turn of state.history){const item=document.createElement("div");item.className="turn";const small=document.createElement("small");small.textContent=turn.source==="voice"?"语音输入":"文字";const q=document.createElement("p"),a=document.createElement("p");q.textContent=turn.question;a.textContent=turn.answer;item.append(small,q,a);$("history").append(item);}}
  else $("history").textContent="选定作品后，对话会保留在这里。";
}
async function refresh(){if(polling||!sessionId)return;polling=true;try{paint(await api(`/api/sessions/${sessionId}`));}catch(e){error(e);}finally{polling=false;}}
function command(body){
  const result=commands.then(async()=>{$("error").textContent="";const value=await api(`/api/sessions/${sessionId}/command`,body);paint(value);return value;});
  commands=result.catch(()=>{});return result.catch(e=>{error(e);throw e;});
}
async function userCommand(body){
  if(recorder?.isActive()){recorder.cancel();if(body.action!=="cancel")await command({action:"cancel"});}
  return command(body);
}
function dispatch(body){userCommand(body).catch(()=>{});}
function voicePhase(phase,message){
  recordingPhase=phase;$("voice-state").textContent=message;document.querySelector(".voice-panel").dataset.phase=phase;
  $("record").textContent=phase==="recording"?"结束并发送":phase==="transcribing"?"正在识别…":phase==="sending"?"正在发送…":phase==="permission"?"等待麦克风…":"开始录音";
  $("record").disabled=!["idle","recording","error"].includes(phase)||!recorder?.supported||!asrReady;
  $("record-cancel").hidden=!["permission","recording","transcribing","sending"].includes(phase);
  if(["permission","recording","transcribing"].includes(phase))command({action:"voice-phase",phase}).catch(()=>recorder?.cancel());
}
function initRecorder(health){
  asrReady=health.asrConfigured;
  recorder=ExhibitRecorder.createRecorder({
    onPhase:voicePhase,
    onMeter:(level,seconds)=>{$("voice-level").value=level;$("voice-time").textContent=`${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(Math.floor(seconds)%60).padStart(2,"0")} / 01:00`;},
    onError:e=>{voicePhase("error",e.message);error(e);command({action:"voice-error",message:e.message.slice(0,400)}).catch(()=>{});},
    transcribe:async(wav,{signal})=>{
      const response=await fetch("/api/transcribe",{method:"POST",headers:{"Content-Type":"audio/wav"},body:wav,signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
      const value=await response.json();if(!response.ok)throw new Error(value.error||"识别失败，请重试或使用文字。");return value.text;
    },
    onText:async text=>{$("question").value=text;$("last-transcript").textContent="刚才的语音已发送，改错后可重发。";await command({action:"submit",text,source:"voice"});}
  });
  $("record").onclick=()=>{if(recordingPhase==="recording")recorder.stop();else recorder.start();};
  $("record-cancel").onclick=()=>{recorder.cancel();command({action:"cancel"}).catch(()=>{});};
  $("question").addEventListener("input",()=>{if(recorder.isActive()){recorder.cancel();command({action:"cancel"}).catch(()=>{});}});
  if(!recorder.supported)voicePhase("error","当前浏览器不支持录音，请用 Chrome 打开本机预览；文字仍可使用。");
  else if(!health.asrConfigured){$("record").disabled=true;$("voice-state").textContent="语音服务尚未配置，请先使用文字。";}
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&recorder.isActive()){recorder.cancel();command({action:"cancel"}).catch(()=>{});}});
  window.addEventListener("pagehide",()=>recorder.cancel());
}
async function init(){
  catalog=await api("/api/catalog");const health=await api("/api/health");
  $("exhibition").textContent=`${catalog.title} / ${catalog.venue} / ${catalog.startDate} — ${catalog.endDate}（已结束）`;
  $("mode").textContent=health.answerMode==="evidence"?"资料摘录 · AI 未连接":`${health.answerMode==="deepseek"?"DeepSeek":"AI"} · ${health.aiModel||"未选模型"}`;
  $("service-state").textContent=`AI：${health.aiConfigured?"凭证已配置":"未配置"} / ASR：${health.asrConfigured?"凭证已配置":"未配置"}`;
  sessionId=(await api("/api/sessions",{})).id;await refresh();fit();initRecorder(health);
  $("question-form").onsubmit=e=>{e.preventDefault();const text=$("question").value.trim();if(text){dispatch({action:"submit",text,source:"text"});$("question").value="";$("last-transcript").textContent="";}};
  document.querySelectorAll("[data-text]").forEach(button=>button.onclick=()=>dispatch({action:"submit",text:button.dataset.text,source:"text"}));
  $("cancel").onclick=()=>dispatch({action:"cancel"});
  $("retry").onclick=()=>{if(currentState?.recoveryAction==="record-again")recorder.start();else dispatch({action:"retry"});};
  $("recovery-dismiss").onclick=()=>{dispatch({action:"cancel"});if(!currentState?.answer)$("question").focus();};
  window.addEventListener("resize",fit);setInterval(refresh,500);
}
init().catch(error);

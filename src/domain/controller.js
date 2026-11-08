"use strict";
const {matchExhibits, topicOf, validateAnswer} = require("./knowledge");
const {viewModel}=require("../ui/layout");
const {normalizeCommand}=require("./commands");
const clone = value => JSON.parse(JSON.stringify(value));

function createController({catalog, explain, onChange = () => {}}) {
  const state = {status:"idle", phase:"", exhibitId:null, answer:null, history:[], pending:null, error:null,
    layout:"standard", font:"normal", placement:"top", focus:"overview", length:"normal", page:0,
    inputMode:"text", queueCount:0, revision:0, notice:"请选择一件作品。", lastQuestion:"",errorKind:null,presentationRevision:0,pendingTranscript:null,lastTranscript:""};
  let active = null, queue = [], epoch = 0, sequence = 0, alive = true;
  let lastFailed = null,lastCompleted=null;
  const current = () => catalog.exhibits.find(e => e.id === state.exhibitId);
  const emit = () => {state.queueCount = queue.length; state.revision++; onChange(snapshot());};
  function snapshot() {
    const recoveryAction=state.status!=="error"?null:state.errorKind==="voice"?"record-again":state.errorKind==="presentation"?"redisplay":lastFailed?"retry-question":null;
    return clone({...state,recoveryAction,canRetry:recoveryAction==="retry-question"||recoveryAction==="redisplay"});
  }
  function clearError(){state.error=null;state.errorKind=null;lastFailed=null;}
  function restoreAnswerContext(){if(state.answer&&lastCompleted){state.focus=lastCompleted.focus;state.length=lastCompleted.length;state.lastQuestion=lastCompleted.question;state.lastTranscript=lastCompleted.transcript||"";}}
  function invalidate() {epoch++; if (active) active.abort.abort(); active = null; queue = [];state.pendingTranscript=null;}
  function reviewTranscript(raw) {
    const text=String(raw||"").trim();
    if(!text||Buffer.byteLength(text,"utf8")>4096){inputError("没有有效的识别文字，请重录。");return;}
    invalidate();restoreAnswerContext();clearError();state.pending=null;state.page=0;
    state.pendingTranscript=text;state.lastTranscript=text;state.inputMode="voice";
    state.status="confirm";state.phase="";state.notice="核对识别文字后确认；不对可重录，或用文字修改。";emit();
  }
  function confirmTranscript() {
    if(!state.pendingTranscript){state.notice="没有待确认的语音，请先录音。";emit();return;}
    const text=state.pendingTranscript;state.pendingTranscript=null;state.status=state.answer?"complete":"idle";
    submit(text,"voice");
  }
  function cancel() {
    invalidate(); state.pending=null; restoreAnswerContext();clearError(); state.status=state.answer?"complete":"idle";
    state.phase="";state.notice="已取消。";emit();
  }
  function select(id, question = "介绍这件作品", source = "text") {
    if (!catalog.exhibits.some(e => e.id === id)) throw new Error("展品不存在");
    invalidate();state.exhibitId=id;state.answer=null;state.history=[];state.pending=null;lastCompleted=null;clearError();
    if(source!=="voice")state.lastTranscript="";
    state.focus=topicOf(question,"overview")||"overview";state.length=/精简|简短|短一点|再短|两句/.test(question.replaceAll("精简卡",""))?"short":"normal";
    state.page=0;state.lastQuestion="";state.status="idle";lastFailed=null;
    run({question, source});
  }
  function requestConfirmation(candidates, question, source) {
    invalidate();clearError();state.page=0;state.pending={candidateIds:candidates.map(e=>e.id),question,source};
    state.status="confirm";state.phase="";state.notice="你指的是哪件作品？";emit();
  }
  function confirm(id) {
    const pending=state.pending;
    if (!pending || !pending.candidateIds.includes(id)) throw new Error("确认已失效，请重新选择作品");
    select(id, pending.question, pending.source);
  }
  function run(turn) {
    if (!alive) return;
    const exhibit = current();
    if (!exhibit) {requestConfirmation(catalog.exhibits,turn.question,turn.source);return;}
    const task={id:++sequence,epoch,exhibitId:exhibit.id,abort:new AbortController(),turn};
    const request={exhibitId:exhibit.id,question:turn.question,focus:state.focus,length:state.length,history:clone(state.history.slice(-6)),source:turn.source};
    active=task;state.status="processing";state.phase="generating";clearError();state.pending=null;
    state.lastQuestion=turn.question;state.notice="正在检索资料与组织讲解…";emit();
    const valid=()=>alive && active===task && task.epoch===epoch && state.exhibitId===task.exhibitId;
    task.done=Promise.resolve().then(()=>explain(request,{signal:task.abort.signal})).then(result=>{
      if (!valid()) return;
      validateAnswer(result,exhibit.facts);
      state.answer=clone(result);state.page=0;state.status="complete";state.phase="";
      lastCompleted={question:turn.question,focus:request.focus,length:request.length,transcript:request.source==="voice"?state.lastTranscript:""};
      state.notice=result.insufficientEvidence?"资料不足，已明确说明。":result.mode==="ai"?"AI 讲解 · 请核对资料依据":"资料摘录 · AI 未连接";
      state.history.push({question:turn.question,answer:result.answer,source:turn.source});
      state.history=state.history.slice(-12);lastFailed=null;
    }).catch(error=>{
      if (!valid()) return;
      state.status="error";state.phase="";state.page=0;state.errorKind="generation";
      state.error=error.name==="TimeoutError"?"讲解服务响应超时，请稍后重试。":/fetch failed|Failed to fetch|NetworkError|Load failed/i.test(error.message||"")?"暂时无法连接讲解服务，请检查网络后重试。":error.message||"请求失败";
      state.notice=state.answer?"请求失败，上一份讲解已保留。":"请求失败，可以重试或改用文字。";
      lastFailed=turn;
    }).finally(()=>{
      if (!valid()) return;
      active=null;
      if (state.status!=="error" && queue.length) run(queue.shift());
      else emit();
    });
  }
  function submit(raw, source="text") {
    if (!alive) return;
    const originalText=String(raw||"").trim();
    if (!originalText) return;
    if (Buffer.byteLength(originalText,"utf8")>4096) {state.notice="问题超过4096字节，请缩短。";emit();return;}
    const text=normalizeCommand(originalText);
    state.inputMode=source;
    const commandText=text.replace(/[\s。！？.!?，,、；;：:…]+$/u,"");
    if (commandText==="确认语音") return confirmTranscript();
    if (/^(取消|返回|\/cancel)$/.test(commandText)) return cancel();
    if (/^(重试|\/retry)$/.test(commandText)) return retry();
    if (/^(下一页|上一页)$/.test(commandText)) {
      const {pageIndex,pageCount}=viewModel(snapshot(),catalog),delta=commandText==="下一页"?1:-1;
      state.page=Math.max(0,Math.min(pageIndex+delta,pageCount-1));
      if(state.page===pageIndex)state.notice=delta>0?"已经是最后一页。":"已经是第一页。";
      emit();return;
    }
    const oldLayout=[state.font,state.layout,state.placement].join();
    if (/字大|放大字号|大字/.test(text)) state.font="large";
    if (/字小|普通字号|正常字号/.test(text)) state.font="normal";
    if (/只显示重点|精简卡/.test(text)) state.layout="compact";
    if (/重点卡|突出重点/.test(text)) state.layout="focus";
    if (/标准布局|恢复布局/.test(text)) state.layout="standard";
    if (/放下面|底部|下方/.test(text)) state.placement="bottom";
    if (/放上面|顶部|上方/.test(text)) state.placement="top";
    const layoutChanged=oldLayout!==[state.font,state.layout,state.placement].join();
    if (layoutChanged) {state.page=0;state.notice="显示布局已调整。";emit();}
    const matches=matchExhibits(catalog,text);
    if (state.pending) {
      const eligible=matches.filter(e=>state.pending.candidateIds.includes(e.id));
      if (eligible.length===1) return confirm(eligible[0].id);
      state.notice="请先从候选作品中选择，或取消。";emit();return;
    }
    if (matches.length>1) return requestConfirmation(matches,text,source);
    if (matches.length===1 && matches[0].id!==state.exhibitId) return select(matches[0].id,text,source);
    const short=/精简|简短|短一点|再短|两句/.test(text.replaceAll("精简卡",""));
    const expand=/详细|展开|多讲/.test(text);
    const focusChange=/背景|构图|材料/.test(text);
    const layoutIntent=/字大|放大字号|大字|字小|普通字号|正常字号|只显示重点|精简卡|重点卡|突出重点|标准布局|恢复布局|放下面|底部|下方|放上面|顶部|上方/.test(text);
    const pureLayout=layoutIntent && !short && !expand && !focusChange && !matches.length;
    if (pureLayout) {if(!layoutChanged){state.notice="当前已使用这个显示设置。";emit();}return;}
    if(state.pendingTranscript){state.pendingTranscript=null;state.status=state.answer?"complete":"idle";}
    if(source==="text")state.lastTranscript="";
    if (short) state.length="short";
    if (expand) state.length="normal";
    if (focusChange || (!short && !expand)) state.focus=topicOf(text,state.focus)||state.focus;
    if (!current()) return requestConfirmation(catalog.exhibits,text,source);
    const refinement=short||expand||focusChange;
    const question=(short||expand) && !focusChange && state.lastQuestion ? `${state.lastQuestion.split("\n修改要求：")[0]}\n修改要求：${text}` : text;
    const turn={question,source};
    if (active && refinement) {
      active.abort.abort();active=null;run(turn);return;
    }
    if (active) {
      if (queue.length>=3) {state.notice="等待队列已满，请稍后再问或取消。";emit();return;}
      queue.push(turn);state.notice="追问已排队。";emit();return;
    }
    if (state.status==="error") queue=[];
    run(turn);
  }
  function retry() {
    if(state.status==="error"&&state.errorKind==="presentation"&&state.answer){clearError();state.status="complete";state.presentationRevision++;state.notice="正在重新显示已有讲解。";emit();return;}
    if(state.status==="error"&&state.errorKind==="generation"&&lastFailed){const turn=lastFailed;run(turn);return;}
    state.notice=state.status==="error"&&state.errorKind==="voice"?"请重新录音，或直接输入文字。":"没有需要重试的任务。";emit();
  }
  function inputPhase(phase,notice) {if(phase==="permission"){invalidate();state.pending=null;}clearError();state.inputMode="voice";state.status="processing";state.phase=phase;state.notice=notice;emit();}
  function inputError(message) {invalidate();clearError();state.page=0;state.pending=null;state.status="error";state.phase="";state.errorKind="voice";state.error=message;state.notice="语音未完成，请重新录音或使用文字。";emit();}
  function presentationFailed() {invalidate();clearError();state.status="error";state.phase="";state.page=0;state.errorKind="presentation";state.error="显示更新失败，讲解内容已保留。";state.notice="可重新显示，无需再次生成讲解。";emit();}
  function suspend() {invalidate();restoreAnswerContext();clearError();state.pending=null;state.status=state.answer?"complete":"idle";state.phase="";state.notice="已暂停，返回后可继续。";emit();}
  async function settled() {while(active){await active.done;}}
  return {snapshot,submit,select,confirm,cancel,retry,reviewTranscript,confirmTranscript,inputPhase,inputError,presentationFailed,suspend,settled,
    notify(message){state.notice=message;emit();},
    dispose(){invalidate();alive=false;},get catalog(){return catalog;}};
}
module.exports={createController};

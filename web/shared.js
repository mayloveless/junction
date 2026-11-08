"use strict";(()=>{const Buffer={byteLength:value=>new TextEncoder().encode(value).length};const factories={};
factories["/domain/commands"]=function(require,module,exports){
"use strict";
// Match complete control clauses only: an art question mentioning fonts must
// remain a question. Both native text and ASR use this same normalization.
const rules=[
  [/^(?:confirm(?:\s+voice)?|确认语音)$/i,"确认语音"],
  [/^(?:(?:creative\s+)?background|tell\s+me\s+about\s+(?:the\s+)?background)$/i,"讲讲创作背景"],
  [/^(?:composition)$/i,"只讲构图"],
  [/^(?:materials?)$/i,"只讲材料"],
  [/^(?:font\s*size\s*(?:larger|bigger|large)|(?:larger|bigger|large)\s+(?:font|text)|(?:increase|enlarge)(?:\s+the)?\s+(?:font(?:\s+size)?|text))$/i,"字大一点"],
  [/^(?:font\s*size\s*(?:smaller|small|normal)|(?:smaller|small|normal)\s+(?:font|text)|(?:decrease|reduce|reset)(?:\s+the)?\s+font(?:\s+size)?)$/i,"普通字号"],
  [/^(?:compact(?:\s+(?:card|layout))?|精简卡)$/i,"精简卡"],
  [/^(?:focus(?:\s+(?:card|layout))?|重点卡)$/i,"重点卡"],
  [/^(?:(?:standard|normal|default)\s+(?:card|layout)|reset\s+layout|恢复布局|标准布局)$/i,"恢复布局"],
  [/^(?:(?:(?:move|put|place)(?:\s+it)?\s+(?:at|to)\s+)?(?:at\s+)?(?:the\s+)?bottom|放在底部)$/i,"放在底部"],
  [/^(?:(?:(?:move|put|place)(?:\s+it)?\s+(?:at|to)\s+)?(?:at\s+)?(?:the\s+)?top|放在顶部)$/i,"放在顶部"],
  [/^(?:(?:make\s+it\s+)?shorter|more\s+concise|再短一点)$/i,"再短一点"],
  [/^(?:more\s+detail(?:s)?|(?:make\s+it\s+)?longer|展开)$/i,"展开"],
  [/^(?:cancel|back|取消|返回)$/i,"取消"],
  [/^(?:retry|重试)$/i,"重试"],
  [/^(?:next\s+page|下一页)$/i,"下一页"],
  [/^(?:(?:previous|prev)\s+page|上一页)$/i,"上一页"],
  [/^(?:start\s+recording|开始录音)$/i,"开始录音"],
  [/^(?:(?:stop|finish|end)\s+recording|结束录音)$/i,"结束录音"],
  [/^(?:字大一点|普通字号)$/,"$original"],
];
function normalizeCommand(text){
  const clauses=text.trim().replace(/[。.!?！？]+$/u,"").split(/[,，;；]|\s+(?:and|then)\s+/i);
  const mapped=clauses.map(clause=>{
    const value=clause.trim().replace(/^please\s+/i,"").replace(/\s+please$/i,"");
    const rule=rules.find(([pattern])=>pattern.test(value));
    return rule?(rule[1]==="$original"?value:rule[1]):null;
  });
  return mapped.length&&mapped.every(Boolean)?mapped.join("，"):text;
}
module.exports={normalizeCommand};

};
factories["/domain/knowledge"]=function(require,module,exports){
"use strict";

function validateCatalog(catalog) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.exhibits) || catalog.exhibits.length < 3) throw new Error("需要至少三件有来源的展品");
  const sources = new Set(catalog.sources.map(s => s.id));
  const ids = new Set();
  for (const e of catalog.exhibits) {
    if (ids.has(e.id) || !e.title || !Array.isArray(e.facts) || !e.facts.length) throw new Error("展品格式或编号错误");
    ids.add(e.id);
    for (const fact of e.facts) {
      if (ids.has(fact.id) || !sources.has(fact.sourceId) || !fact.text || !Array.isArray(fact.topics)) throw new Error("资料缺少有效出处或ID重复");
      ids.add(fact.id);
    }
  }
  return catalog;
}

function matchExhibits(catalog, text) {
  const value = text.toLowerCase();
  const ordinal = value.match(/(?:第)?([一二三四五1-5])(?:号|件|幅)/);
  if (ordinal) {
    const number = Number(ordinal[1]) || "一二三四五".indexOf(ordinal[1]) + 1;
    return catalog.exhibits.filter(e => e.number === number);
  }
  const named = catalog.exhibits.filter(e => e.aliases.some(a => value.includes(a.toLowerCase())));
  if (named.length) return named;
  if (/风景|夜景|静物|花卉|田园/.test(text)) return catalog.exhibits.filter(e => e.categories.some(c => text.includes(c)));
  return [];
}

function topicOf(text, fallback = "overview") {
  if (/纽约|另一幅|是不是|区别|不同版本/.test(text)) return "identity";
  if (/谁画|作者|画家|他是谁/.test(text)) return "author";
  if (/哪年|年份|什么时候|年代/.test(text)) return "date";
  if (/材料|材质|油画|颜料/.test(text)) return "material";
  if (/构图|颜色|色彩|笔触|画面|看哪里/.test(text)) return "composition";
  if (/背景|为什么|缘由|动机|来历|故事|创作过程/.test(text)) return "background";
  if (/介绍|讲讲|讲解|讲了什么|画了什么|看看|什么作品|精简|简短|短一点|再短|两句|详细|展开/.test(text)) return fallback;
  return null;
}

function retrieve(exhibit, request) {
  const parts=request.question.split("\n修改要求："), latest=parts.at(-1);
  const focused=/背景|构图|材料/.test(latest);
  const question=focused?latest:parts[0];
  if (/价格|多少钱|估价|路线|怎么走|开放时间|几楼|展厅|人物是谁|人物身份|心里|内心|心理/.test(question)) return [];
  const topic = topicOf(question, request.focus || "overview");
  if (!topic) return [];
  const facts = exhibit.facts.filter(f => f.topics.includes(topic));
  return facts.length ? facts : [];
}

function validateAnswer(answer, facts) {
  const keys = ["answer", "evidenceIds", "insufficientEvidence", "mode"];
  if (!answer || keys.some(k => !Object.hasOwn(answer, k)) || typeof answer.answer !== "string" || !answer.answer.trim() || Array.from(answer.answer).length > 1000 || typeof answer.insufficientEvidence !== "boolean" || !Array.isArray(answer.evidenceIds) || !["evidence", "ai"].includes(answer.mode)) throw new Error("讲解返回格式无效");
  const allowed = new Set(facts.map(f => f.id));
  if (answer.evidenceIds.some(id => !allowed.has(id)) || (!answer.insufficientEvidence && !answer.evidenceIds.length)) throw new Error("讲解没有有效资料依据");
  return answer;
}

function evidenceAnswer(exhibit, request) {
  const facts = retrieve(exhibit, request);
  if (!facts.length) return {answer:"现有资料不足以回答这个问题。可以问创作年代、材料、背景或构图。", evidenceIds:[], insufficientEvidence:true, mode:"evidence"};
  let selected = facts;
  if (request.length === "short") selected = facts.slice(0, 1);
  return {answer:selected.map(f => request.length === "short" ? (f.shortText || f.text) : f.text).join("\n"), evidenceIds:selected.map(f => f.id), insufficientEvidence:false, mode:"evidence"};
}

module.exports = {validateCatalog, matchExhibits, topicOf, retrieve, validateAnswer, evidenceAnswer};

};
factories["/domain/controller"]=function(require,module,exports){
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

};
factories["/ui/layout"]=function(require,module,exports){
"use strict";
const FONT_SIZE={normal:24,large:32};
const STATUS={idle:"待命",processing:"处理中",confirm:"待确认",complete:"完成",error:"异常"};
const FOCUS={overview:"重点讲解",background:"创作背景",composition:"构图与色彩",material:"作品材料",author:"作者",date:"创作年代",identity:"作品版本"};
function paginate(text,columns,rows) {
  const pages=[], lines=[];
  for(const paragraph of text.split("\n")){
    const units=paragraph.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu)||[];
    if(!units.length){lines.push("");continue;}
    let line=[],used=0;
    for(const unit of units){
      const chars=Array.from(unit);
      if(chars.length<=columns){
        if(used+chars.length>columns){
          const tail=line.at(-1),tailSize=tail?Array.from(tail).length:0;
          const carry=line.length>1&&tailSize+chars.length<=columns&&(/^[，。！？、：；）】》」』]/u.test(unit)||/[（【《「『]$/u.test(tail));
          if(carry){line.pop();lines.push(line.join(""));line=[tail];used=tailSize;}
          else{lines.push(line.join(""));line=[];used=0;}
        }
        line.push(unit);used+=chars.length;
      }else{
        for(const char of chars){if(used===columns){lines.push(line.join(""));line=[];used=0;}line.push(char);used++;}
      }
    }
    if(line.length)lines.push(line.join(""));
  }
  for(let i=0;i<lines.length;i+=rows)pages.push(lines.slice(i,i+rows).join("\n"));
  return pages.length?pages:[""];
}
function viewModel(state,catalog) {
  const exhibit=catalog.exhibits.find(e=>e.id===state.exhibitId);
  const size=FONT_SIZE[state.font]||24;
  let body=state.answer?.answer||"选一件作品，开始提问。\n语音与文字共享当前作品。";
  if(state.status==="processing"&&!state.answer)body=state.phase==="permission"?"等待麦克风授权。\n也可以取消后使用文字。":state.phase==="recording"?"正在听你说话。\n说完后结束录音。":state.phase==="transcribing"?"正在识别语音。\n可取消或改用文字。":"正在读取展品资料，组织讲解。\n请稍候，可随时取消。";
  if(state.status==="confirm")body=state.pendingTranscript?`识别为：${state.pendingTranscript}\n当前作品：${exhibit?.title||"尚未选择"}\n核对后选择“确认语音”或输入 confirm；不对可重录或改用文字。`:"请选择你指的作品：\n"+state.pending.candidateIds.map(id=>catalog.exhibits.find(e=>e.id===id)).map(e=>`${e.number}. ${e.title}`).join("\n");
  if(state.status==="error"){
    const advice=state.errorKind==="voice"?"请重新录音，或改用文字。":state.errorKind==="presentation"?"重新显示即可，无需再次生成。":state.answer?"可重试讲解，或返回上一份讲解。":"可重试讲解，或改用文字。";
    body=`${state.error}\n\n${advice}`;
  }
  const height=state.layout==="compact"?128:state.layout==="focus"?184:216;
  const columns=Math.floor(560/size), rows=Math.max(1,Math.floor(height/(size+8)));
  const pages=paginate(body,columns,rows), page=Math.max(0,Math.min(state.page,pages.length-1));
  const facts=["confirm","error"].includes(state.status)?[]:exhibit?.facts.filter(f=>state.answer?.evidenceIds.includes(f.id))||[];
  const sourceIds=[...new Set(facts.map(f=>f.sourceId))];
  const sources=catalog.sources.filter(s=>sourceIds.includes(s.id));
  const recovery=state.status==="error"?{title:state.errorKind==="voice"?"语音没有完成":state.errorKind==="presentation"?"显示需要重试":"讲解没有完成",message:state.error||"请求未完成，请重试。",action:state.recoveryAction,
    buttonLabel:state.recoveryAction==="record-again"?"重新录音":state.recoveryAction==="redisplay"?"重新显示":"重试讲解",hasPreviousAnswer:Boolean(state.answer)}:null;
  return {title:state.layout==="focus"&&exhibit?(FOCUS[state.focus]||FOCUS.overview):exhibit?exhibit.title:"观展搭档",subtitle:exhibit?`${state.layout==="focus"?exhibit.title:exhibit.artist} · ${exhibit.year}`:"选择作品 · 以资料为依据",
    status:STATUS[state.status],body:pages[page],bodyY:state.placement==="bottom"?Math.max(108,320-height):108,bodyHeight:height,fontSize:size,
    footnote:`历史展览 · ${page+1}/${pages.length} · ${state.inputMode==="voice"?"语音":"文字"} · ${state.layout==="compact"?"精简卡":state.layout==="focus"?"重点卡":"标准卡"}`,
    notice:state.lastTranscript&&state.status==="complete"?`识别：${Array.from(state.lastTranscript).slice(0,28).join("")}${Array.from(state.lastTranscript).length>28?"…":""}`:state.notice,sourceLabel:sources.length?"依据："+sources.map(s=>s.title.split(" · ")[0]).join(" / "):"",sources,pageCount:pages.length,pageIndex:page,hasPreviousPage:page>0,hasNextPage:page<pages.length-1,recovery,
    phaseLabel:state.status==="processing"?({permission:"等待麦克风",recording:"正在录音",transcribing:"正在识别",generating:"正在生成讲解"}[state.phase]||"正在处理"):"",queueCount:state.queueCount||0};
}
module.exports={paginate,viewModel};

};
const cache={};
function resolve(from,name){const items=[];for(const part of (from.slice(0,from.lastIndexOf('/'))+'/'+name).split('/')){if(part==='..')items.pop();else if(part&&part!=='.')items.push(part);}return '/'+items.join('/');}
function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};if(!factories[id])throw Error('Missing module '+id);factories[id](name=>load(resolve(id,name)),module,module.exports);return module.exports;}
window.ExhibitStatic={createController:load('/domain/controller').createController,evidenceAnswer:load('/domain/knowledge').evidenceAnswer,viewModel:load('/ui/layout').viewModel};
})();
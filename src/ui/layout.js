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

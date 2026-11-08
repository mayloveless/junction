"use strict";
const fs=require("node:fs");
const os=require("@irisview/osx/os");
const input=require("@irisview/osx/os/input");
const ui=require("@irisview/osx/fusionui");
const {applicationDataPath}=require("./application-data");
const {createController}=require("./domain/controller");
const {validateCatalog}=require("./domain/knowledge");
const {createServiceClient}=require("./services/client");
const {createVoiceAdapter}=require("./input/voice");
const {viewModel}=require("./ui/layout");
const {normalizeCommand}=require("./domain/commands");
const catalog=validateCatalog(require("./data/exhibition.json"));
const retained={};

function label(parent,x,y,w,h,size,text=""){
  const item=ui.Text.create();item.setParent(parent);item.setIgnoreLayout(true);item.setPosition([x,y,0]);item.setSize([w,h,0]);
  item.setLongMode(ui.Text.LongMode.LONG_WRAP);item.setText(text);
  const style=item.getLocalStyle();style.setTextColor(ui.Color.fromRGB8(0,230,0));style.setTextAlign(ui.TextAlign.TOP_LEFT);
  const font=ui.Font.getCachedFont("",size,0,0);if(font)style.setTextFont(font);return item;
}
function button(text,index,action){
  const view=ui.View.create();view.setParent(retained.board);view.setIgnoreLayout(true);
  view.setPosition([24+(index%4)*150,392+Math.floor(index/4)*38,0]);view.setSize([142,32,0]);
  const paint=focused=>view.getLocalStyle().setBackgroundColor(ui.Color.fromRGB8(0,focused?65:16,0));paint(false);
  view.onFocus.add((_args,focused)=>paint(focused));
  const caption=label(view,6,3,130,26,18,text);retained.buttons.push({view,caption});
  retained.focus.add(view,action);
}
function command(text){
  text=normalizeCommand(text);
  if(text==="开始录音"){
    if(retained.voice.busy){retained.controller.notify("上一段语音尚未结束，请稍后或选择结束录音。");return;}
    retained.controller.suspend();retained.voice.start();return;
  }
  if(text==="结束录音"){retained.voice.finish();return;}
  retained.voice.cancel();retained.controller.submit(text,"text");
}
function render(){
  const state=retained.controller.snapshot();
  if(state.revision===retained.revision)return;
  retained.revision=state.revision;
  const vm=viewModel(state,catalog);
  retained.title.setText(vm.title);retained.subtitle.setText(vm.subtitle);retained.status.setText(vm.status);
  retained.body.setPosition([32,vm.bodyY,0]);retained.body.setSize([576,vm.bodyHeight,0]);retained.body.setText(vm.body);
  const font=ui.Font.getCachedFont("",vm.fontSize,0,0);if(font)retained.body.getLocalStyle().setTextFont(font);
  retained.notice.setText(vm.notice);retained.source.setText(vm.sourceLabel);retained.footer.setText(vm.footnote);
  retained.buttons.slice(0,catalog.exhibits.length).forEach((button,index)=>button.view.setDisabled(Boolean(state.pending&&!state.pending.candidateIds.includes(catalog.exhibits[index].id))));
  retained.buttons[3].caption.setText(state.pendingTranscript?"确认语音":vm.recovery?.buttonLabel||"开始录音");
  retained.buttons[5].view.setDisabled(!vm.hasPreviousPage);retained.buttons[6].view.setDisabled(!vm.hasNextPage);
  retained.buttons[7].caption.setText(state.status==="error"&&state.answer?"返回讲解":"取消 / 返回");
  const key=JSON.stringify([state.answer,state.font,state.layout,state.placement,state.page,state.presentationRevision]);
  if(state.status!=="complete"){retained.fence=null;retained.presentKey=null;}
  if(state.status==="complete" && key!==retained.presentKey){
    retained.presentKey=key;retained.fence=retained.root.requestPresentation();retained.fenceStarted=Date.now();
  }
}
function observeFence(){
  if(!retained.fence)return;
  const status=retained.fence.getState();
  if(status===ui.PresentationState.Presented){retained.fence=null;console.log("EXHIBIT_PRESENTED");}
  else if(status===ui.PresentationState.Failed || Date.now()-retained.fenceStarted>10000){
    retained.fence=null;retained.controller.presentationFailed();
  }
}
function tick(){
  retained.frame=null;if(!retained.active)return;
  try{
    retained.voice.pump();
    for(let i=0;i<32;i++){
      const action=input.takeNavigationAction();if(action===null)break;
      if(action==="back"){retained.voice.cancel();retained.controller.cancel();}else retained.focus.handle(action);
    }
    for(let i=0;i<8;i++){const value=input.takeTextInput();if(value===null)break;command(value.text);}
    render();observeFence();
  }catch(error){retained.controller.inputError(error.message);}
  retained.frame=os.requestAnimationFrame(tick);
}
function start(){
  if(retained.window)return;
  let settings={};try{settings=JSON.parse(fs.readFileSync(applicationDataPath("service.json"),"utf8"));}catch{}
  const services=createServiceClient(settings.baseURL||"http://127.0.0.1:4317");
  const property=os.WindowProperty.create();property.setTitle("观展搭档");property.setSize([0.64,0.48,0.01]);
  retained.window=os.Window.create(property);retained.root=ui.FusionRoot.acquireFusionRootFromWindow(retained.window);
  retained.board=ui.Board.create();retained.board.setParent(retained.root.getRootWidget());retained.board.setIgnoreLayout(true);retained.board.setSize([640,480,0]);
  retained.board.getLocalStyle().setBackgroundColor(ui.Color.fromRGB8(0,0,0));
  retained.title=label(retained.board,32,20,440,40,28);retained.status=label(retained.board,490,24,120,32,20);
  retained.subtitle=label(retained.board,32,64,560,28,18);retained.body=label(retained.board,32,108,576,216,24);
  retained.source=label(retained.board,32,324,570,24,16);retained.notice=label(retained.board,32,350,570,24,16);
  retained.footer=label(retained.board,32,374,570,18,14);
  retained.focus=input.FocusGroup.create(retained.window);input.requestWindowFocus(retained.window);retained.buttons=[];
  retained.controller=createController({catalog,explain:services.explain});
  retained.voice=createVoiceAdapter({input,transcribe:services.transcribe,onText:text=>retained.controller.reviewTranscript(text),
    onPhase:(phase,text)=>retained.controller.inputPhase(phase,text),onError:text=>retained.controller.inputError(text)});
  const shortTitles=["向日葵","罗讷河星夜","柏树麦田"];
  catalog.exhibits.forEach((e,index)=>button(`${e.number} ${shortTitles[index]||e.title}`,index,()=>{
    retained.voice.cancel();const state=retained.controller.snapshot();
    if(state.pending)retained.controller.confirm(e.id);else retained.controller.select(e.id);
  }));
  button("开始录音",3,()=>{const state=retained.controller.snapshot(),action=state.recoveryAction;command(state.pendingTranscript?"确认语音":action==="retry-question"||action==="redisplay"?"重试":"开始录音");});button("结束录音",4,()=>command("结束录音"));
  button("上一页",5,()=>command("上一页"));button("下一页",6,()=>command("下一页"));button("取消 / 返回",7,()=>command("取消"));
  retained.revision=-1;retained.focus.move("next");resume();
  console.log("EXHIBIT_READY historical-exhibition; audio requires Client and ASR service");
}
function resume(){
  if(!retained.window||retained.active)return;
  if(retained.cleanup){clearInterval(retained.cleanup);retained.cleanup=null;}
  retained.active=true;retained.frame=os.requestAnimationFrame(tick);
}
function pause(){
  retained.active=false;if(retained.frame!==null)os.cancelAnimationFrame(retained.frame);retained.frame=null;
  retained.voice.cancel();retained.controller.suspend();retained.fence=null;
  if(!retained.cleanup)retained.cleanup=setInterval(()=>{retained.voice.pump();if(!retained.voice.busy){clearInterval(retained.cleanup);retained.cleanup=null;}},20);
}
os.App.createApp(lifecycle=>{
  if(lifecycle===os.AppLifecycle.ON_CREATE)start();
  else if(lifecycle===os.AppLifecycle.ON_FOREGROUND||lifecycle===os.AppLifecycle.ON_REOPEN)resume();
  else if(lifecycle===os.AppLifecycle.ON_BACKGROUND)pause();
  else if(lifecycle===os.AppLifecycle.ON_DESTROY){
    if(!retained.window)return;pause();if(retained.cleanup)clearInterval(retained.cleanup);
    retained.voice.dispose();retained.controller.dispose();retained.focus.dispose();
    for(const key of Object.keys(retained))delete retained[key];
  }
});

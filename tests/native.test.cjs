"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), Module=require("node:module");
// Native contract smoke only: these doubles are NOT a renderer or a device test.
test("原生入口仅用公开模块；创建、输入、呈现与销毁可接线",async()=>{
  let lifecycle,frame,frameId=0,fenceState=1,presentations=0,fetchCount=0;const submissions=[],widgets=[],frames=new Map(),activations=[];
  class Widget{
    constructor(){this.onFocus={add(){}};this.style={setTextColor(){},setTextAlign(){},setTextFont(){},setBackgroundColor(){}};widgets.push(this);}
    setParent(){}setIgnoreLayout(){}setPosition(){}setSize(){}setLongMode(){}setDisabled(){}setText(value){this.text=value;}getLocalStyle(){return this.style;}
    static create(){return new this();}
  }
  class Text extends Widget{}Text.LongMode={LONG_WRAP:0};
  const root={getRootWidget(){return new Widget();},requestPresentation(){presentations++;return {getState:()=>fenceState};}};
  const ui={Text,View:Widget,Board:Widget,Color:{fromRGB8(){}},Font:{getCachedFont:()=>({})},TextAlign:{TOP_LEFT:0},FusionRoot:{acquireFusionRootFromWindow:()=>root},PresentationState:{Presented:1,Failed:2}};
  const os={App:{createApp:fn=>lifecycle=fn},AppLifecycle:{ON_CREATE:0,ON_DESTROY:1,ON_FOREGROUND:2,ON_BACKGROUND:3,ON_REOPEN:4},WindowProperty:{create:()=>({setTitle(){},setSize(){}})},Window:{create:()=>({})},requestAnimationFrame(fn){frame=fn;frames.set(++frameId,fn);return frameId;},cancelAnimationFrame(id){frames.delete(id);}};
  const input={FocusGroup:{create:()=>({add(_widget,fn){activations.push(fn);},handle(){},move(){},dispose(){}})},requestWindowFocus(){},takeNavigationAction:()=>null,takeTextInput:()=>submissions.shift()||null,getVoiceInputAvailability:()=>({canRequest:false,reason:"unsupported"})};
  const originalLoad=Module._load, originalFetch=global.fetch;
  Module._load=function(name,...rest){if(name==="@irisview/osx/os")return os;if(name==="@irisview/osx/os/input")return input;if(name==="@irisview/osx/fusionui")return ui;return originalLoad.call(this,name,...rest);};
  global.fetch=async()=>{fetchCount++;return new Response(JSON.stringify({answer:"梵高1888年的作品",evidenceIds:["sun-basic"],insufficientEvidence:false,mode:"evidence"}),{headers:{"Content-Type":"application/json"}});};
  try{
    delete require.cache[require.resolve("../src/index")];require("../src/index");lifecycle(0);assert.equal(activations.length,8);frame();assert.ok(widgets.some(w=>w.text==="观展搭档"));
    submissions.push({text:"讲讲向日葵"});frame();await new Promise(r=>setImmediate(r));frame();assert.ok(widgets.some(w=>w.text==="梵高1888年的作品"));
    fenceState=0;submissions.push({text:"字大一点"});frame();fenceState=2;submissions.push({text:"作者是谁"});frame();frame();assert.ok(!widgets.some(w=>w.text==="异常"),"旧呈现失败不能污染新任务");
    fenceState=1;await new Promise(r=>setImmediate(r));frame();
    fenceState=0;submissions.push({text:"普通字号"});frame();fenceState=2;frame();frame();
    assert.ok(widgets.some(w=>w.text==="重新显示"));const callsBefore=fetchCount,presentBefore=presentations;
    activations[3]();frame();assert.equal(fetchCount,callsBefore);assert.ok(presentations>presentBefore,"显示重试必须请求新的呈现回执");fenceState=1;frame();
    lifecycle(3);lifecycle(2);frame();lifecycle(1);assert.equal(frames.has(frameId),false);
  }finally{Module._load=originalLoad;global.fetch=originalFetch;delete require.cache[require.resolve("../src/index")];}
});

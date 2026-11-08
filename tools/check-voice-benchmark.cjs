"use strict";
// Calls only the configured local ASR endpoint. Controller checks use evidence mode.
const fs=require("node:fs"),path=require("node:path");
const {createServiceClient}=require("../src/services/client");
const {createController}=require("../src/domain/controller");
const {evidenceAnswer}=require("../src/domain/knowledge");
const catalog=require("../src/data/exhibition.json");
const root=path.join(__dirname,".."),dir=path.join(root,"artifacts/voice-benchmark");
const normal=text=>text.normalize("NFKC").replace(/[\p{P}\p{S}\p{Z}\s]/gu,"").toLowerCase();
function editDistance(a,b){
  const left=Array.from(a),right=Array.from(b);let row=Array.from({length:right.length+1},(_,i)=>i);
  for(let i=0;i<left.length;i++){const next=[i+1];for(let j=0;j<right.length;j++)next[j+1]=Math.min(next[j]+1,row[j+1]+1,row[j]+(left[i]===right[j]?0:1));row=next;}
  return row[right.length];
}
async function checkIntent(caseId,text){
  const controller=createController({catalog,explain:request=>evidenceAnswer(catalog.exhibits.find(e=>e.id===request.exhibitId),request)});
  try{
    if(!["sunflowers","rhone","cypresses"].includes(caseId)){controller.select(catalog.exhibits[0].id);await controller.settled();}
    if(caseId==="restore"){controller.submit("字大一点，只显示重点","text");await controller.settled();}
    controller.submit(text,"voice");await controller.settled();const state=controller.snapshot();
    const expectations={
      sunflowers:()=>state.exhibitId===catalog.exhibits[0].id,
      rhone:()=>state.exhibitId===catalog.exhibits[1].id,
      cypresses:()=>state.exhibitId===catalog.exhibits[2].id&&state.focus==="composition",
      short:()=>state.length==="short",
      layout:()=>state.font==="large"&&state.placement==="bottom",
      ambiguous:()=>state.status==="confirm"&&state.pending.candidateIds.length===2,
      restore:()=>state.font==="normal"&&state.layout==="standard",
      cancel:()=>state.notice==="已取消。"
    };
    return {passed:expectations[caseId](),exhibitId:state.exhibitId,focus:state.focus,length:state.length,font:state.font,placement:state.placement,status:state.status};
  }finally{controller.dispose();}
}
(async()=>{
  const replay=process.argv.includes("--replay");
  let record;
  if(replay){
    const file=path.join(dir,"results.json");record=JSON.parse(fs.readFileSync(file));
    const baseline=path.join(dir,"results-before-fix.json");if(!fs.existsSync(baseline))fs.copyFileSync(file,baseline);
    for(const item of record.records){item.intentBeforeFix=item.intentBeforeFix||item.intent;item.intent=await checkIntent(item.caseId,item.text);}
    record.intentReplay={checkedAt:new Date().toISOString(),newAsrRequests:0};
  }else{
    const manifest=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"))),client=createServiceClient("http://127.0.0.1:4317");
    const health=await(await fetch("http://127.0.0.1:4317/api/health")).json();if(!health.asrConfigured)throw new Error("ASR未配置");
    record={checkedAt:new Date().toISOString(),model:health.asrModel,fixtureType:manifest.fixtureType,limitations:manifest.limitations,records:[]};
  const save=()=>fs.writeFileSync(path.join(dir,"results.json"),JSON.stringify(record,null,2)+"\n");
  for(const fixture of manifest.fixtures){
    const item={...fixture};const start=Date.now();
    try{
      item.text=await client.transcribe(fs.readFileSync(path.join(dir,fixture.file)));item.latencyMs=Date.now()-start;
      const expected=normal(fixture.expected),actual=normal(item.text);
      item.characterErrors=editDistance(expected,actual);item.characterCount=Array.from(expected).length;
      item.missingKeywords=fixture.keywords.filter(word=>!actual.includes(normal(word)));
      item.intent=await checkIntent(fixture.caseId,item.text);
    }catch(error){item.error=error.message;item.latencyMs=Date.now()-start;}
    record.records.push(item);save();console.log(JSON.stringify({caseId:item.caseId,condition:item.condition,text:item.text,missingKeywords:item.missingKeywords,intentPassed:item.intent?.passed,error:item.error}));
    if(item.error)throw new Error(item.error);
  }
  }
  record.summary=Object.fromEntries(["quiet","white-noise-15dB"].map(condition=>{
    const group=record.records.filter(r=>r.condition===condition),times=group.map(r=>r.latencyMs).sort((a,b)=>a-b);
    return [condition,{samples:group.length,exactMatches:group.filter(r=>r.characterErrors===0).length,keywordPassed:group.filter(r=>!r.missingKeywords.length).length,intentPassed:group.filter(r=>r.intent.passed).length,characterErrors:group.reduce((a,r)=>a+r.characterErrors,0),characterCount:group.reduce((a,r)=>a+r.characterCount,0),medianLatencyMs:(times[3]+times[4])/2,maxLatencyMs:times.at(-1)}];
  }));fs.writeFileSync(path.join(dir,"results.json"),JSON.stringify(record,null,2)+"\n");console.log(JSON.stringify({summary:record.summary,replayOnly:replay}));
})().catch(error=>{console.error(JSON.stringify({status:"failed",message:error.message}));process.exitCode=1;});

"use strict";
// Uses synthetic test speech. Never reads or prints API keys; calls the local backend.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createController}=require("../src/domain/controller");
const {createServiceClient}=require("../src/services/client");
const catalog=require("../src/data/exhibition.json");
const root=path.join(__dirname,".."),base="http://127.0.0.1:4317";
(async()=>{
  const health=await(await fetch(base+"/api/health")).json();
  assert.equal(health.aiConfigured,true,"AI未配置");assert.equal(health.asrConfigured,true,"ASR未配置");
  const client=createServiceClient(base),controller=createController({catalog,explain:client.explain});
  const record={checkedAt:new Date().toISOString(),fixtureType:"synthetic-macOS-Tingting",asrModel:health.asrModel,aiModel:health.aiModel,records:[]};
  async function transcribe(name,expected){
    const wav=fs.readFileSync(path.join(root,`artifacts/asr-fixture-${name}.wav`)),start=Date.now();
    const text=await client.transcribe(wav);
    const item={fixture:name,expected,durationSeconds:(wav.length-44)/32000,latencyMs:Date.now()-start,text};
    record.records.push(item);console.log(JSON.stringify(item));return text;
  }
  try{
    const text=await transcribe("question","介绍梵高的向日葵，讲讲创作背景。");
    assert.match(text,/向日葵/);assert.match(text,/背景/);
    const start=Date.now();controller.submit(text,"voice");await controller.settled();
    const first=controller.snapshot();
    assert.equal(first.status,"complete");assert.equal(first.exhibitId,catalog.exhibits[0].id);
    assert.equal(first.answer.mode,"ai");assert.equal(first.history.at(-1).source,"voice");
    assert.ok(first.answer.evidenceIds.includes("sun-background"));
    record.voiceExplanation={latencyMs:Date.now()-start,answer:first.answer,exhibitId:first.exhibitId};
    const layout=await transcribe("layout","字大一点，放在底部。");
    controller.submit(layout,"voice");await controller.settled();
    const changed=controller.snapshot();assert.equal(changed.font,"large");assert.equal(changed.placement,"bottom");
    assert.deepEqual(changed.history,first.history);record.voiceLayout={font:changed.font,placement:changed.placement};
    controller.submit("再短一点","text");await controller.settled();
    const last=controller.snapshot();assert.equal(last.status,"complete");assert.equal(last.length,"short");
    assert.equal(last.history.at(-1).source,"text");assert.equal(last.history.length,first.history.length+1);
    record.textFollowup={answer:last.answer,historySources:last.history.map(t=>t.source)};
    record.status="pass";
  }catch(error){record.status="failed";record.error=error.message;throw error;}
  finally{
    controller.dispose();fs.writeFileSync(path.join(root,"artifacts/voice-live-check.json"),JSON.stringify(record,null,2)+"\n");
    console.log(JSON.stringify({status:record.status,asrModel:record.asrModel,aiModel:record.aiModel}));
  }
})().catch(error=>{console.error(JSON.stringify({status:"failed",message:error.message}));process.exitCode=1;});

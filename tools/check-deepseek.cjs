"use strict";
const path=require("node:path"),fs=require("node:fs");
process.loadEnvFile(path.join(__dirname,"../.env"));
const {createProviders}=require("../backend/providers.cjs");
const catalog=require("../src/data/exhibition.json");
const provider=createProviders({catalog});
(async()=>{
  const records=[];
  for(const question of ["讲讲创作背景","这幅画现在值多少钱"]){
    const start=Date.now();const result=await provider.explain({exhibitId:catalog.exhibits[0].id,question,focus:"background",length:"short",history:[]});
    records.push({question,latencyMs:Date.now()-start,...result});
  }
  const record={checkedAt:new Date().toISOString(),provider:"deepseek",model:provider.status().aiModel,records};
  fs.writeFileSync(path.join(__dirname,"../artifacts/deepseek-live-check.json"),JSON.stringify(record,null,2)+"\n");
  console.log(JSON.stringify({provider:record.provider,model:record.model,checks:records.map(r=>({question:r.question,latencyMs:r.latencyMs,insufficientEvidence:r.insufficientEvidence,evidenceIds:r.evidenceIds})),status:"pass"}));
})().catch(error=>{console.error(JSON.stringify({status:"failed",message:error.message}));process.exitCode=1;});

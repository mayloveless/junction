"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {validateCatalog}=require("../src/domain/knowledge");
const {createProviders}=require("../backend/providers.cjs");
const catalog=require("../src/data/exhibition.json");
const root=path.join(__dirname,"..");
function inspectEnvironment({env=process.env,platform=process.platform,arch=process.arch,osRelease="",nodeVersion=process.versions.node,npmVersion="",native=false}={}){
  const checks={};const check=(key,ok,detail)=>checks[key]={status:ok?"pass":"fail",detail};
  check("node",nodeVersion==="24.13.0",{actual:nodeVersion,required:"24.13.0"});
  check("npm",npmVersion==="11.6.2",{actual:npmVersion,required:"11.6.2"});
  try{validateCatalog(catalog);check("catalog",true,{id:catalog.id,exhibits:catalog.exhibits.length});}catch{check("catalog",false,"展品资料校验未通过");}
  check("package",fs.existsSync(path.join(root,"artifacts/exhibit.companion.fuiapp")),"artifacts/exhibit.companion.fuiapp");
  let services;
  try{services=createProviders({catalog,env}).status();check("serviceConfig",true,{...services});}catch{check("serviceConfig",false,"服务商或接口配置无效，请核对.env模板");}
  check("backendPort",!env.PORT||env.PORT==="4317","原生默认后端地址为127.0.0.1:4317，本启动脚本使用此端口");
  if(native){
    check("architecture",platform==="linux"&&arch==="x64",{platform,arch,required:"linux x64"});
    const values=Object.fromEntries(osRelease.split("\n").map(line=>{const at=line.indexOf("=");return at<0?["",""]:[line.slice(0,at),line.slice(at+1).replace(/^['"]|['"]$/g,"")];}));
    check("ubuntu",values.ID==="ubuntu"&&["22.04","26.04"].includes(values.VERSION_ID),{id:values.ID||"unknown",version:values.VERSION_ID||"unknown"});
    check("display",Boolean(env.DISPLAY),"原生Client需要Ubuntu图形桌面会话及DISPLAY；详细图形/库检查以SDK doctor为准");
  }
  return {schemaVersion:1,kind:"exhibit-companion-preflight",checkedAt:new Date().toISOString(),scope:native?"native-host-preflight":"portable-project-only",status:Object.values(checks).every(c=>c.status==="pass")?"pass":"fail",checks,
    notes:["配置凭证不等于在线服务已验证。","未填写密钥时可使用资料摘录模式；语音需独立ASR凭证。","本脚本不调用外部模型、不输出密钥。"]};
}
async function probeService(fetchImpl=fetch){
  try{
    const response=await fetchImpl("http://127.0.0.1:4317/api/health",{signal:AbortSignal.timeout(1500)});
    if(!response.ok)return {code:4,message:"4317端口响应异常，未确认是本应用服务"};
    const data=await response.json();
    if(data.catalogId!==catalog.id||!["evidence","deepseek","openai"].includes(data.answerMode)||typeof data.aiConfigured!=="boolean")return {code:4,message:"4317端口不是预期的观展搭档服务"};
    return {code:0,message:`观展搭档后端已就绪：${data.answerMode}，ASR${data.asrConfigured?"已配置":"未配置"}`};
  }catch(error){return error.cause?.code==="ECONNREFUSED"?{code:3,message:"4317端口没有服务"}:{code:4,message:"无法确认4317端口状态；未关闭其他进程"};}
}
async function main(){
  const envFile=path.join(root,".env");if(fs.existsSync(envFile)){try{process.loadEnvFile(envFile);}catch{throw new Error("无法读取.env，请检查文件格式");}}
  const args=process.argv.slice(2);
  if(args.includes("--probe-service")||args.includes("--wait-service")){
    const wait=args.includes("--wait-service"),deadline=Date.now()+10000;
    let status;
    do{status=await probeService();if(!wait||status.code!==3||Date.now()>=deadline)break;await new Promise(resolve=>setTimeout(resolve,200));}while(true);
    console.log(status.message);process.exitCode=status.code;return;
  }
  if(args.some(arg=>arg!=="--native"))throw new Error("用法：node tools/check-env.cjs [--native | --probe-service | --wait-service]");
  let npmVersion="missing",osRelease="";
  try{npmVersion=execFileSync("npm",["--version"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();}catch{}
  try{osRelease=fs.readFileSync("/etc/os-release","utf8");}catch{}
  const report=inspectEnvironment({npmVersion,osRelease,native:args.includes("--native")});
  console.log(JSON.stringify(report,null,2));process.exitCode=report.status==="pass"?0:1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={inspectEnvironment,probeService};

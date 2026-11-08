"use strict";
const http=require("node:http"), fs=require("node:fs"), path=require("node:path");
const {randomUUID}=require("node:crypto");
const {createProviders}=require("./providers.cjs");
const {createController}=require("../src/domain/controller");
const {validateCatalog}=require("../src/domain/knowledge");
const {viewModel}=require("../src/ui/layout");
const defaultCatalog=require("../src/data/exhibition.json");

function createServer({catalog=defaultCatalog,env=process.env,fetchImpl=fetch}={}) {
  validateCatalog(catalog);
  const providers=createProviders({catalog,env,fetchImpl}), sessions=new Map();
  const assets={"/":"index.html","/preview.js":"preview.js","/preview.css":"preview.css","/recorder.js":"recorder.js"};
  const send=(res,status,value)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(value));};
  async function read(req,limit){
    const buffers=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error("请求过大");buffers.push(chunk);}
    return Buffer.concat(buffers);
  }
  function checkQuestion(value){
    if(!value||typeof value.question!=="string"||!value.question.trim()||Buffer.byteLength(value.question)>4096||!["normal","short",undefined].includes(value.length))throw new Error("问题或长度参数无效");
    const history=Array.isArray(value.history)?value.history.slice(-6).filter(x=>x&&typeof x.question==="string"&&typeof x.answer==="string").map(x=>({question:x.question.slice(0,1000),answer:x.answer.slice(0,1000)})):[];
    return {exhibitId:value.exhibitId,question:value.question,focus:typeof value.focus==="string"?value.focus.slice(0,40):"overview",length:value.length||"normal",history};
  }
  function getSession(id){
    const session=sessions.get(id);if(!session)throw new Error("预览会话不存在，请刷新页面");session.time=Date.now();return session;
  }
  const server=http.createServer(async(req,res)=>{
    const abort=new AbortController();res.on("close",()=>{if(!res.writableEnded)abort.abort();});
    try{
      const origin=req.headers.origin;
      if(origin && origin!==`http://${req.headers.host}`)return send(res,403,{error:"不接受跨站请求"});
      const url=new URL(req.url,"http://127.0.0.1");
      if(req.method==="GET" && assets[url.pathname]){
        const file=path.join(__dirname,"../preview",assets[url.pathname]);
        res.writeHead(200,{"Content-Type":file.endsWith(".js")?"text/javascript; charset=utf-8":file.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8",
          "Content-Security-Policy":"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'","Cache-Control":"no-store"});
        return res.end(fs.readFileSync(file));
      }
      if(req.method==="GET" && url.pathname==="/api/health")return send(res,200,{...providers.status(),nativeSimulator:"not-run",catalogId:catalog.id});
      if(req.method==="GET" && url.pathname==="/api/catalog")return send(res,200,catalog);
      if(req.method==="POST" && url.pathname==="/api/explain")return send(res,200,await providers.explain(checkQuestion(JSON.parse((await read(req,65536)).toString("utf8"))),{signal:abort.signal}));
      if(req.method==="POST" && url.pathname==="/api/transcribe"){
        if(req.headers["content-type"]!=="audio/wav")throw new Error("需要audio/wav录音");
        return send(res,200,await providers.transcribe(await read(req,1920044),{signal:abort.signal}));
      }
      if(req.method==="POST" && url.pathname==="/api/sessions"){
        for(const [id,s] of sessions)if(Date.now()-s.time>1800000){s.controller.dispose();sessions.delete(id);}
        if(sessions.size>=32)throw new Error("预览会话数量已满");
        const id=randomUUID(), controller=createController({catalog,explain:providers.explain});
        sessions.set(id,{controller,time:Date.now()});return send(res,201,{id,state:controller.snapshot()});
      }
      const match=url.pathname.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(command))?$/);
      if(match){
        const {controller}=getSession(match[1]);
        if(req.method==="POST" && match[2]){
          const value=JSON.parse((await read(req,8192)).toString("utf8"));
          if(value.action==="select")controller.select(value.exhibitId);
          else if(value.action==="confirm")controller.confirm(value.exhibitId);
          else if(value.action==="cancel")controller.cancel();
          else if(value.action==="retry")controller.retry();
          else if(value.action==="voice-phase"){
            if(!["permission","recording","transcribing"].includes(value.phase))throw new Error("语音阶段无效");
            if(value.phase==="permission")controller.cancel();
            const notices={permission:"等待麦克风权限…",recording:"正在录音，说完后结束并发送。",transcribing:"正在识别语音…"};
            controller.inputPhase(value.phase,notices[value.phase]);
          }
          else if(value.action==="voice-error"){
            if(typeof value.message!=="string"||!value.message.trim()||value.message.length>400)throw new Error("语音错误信息无效");
            controller.inputError(value.message);
          }
          else if(value.action==="submit"){
            if(typeof value.text!=="string"||!["text","voice","voice-test",undefined].includes(value.source))throw new Error("输入参数无效");
            controller.submit(value.text,value.source==="voice-test"||value.source==="voice"?"voice":"text");
          }else throw new Error("未知预览操作");
        }else if(req.method!=="GET")return send(res,405,{error:"方法不支持"});
        const state=controller.snapshot();return send(res,200,{state,view:viewModel(state,catalog)});
      }
      send(res,404,{error:"路径不存在"});
    }catch(error){if(!res.destroyed&&!res.writableEnded)send(res,400,{error:error.message||"请求失败"});}
  });
  server.on("close",()=>{for(const s of sessions.values())s.controller.dispose();sessions.clear();});
  return server;
}
if(require.main===module){
  const envFile=path.join(__dirname,"../.env");if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  const server=createServer();server.listen(Number(process.env.PORT)||4317,"127.0.0.1",()=>console.log("观展搭档开发预览：http://127.0.0.1:"+server.address().port));
}
module.exports={createServer};

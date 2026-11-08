"use strict";
// Local UI fixture only: no .env, no real keys, no external requests.
const {createServer}=require("../backend/server.cjs");
const failures=new Set();
const server=createServer({env:{ANSWER_MODE:"deepseek",DEEPSEEK_API_KEY:"local-ui-fixture-not-real",AI_MODEL:"界面测试数据 · 非真实AI",ASR_PROVIDER:"siliconflow"},fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body),input=JSON.parse(body.messages[1].content),question=input.question;
  if(question.includes("触发失败")&&!failures.has(question)){failures.add(question);return new Response("",{status:503});}
  await new Promise(resolve=>setTimeout(resolve,100));
  const fact=input.exhibit.facts.find(f=>f.topics.includes(input.focus))||input.exhibit.facts[0];
  const text=input.length==="short"?fact.shortText||fact.text:(fact.text+"\n").repeat(8).trim();
  return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({answer:text,evidenceIds:[fact.id],insufficientEvidence:false})}}]}),{headers:{"Content-Type":"application/json"}});
}});
server.listen(4318,"127.0.0.1",()=>console.log("本地界面验收：http://127.0.0.1:4318（固定测试响应，不调用外部模型）"));

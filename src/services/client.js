"use strict";
function createServiceClient(baseURL, fetchImpl=fetch) {
  const base=new URL(baseURL);
  if(!["http:","https:"].includes(base.protocol))throw new Error("后端地址必须是HTTP(S)");
  async function post(path,body,type,signal) {
    const timeout=AbortSignal.timeout(30000);
    const response=await fetchImpl(new URL(path,base),{method:"POST",headers:{"Content-Type":type},body,
      signal:signal?AbortSignal.any([signal,timeout]):timeout});
    let value;
    try{value=await response.json();}catch{throw new Error("后端未返回有效JSON");}
    if(!response.ok)throw new Error(value.error||`后端请求失败 (${response.status})`);
    return value;
  }
  return {
    explain(request,{signal}={}){return post("/api/explain",JSON.stringify(request),"application/json",signal);},
    async transcribe(wav,{signal}={}){return (await post("/api/transcribe",wav,"audio/wav",signal)).text;}
  };
}
module.exports={createServiceClient};

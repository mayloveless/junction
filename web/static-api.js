"use strict";
// This is a real local evidence-based experience, not a simulated AI provider.
(()=>{
  const nativeFetch=window.fetch.bind(window),sessions=new Map();let serial=0;
  const catalogReady=nativeFetch(new URL('./catalog.json',document.baseURI)).then(r=>r.json());
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  window.fetch=async(resource,options={})=>{
    const url=new URL(typeof resource==='string'?resource:resource.url,document.baseURI);
    if(!url.pathname.startsWith('/api/'))return nativeFetch(resource,options);
    try{
      const catalog=await catalogReady;
      if(url.pathname==='/api/catalog')return response(catalog);
      if(url.pathname==='/api/health')return response({answerMode:'evidence',aiConfigured:false,asrConfigured:false,catalogId:catalog.id});
      if(url.pathname==='/api/sessions'){
        const id=String(++serial);const controller=ExhibitStatic.createController({catalog,explain:async request=>ExhibitStatic.evidenceAnswer(catalog.exhibits.find(e=>e.id===request.exhibitId),request)});
        sessions.set(id,controller);return response({id,state:controller.snapshot()},201);
      }
      const match=url.pathname.match(/^\/api\/sessions\/(\d+)(?:\/(command))?$/);
      if(!match||!sessions.has(match[1]))throw Error('会话不存在，请刷新页面');
      const controller=sessions.get(match[1]);
      if(match[2]){
        const value=JSON.parse(options.body||'{}');
        if(value.action==='select')controller.select(value.exhibitId);
        else if(value.action==='confirm')controller.confirm(value.exhibitId);
        else if(value.action==='cancel')controller.cancel();
        else if(value.action==='retry')controller.retry();
        else if(value.action==='submit')controller.submit(value.text,'text');
        else throw Error('公开体验只支持文字和资料交互');
      }
      const state=controller.snapshot();
      return response({state,view:window.ExhibitStatic.viewModel(state,catalog)});
    }catch(error){return response({error:error.message},400);}
  };
})();

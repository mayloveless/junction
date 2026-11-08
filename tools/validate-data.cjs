"use strict";
const {validateCatalog}=require("../src/domain/knowledge");
const catalog=validateCatalog(require("../src/data/exhibition.json"));
for(const e of catalog.exhibits)for(const fact of e.facts){
  const source=catalog.sources.find(s=>s.id===fact.sourceId);
  if(!source.url.startsWith("https://")||!source.locator)throw new Error("来源缺少网址或文档定位");
}
console.log(`${catalog.title}：${catalog.exhibits.length}件作品，${catalog.exhibits.reduce((n,e)=>n+e.facts.length,0)}条来源可定位的摘要。历史展览，非实时导览。`);

"use strict";

function validateCatalog(catalog) {
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.exhibits) || catalog.exhibits.length < 3) throw new Error("需要至少三件有来源的展品");
  const sources = new Set(catalog.sources.map(s => s.id));
  const ids = new Set();
  for (const e of catalog.exhibits) {
    if (ids.has(e.id) || !e.title || !Array.isArray(e.facts) || !e.facts.length) throw new Error("展品格式或编号错误");
    ids.add(e.id);
    for (const fact of e.facts) {
      if (ids.has(fact.id) || !sources.has(fact.sourceId) || !fact.text || !Array.isArray(fact.topics)) throw new Error("资料缺少有效出处或ID重复");
      ids.add(fact.id);
    }
  }
  return catalog;
}

function matchExhibits(catalog, text) {
  const value = text.toLowerCase();
  const ordinal = value.match(/(?:第)?([一二三四五1-5])(?:号|件|幅)/);
  if (ordinal) {
    const number = Number(ordinal[1]) || "一二三四五".indexOf(ordinal[1]) + 1;
    return catalog.exhibits.filter(e => e.number === number);
  }
  const named = catalog.exhibits.filter(e => e.aliases.some(a => value.includes(a.toLowerCase())));
  if (named.length) return named;
  if (/风景|夜景|静物|花卉|田园/.test(text)) return catalog.exhibits.filter(e => e.categories.some(c => text.includes(c)));
  return [];
}

function topicOf(text, fallback = "overview") {
  if (/纽约|另一幅|是不是|区别|不同版本/.test(text)) return "identity";
  if (/谁画|作者|画家|他是谁/.test(text)) return "author";
  if (/哪年|年份|什么时候|年代/.test(text)) return "date";
  if (/材料|材质|油画|颜料/.test(text)) return "material";
  if (/构图|颜色|色彩|笔触|画面|看哪里/.test(text)) return "composition";
  if (/背景|为什么|缘由|动机|来历|故事|创作过程/.test(text)) return "background";
  if (/介绍|讲讲|讲解|讲了什么|画了什么|看看|什么作品|精简|简短|短一点|再短|两句|详细|展开/.test(text)) return fallback;
  return null;
}

function retrieve(exhibit, request) {
  const parts=request.question.split("\n修改要求："), latest=parts.at(-1);
  const focused=/背景|构图|材料/.test(latest);
  const question=focused?latest:parts[0];
  if (/价格|多少钱|估价|路线|怎么走|开放时间|几楼|展厅|人物是谁|人物身份|心里|内心|心理/.test(question)) return [];
  const topic = topicOf(question, request.focus || "overview");
  if (!topic) return [];
  const facts = exhibit.facts.filter(f => f.topics.includes(topic));
  return facts.length ? facts : [];
}

function validateAnswer(answer, facts) {
  const keys = ["answer", "evidenceIds", "insufficientEvidence", "mode"];
  if (!answer || keys.some(k => !Object.hasOwn(answer, k)) || typeof answer.answer !== "string" || !answer.answer.trim() || Array.from(answer.answer).length > 1000 || typeof answer.insufficientEvidence !== "boolean" || !Array.isArray(answer.evidenceIds) || !["evidence", "ai"].includes(answer.mode)) throw new Error("讲解返回格式无效");
  const allowed = new Set(facts.map(f => f.id));
  if (answer.evidenceIds.some(id => !allowed.has(id)) || (!answer.insufficientEvidence && !answer.evidenceIds.length)) throw new Error("讲解没有有效资料依据");
  return answer;
}

function evidenceAnswer(exhibit, request) {
  const facts = retrieve(exhibit, request);
  if (!facts.length) return {answer:"现有资料不足以回答这个问题。可以问创作年代、材料、背景或构图。", evidenceIds:[], insufficientEvidence:true, mode:"evidence"};
  let selected = facts;
  if (request.length === "short") selected = facts.slice(0, 1);
  return {answer:selected.map(f => request.length === "short" ? (f.shortText || f.text) : f.text).join("\n"), evidenceIds:selected.map(f => f.id), insufficientEvidence:false, mode:"evidence"};
}

module.exports = {validateCatalog, matchExhibits, topicOf, retrieve, validateAnswer, evidenceAnswer};

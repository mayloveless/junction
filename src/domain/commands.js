"use strict";
// Match complete control clauses only: an art question mentioning fonts must
// remain a question. Both native text and ASR use this same normalization.
const rules=[
  [/^(?:confirm(?:\s+voice)?|确认语音)$/i,"确认语音"],
  [/^(?:(?:creative\s+)?background|tell\s+me\s+about\s+(?:the\s+)?background)$/i,"讲讲创作背景"],
  [/^(?:composition)$/i,"只讲构图"],
  [/^(?:materials?)$/i,"只讲材料"],
  [/^(?:font\s*size\s*(?:larger|bigger|large)|(?:larger|bigger|large)\s+(?:font|text)|(?:increase|enlarge)(?:\s+the)?\s+(?:font(?:\s+size)?|text))$/i,"字大一点"],
  [/^(?:font\s*size\s*(?:smaller|small|normal)|(?:smaller|small|normal)\s+(?:font|text)|(?:decrease|reduce|reset)(?:\s+the)?\s+font(?:\s+size)?)$/i,"普通字号"],
  [/^(?:compact(?:\s+(?:card|layout))?|精简卡)$/i,"精简卡"],
  [/^(?:focus(?:\s+(?:card|layout))?|重点卡)$/i,"重点卡"],
  [/^(?:(?:standard|normal|default)\s+(?:card|layout)|reset\s+layout|恢复布局|标准布局)$/i,"恢复布局"],
  [/^(?:(?:(?:move|put|place)(?:\s+it)?\s+(?:at|to)\s+)?(?:at\s+)?(?:the\s+)?bottom|放在底部)$/i,"放在底部"],
  [/^(?:(?:(?:move|put|place)(?:\s+it)?\s+(?:at|to)\s+)?(?:at\s+)?(?:the\s+)?top|放在顶部)$/i,"放在顶部"],
  [/^(?:(?:make\s+it\s+)?shorter|more\s+concise|再短一点)$/i,"再短一点"],
  [/^(?:more\s+detail(?:s)?|(?:make\s+it\s+)?longer|展开)$/i,"展开"],
  [/^(?:cancel|back|取消|返回)$/i,"取消"],
  [/^(?:retry|重试)$/i,"重试"],
  [/^(?:next\s+page|下一页)$/i,"下一页"],
  [/^(?:(?:previous|prev)\s+page|上一页)$/i,"上一页"],
  [/^(?:start\s+recording|开始录音)$/i,"开始录音"],
  [/^(?:(?:stop|finish|end)\s+recording|结束录音)$/i,"结束录音"],
  [/^(?:字大一点|普通字号)$/,"$original"],
];
function normalizeCommand(text){
  const clauses=text.trim().replace(/[。.!?！？]+$/u,"").split(/[,，;；]|\s+(?:and|then)\s+/i);
  const mapped=clauses.map(clause=>{
    const value=clause.trim().replace(/^please\s+/i,"").replace(/\s+please$/i,"");
    const rule=rules.find(([pattern])=>pattern.test(value));
    return rule?(rule[1]==="$original"?value:rule[1]):null;
  });
  return mapped.length&&mapped.every(Boolean)?mapped.join("，"):text;
}
module.exports={normalizeCommand};

"""Build a key-free, server-free GitHub Pages experience from shared app logic."""
from pathlib import Path
import json
import shutil

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'web'
OUT.mkdir(exist_ok=True)
names={'/domain/commands':'src/domain/commands.js','/domain/knowledge':'src/domain/knowledge.js','/domain/controller':'src/domain/controller.js','/ui/layout':'src/ui/layout.js'}
parts=['"use strict";(()=>{const Buffer={byteLength:value=>new TextEncoder().encode(value).length};const factories={};']
for name,file in names.items():
    parts.append('factories['+json.dumps(name)+']=function(require,module,exports){\n'+(ROOT/file).read_text()+'\n};')
parts.append('''const cache={};
function resolve(from,name){const items=[];for(const part of (from.slice(0,from.lastIndexOf('/'))+'/'+name).split('/')){if(part==='..')items.pop();else if(part&&part!=='.')items.push(part);}return '/'+items.join('/');}
function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};if(!factories[id])throw Error('Missing module '+id);factories[id](name=>load(resolve(id,name)),module,module.exports);return module.exports;}
window.ExhibitStatic={createController:load('/domain/controller').createController,evidenceAnswer:load('/domain/knowledge').evidenceAnswer,viewModel:load('/ui/layout').viewModel};
})();''')
(OUT/'shared.js').write_text('\n'.join(parts))
(OUT/'catalog.json').write_text((ROOT/'src/data/exhibition.json').read_text())
for name in ['preview.css','preview.js','recorder.js']:
    shutil.copy2(ROOT/'preview'/name,OUT/name)
public_js=(OUT/'preview.js').read_text().replace('语音服务尚未配置，请先使用文字。','此公开页面提供文字交互；语音流程见下方视频和原生说明。')
(OUT/'preview.js').write_text(public_js)
html=(ROOT/'preview/index.html').read_text().replace('href="/preview.css"','href="./preview.css"').replace('src="/recorder.js"','src="./recorder.js"').replace('src="/preview.js"','src="./preview.js"')
html=html.replace('观展搭档 · 开发预览','观展搭档 · 在线交互演示').replace('原型 01 / 开发预览','公开交互演示 / 资料摘录')
html=html.replace('共享业务逻辑的浏览器开发预览；眼镜光学效果与原生 SDK 运行需另行验证。','浏览器交互演示：使用馆方资料摘录，支持选品、追问、布局和资料不足处理。AI与语音能力请看原生演示说明。')
html=html.replace('浏览器使用本机麦克风。眼镜端采音与原生显示仍需在 SDK Client 中验证。','公开页面不连接模型或录音服务，不收集密钥。原生SDK应用另有独立实现。')
html=html.replace('语音提问','原生语音说明').replace('说出你的问题','原生语音能力').replace('结束录音后发送给语音服务识别，最长60秒。取消会停止录音并放弃本次结果。','原生语音流程与验收边界见视频；公开静态页面不采音。')
html=html.replace('<script src="./recorder.js">','<script src="./shared.js"></script><script src="./static-api.js"></script><script src="./recorder.js">')
html=html.replace('<section class="conversation">','<section class="conversation" id="demo-video"><h3>演示视频</h3><p>视频中的原生SDK模拟器与浏览器交互均有明确标注。语音仍需继续真人验收。</p><video controls preload="metadata" poster="./media/poster.jpg" style="width:100%;max-height:560px;background:#080d0b" src="./media/demo.mp4"></video></section><section class="conversation">')
(OUT/'index.html').write_text(html)
record_css='''<style>body{width:1280px;min-width:1280px}header{padding:16px 32px}main{padding:20px 32px}.intro{margin:0 0 16px}.intro h1{font-size:38px;margin:5px 0}.intro .eyebrow{display:none}.intro p{margin:5px 0}.workspace{display:grid!important;grid-template-columns:704px 1fr!important;gap:22px;align-items:start}.viewer{padding:20px}.screen-wrap{width:640px;height:480px}.voice-panel,.service,.conversation,footer{display:none!important}aside{padding-top:0}aside h3{margin:8px 0}.exhibits button{padding:9px 12px}.exhibits{gap:7px}textarea{min-height:60px}.chips{gap:6px}.chips button{font-size:14px;padding:8px 10px}.sources{font-size:12px}#error:empty{display:none}</style>'''
(OUT/'record.html').write_text(html.replace('</head>',record_css+'</head>').replace('公开交互演示 / 资料摘录','录制画面 / 浏览器资料摘录').replace('演示视频</h3>','演示视频</h3>'))
(OUT/'.nojekyll').write_text('')
print('Built key-free public demo:',OUT)

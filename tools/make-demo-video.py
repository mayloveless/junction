"""Cut genuine UI operation captures into a captioned 90-second demo.

No invented recognition results. Native SDK stills and the browser evidence
experience are explicitly distinguished. Optional offline macOS narration.
"""
from pathlib import Path
import json
import os
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts/recording'
SHOTS=ROOT/'submission/screenshots'
MEDIA=ROOT/'web/media'
FONT=Path(os.environ.get('EXHIBIT_FONT',str(ROOT.parent/'vendor/IrisView-Developer-Kit-v1.0.0/runtime/share/fonts/SourceHanSansSC-Medium.otf')))
for folder in [WORK,SHOTS,MEDIA]:folder.mkdir(exist_ok=True,parents=True)
assert FONT.is_file(),'Set EXHIBIT_FONT to a Chinese font file'
def run(args):subprocess.run(list(map(str,args)),check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
run(['ffmpeg','-y','-i',ROOT/'artifacts/ubuntu-vm/navigation-settled.png','-vf','crop=640:480:160:104','-frames:v','1',SHOTS/'00-native-sdk.png'])
scenes=[
 (6,None,'观展搭档','Exhibit Companion\n让作品，接着你的问题说。','面向自由观展人群，观展搭档让讲解跟着问题走。'),
 (8,'00-native-sdk.png','原生 SDK 运行画面','Ubuntu + IrisView 模拟器实际运行截图；非语音识别实录','原生应用已在官方模拟器运行，显示作品讲解和资料依据。'),
 (7,'02-select.png','01 / 选择作品','浏览器交互演示 · 馆方资料摘录模式','公开体验从三件作品中选择，先明确正在讨论的对象。'),
 (8,'03-background.png','02 / 继续追问创作背景','同一件作品，切换关注点；保留资料出处','继续询问创作背景，讲解围绕当前作品，保留馆方资料出处。'),
 (7,'04-short.png','03 / 让讲解更精简','连续修改内容，保持当前作品与关注点','要求更精简，系统沿用作品与关注点，缩短当前讲解。'),
 (6,'05-large.png','04 / 调整字号','显示操作在本地处理，不重新生成讲解','字号调整直接改变显示，不需要重新生成讲解。'),
 (7,'06-layout.png','05 / 精简卡放到底部','内容与显示分开调整，保留同一段上下文','精简卡放到底部，让观众按自己的阅读习惯调整。'),
 (8,'07-ambiguity.png','06 / 不确定时，先确认','“这幅风景画”对应两件作品，不擅自猜测','当风景画指向多个候选，先请用户确认，不擅自猜测。'),
 (7,'08-confirm.png','07 / 确认后继续原问题','切换至奥赛博物馆收藏的《罗讷河上的星夜》','确认后，切换到对应作品，再接着原来的问题讲解。'),
 (7,'09-insufficient.png','08 / 资料不足，明确说明','没有价格资料时，不编造估价','没有估价资料时，明确说明不足，并提示可询问的范围。'),
 (10,None,'语音链路：先核对，再讲解','采音 → 转写原文与当前作品 → confirm → 讲解\n已实现；真人识别效果仍需继续优化','原生语音先显示转写原文和当前作品，确认后才讲解。识别效果仍需继续优化。'),
 (9,None,'代码、视频、在线体验，都在仓库','GitHub / mayloveless / junction\n在线体验：GitHub Pages 静态资料模式\n不含摄像头识别、全馆导航或真眼镜验收结论','代码和材料放在同一仓库。在线版提供静态交互体验，原生和语音能力边界如实标注。'),
]
metadata=[];elapsed=0
for index,(duration,image,title,subtitle,narration) in enumerate(scenes):
    print('Rendering',index+1,title,flush=True)
    titlefile=WORK/f'{index:02}-title.txt';subfile=WORK/f'{index:02}-subtitle.txt';speechfile=WORK/f'{index:02}-speech.txt'
    titlefile.write_text(title);subfile.write_text(subtitle);speechfile.write_text(narration)
    audio=WORK/f'{index:02}.aiff'
    if not shutil.which('say'):raise RuntimeError('This video builder uses offline macOS say narration')
    run(['say','-v','Tingting','-r','205','-o',audio,'-f',speechfile])
    probe=subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(audio)],text=True)
    tempo=max(1,float(probe)/max(1,duration-.5))
    inputs=['ffmpeg','-y']
    if image:
        inputs+=['-loop','1','-framerate','12','-i',SHOTS/image]
        base="scale=1160:790:force_original_aspect_ratio=decrease,pad=1280:960:(ow-iw)/2:130:color=0x0d1e18"
        titley=30;suby=87;size=35;subsize=19
    else:
        inputs+=['-f','lavfi','-i','color=c=0x0d1e18:s=1280x960:r=12']
        base='null';titley=250;suby=390;size=60;subsize=30
    vf=base+f",drawtext=fontfile='{FONT}':textfile='{titlefile}':expansion=none:fontcolor=0xd6f4d2:fontsize={size}:x=60:y={titley},drawtext=fontfile='{FONT}':textfile='{subfile}':expansion=none:fontcolor=0xa3b9ab:fontsize={subsize}:line_spacing=18:x=60:y={suby}"
    # Every scene is source-labelled. Narration is synthesized, not an ASR sample.
    vf+=f",drawtext=fontfile='{FONT}':text='真实界面操作画面剪辑 · 合成旁白':expansion=none:fontcolor=0x8ca291:fontsize=16:x=60:y=932"
    clip=WORK/f'scene-{index:02}.mp4'
    run(inputs+['-i',audio,'-t',duration,'-vf',vf,'-af',f'atempo={tempo:.4f},apad,atrim=duration={duration}', '-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-r','24','-c:a','aac','-b:a','128k','-ar','48000','-ac','2',clip])
    metadata.append({'start':elapsed,'duration':duration,'title':title,'source':image or 'editorial-title-card','narration':narration});elapsed+=duration
concat=WORK/'concat.txt';concat.write_text(''.join("file '"+str(WORK/f'scene-{i:02}.mp4')+"'\n" for i in range(len(scenes))))
run(['ffmpeg','-y','-f','concat','-safe','0','-i',concat,'-c','copy','-movflags','+faststart',MEDIA/'demo.mp4'])
run(['ffmpeg','-y','-ss','18','-i',MEDIA/'demo.mp4','-frames:v','1','-q:v','3',MEDIA/'poster.jpg'])
(ROOT/'submission/video-scenes.json').write_text(json.dumps({'durationSeconds':elapsed,'format':'UI capture montage, not an unbroken screencast','narration':'offline macOS Tingting speech synthesis','scenes':metadata},ensure_ascii=False,indent=2)+'\n')
print('Created',MEDIA/'demo.mp4',elapsed,'seconds',flush=True)

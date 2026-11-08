"""Generate reproducible synthetic speech and white-noise fixtures, never human recordings."""
from pathlib import Path
import array
import json
import math
import random
import subprocess
import sys
import wave

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts" / "voice-benchmark"
CASES = [
    ("sunflowers", "介绍梵高的向日葵，讲讲高更和这组画的关系。", ["梵高", "向日葵", "高更"]),
    ("rhone", "我想了解罗讷河上的星夜。", ["罗讷河", "星夜"]),
    ("cypresses", "切换到有柏树的麦田，只讲构图。", ["柏树", "麦田", "构图"]),
    ("short", "再短一点，最多两句话。", ["短一点", "两句"]),
    ("layout", "字大一点，放在底部。", ["字大", "底部"]),
    ("ambiguous", "这幅风景画讲了什么？", ["风景画"]),
    ("restore", "字小一点，恢复布局。", ["字小", "恢复布局"]),
    ("cancel", "取消。", ["取消"]),
]

def save_wav(path, samples):
    data = array.array("h", samples)
    if sys.byteorder != "little":
        data.byteswap()
    with wave.open(str(path), "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(16000)
        writer.writeframes(data.tobytes())

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fixtures = []
    for index, (case_id, text, keywords) in enumerate(CASES):
        aiff = OUT / f"{case_id}.aiff"
        pcm = OUT / f"{case_id}.pcm"
        subprocess.run(["/usr/bin/say", "-v", "Tingting", "-r", "160", "-o", str(aiff), text], check=True)
        subprocess.run(["/usr/local/bin/ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(aiff), "-ar", "16000", "-ac", "1", "-f", "s16le", str(pcm)], check=True)
        speech = array.array("h")
        speech.frombytes(pcm.read_bytes())
        if sys.byteorder != "little":
            speech.byteswap()
        rms = math.sqrt(sum(value * value for value in speech) / len(speech))
        rng = random.Random(20261107 + index)
        noise = [rng.gauss(0, 1) for _ in speech]
        noise_rms = math.sqrt(sum(value * value for value in noise) / len(noise))
        gain = rms / (10 ** (15 / 20)) / noise_rms
        noisy = [max(-32768, min(32767, round(value + background * gain))) for value, background in zip(speech, noise)]
        for condition, samples in [("quiet", speech), ("white-noise-15dB", noisy)]:
            filename = f"{case_id}-{condition}.wav"
            save_wav(OUT / filename, samples)
            fixtures.append({"caseId": case_id, "condition": condition, "file": filename, "expected": text, "keywords": keywords, "durationSeconds": len(speech) / 16000})
    manifest = {"fixtureType": "synthetic-macOS-Tingting", "limitations": "单一合成说话人；白噪声不是展厅人声、回声或眼镜麦克风实录。", "fixtures": fixtures}
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"已生成{len(fixtures)}段合成测试音频；包含安静与15dB信噪比白噪声两组。")

if __name__ == "__main__":
    main()

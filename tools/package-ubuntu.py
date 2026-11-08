"""Assemble a private local transfer bundle; omit .env and machine-specific state."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile
import argparse

ROOT=Path(__file__).resolve().parents[1]
SDK_NAME='IrisView-Developer-Kit-v1.0.0-LLVISION-v2.tar.gz'
NODE_NAME='node-v24.13.0-linux-x64.tar.xz'
NODE_SHA='e798599612f4bb71333a3397ab0d095fd62214e115aea45aa858a145fc72d67e'
PREFIX=Path('Exhibit-Companion-Ubuntu')
EXCLUDED={'.git','node_modules','artifacts','dist','__pycache__','.tools','.logs','.state'}

def digest(file):
    hasher=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1048576),b''):hasher.update(chunk)
    return hasher.hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--sdk-archive',type=Path,default=ROOT.parent/'downloads'/SDK_NAME if (ROOT.parent/'downloads'/SDK_NAME).is_file() else Path.home()/'Downloads'/SDK_NAME)
    parser.add_argument('--node-archive',type=Path,default=ROOT.parent/'downloads'/NODE_NAME if (ROOT.parent/'downloads'/NODE_NAME).is_file() else ROOT/'artifacts/ubuntu-inputs'/NODE_NAME)
    args=parser.parse_args();SDK=args.sdk_archive;NODE=args.node_archive
    assert SDK.is_file() and NODE.is_file(),'SDK或Linux Node压缩包缺失'
    assert digest(NODE)==NODE_SHA,'Linux Node官方SHA256不匹配'
    out=ROOT/'artifacts/exhibit-companion-ubuntu.tar.gz'
    git_bundle=ROOT/'artifacts/source-history.bundle'
    if git_bundle.exists():git_bundle.unlink()
    subprocess.run(['git','-C',str(ROOT),'bundle','create',str(git_bundle),'HEAD'],check=True,capture_output=True)
    entries={}
    def add_file(archive,file,relative):
        archive.add(file,arcname=str(PREFIX/relative),recursive=False)
        entries[str(relative)]=digest(file)
    def add_bytes(archive,content,relative,mode=0o644):
        data=content.encode();info=tarfile.TarInfo(str(PREFIX/relative));info.size=len(data);info.mode=mode
        archive.addfile(info,io.BytesIO(data));entries[str(relative)]=hashlib.sha256(data).hexdigest()
    with tarfile.open(out,'w:gz',compresslevel=4) as archive:
        for file in sorted(ROOT.rglob('*')):
            rel=file.relative_to(ROOT)
            if not file.is_file() or file.is_symlink() or set(rel.parts)&EXCLUDED or file.name=='.DS_Store':continue
            if file.name.startswith('.env') and file.name!='.env.example':continue
            add_file(archive,file,Path('app')/rel)
        for name in ['exhibit.companion.fuiapp','verification.json']:
            add_file(archive,ROOT/'artifacts'/name,Path('app/artifacts')/name)
        add_file(archive,SDK,Path('downloads')/SDK.name)
        add_file(archive,NODE,Path('downloads')/NODE.name)
        add_file(archive,git_bundle,Path('source-history.bundle'))
        add_file(archive,ROOT/'docs/Ubuntu首次运行.md',Path('START-HERE.md'))
        add_bytes(archive,'#!/usr/bin/env bash\nset -euo pipefail\nexhibit_transfer_root=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)\ncd "$exhibit_transfer_root"\nsha256sum --check --status SHA256SUMS\nexec bash app/tools/setup-ubuntu.sh --with-host-deps\n',Path('setup.sh'),0o755)
        checks=''.join(f'{sha}  {name}\n' for name,sha in sorted(entries.items()))
        add_bytes(archive,checks,Path('SHA256SUMS'))
    secrets=[]
    for line in ((ROOT/'.env').read_text() if (ROOT/'.env').exists() else '').splitlines():
        key,sep,value=line.partition('=')
        if sep and 'KEY' in key and value.strip():secrets.append(value.strip().strip('\"\'').encode())
    objects=subprocess.run(['git','-C',str(ROOT),'rev-list','--objects','HEAD'],check=True,capture_output=True,text=True).stdout
    object_ids='\n'.join(line.split(' ',1)[0] for line in objects.splitlines())+'\n'
    history=subprocess.run(['git','-C',str(ROOT),'cat-file','--batch'],input=object_ids.encode(),check=True,capture_output=True).stdout
    assert not any(secret in history for secret in secrets),'Git历史含实际密钥，未通过迁移包检查'
    with tarfile.open(out,'r:gz') as archive:
        for member in archive.getmembers():
            assert not member.issym() and not member.islnk()
            assert Path(member.name).name!='.env'
            if member.isfile() and member.size<5000000:
                data=archive.extractfile(member).read()
                assert not any(secret in data for secret in secrets),'迁移包含实际密钥'
    metadata={'file':out.name,'bytes':out.stat().st_size,'sha256':digest(out),'includesCredentials':False,'includesLinuxNode':True,'includesSdk':True,'originalGitBaselineIncluded':True}
    (ROOT/'artifacts/ubuntu-bundle.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(metadata,ensure_ascii=False))

if __name__=='__main__':main()

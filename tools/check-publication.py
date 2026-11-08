"""Check planned Git-visible files/history against locally configured secrets.
Never print a credential, and never stage, commit, push, or rewrite history.
"""
from pathlib import Path
import json
import subprocess

ROOT=Path(__file__).resolve().parents[1]
secrets=[]
env=ROOT/'.env'
if env.exists():
    for line in env.read_text().splitlines():
        key,sep,value=line.partition('=')
        if sep and 'KEY' in key and value.strip():secrets.append(value.strip().strip('\"\'').encode())
listed=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).split(b'\0')
files=sorted({item.decode() for item in listed if item})
issues=[]
for name in files:
    p=ROOT/name
    if not p.is_file():continue
    if p.name=='.env' or (p.name.startswith('.env.') and p.name!='.env.example'):issues.append({'file':name,'reason':'credential configuration is Git-visible'})
    if p.stat().st_size>=50*1024*1024:issues.append({'file':name,'reason':'file is 50 MiB or larger'})
    if any(secret in p.read_bytes() for secret in secrets):issues.append({'file':name,'reason':'contains an actual configured credential'})
objects=subprocess.check_output(['git','rev-list','--all','--objects'],cwd=ROOT,text=True)
ids='\n'.join(row.split(' ',1)[0] for row in objects.splitlines())+'\n'
history=subprocess.run(['git','cat-file','--batch'],cwd=ROOT,input=ids.encode(),capture_output=True,check=True).stdout
if any(secret in history for secret in secrets):issues.append({'file':'Git history','reason':'contains an actual configured credential; do not publish'})
report={'status':'pass' if not issues else 'fail','scope':'Git-visible working files and existing reachable history; exact locally configured key values','filesChecked':len(files),'issues':issues,'note':'Not a general secret scanner; no files were staged or published.'}
out=ROOT/'artifacts/publication-check.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
raise SystemExit(bool(issues))

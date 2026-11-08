#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/exhibit-env.sh"
exhibit_use_node
if [[ "${1:-}" == --portable ]]; then
  exec "$exhibit_node_bin" "$exhibit_project_root/tools/check-env.cjs"
fi
[[ $# == 0 ]] || { echo "用法：bash tools/doctor.sh [--portable]" >&2;exit 2; }
exhibit_require_kit
mkdir -p "$exhibit_project_root/.logs"
exhibit_result=0
"$exhibit_node_bin" "$exhibit_project_root/tools/check-env.cjs" --native > "$exhibit_project_root/.logs/preflight.json" || exhibit_result=1
cat "$exhibit_project_root/.logs/preflight.json"
"$exhibit_kit_root/bin/irisview" doctor "$exhibit_project_root" > "$exhibit_project_root/.logs/sdk-doctor.json" 2>&1 || exhibit_result=1
cat "$exhibit_project_root/.logs/sdk-doctor.json"
if ((exhibit_result)); then
  echo "自检未通过；按输出补齐依赖。官方安装入口：$exhibit_kit_root/bin/install-host-dependencies" >&2
else
  echo "环境自检通过。首次运行：bash tools/start-ubuntu.sh"
fi
exit "$exhibit_result"

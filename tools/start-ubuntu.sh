#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/exhibit-env.sh"
exhibit_use_node
exhibit_require_kit
exhibit_dry_run=0;exhibit_display=mono;exhibit_replace=0
for exhibit_option in "$@"; do
  case "$exhibit_option" in
    --dry-run) exhibit_dry_run=1 ;;
    --stereo) exhibit_display=stereo ;;
    --replace-debug) exhibit_replace=1 ;;
    *) echo "用法：bash tools/start-ubuntu.sh [--dry-run] [--stereo] [--replace-debug]" >&2;exit 2 ;;
  esac
done
exhibit_package="$exhibit_project_root/artifacts/exhibit.companion.fuiapp"
[[ -f "$exhibit_package" ]] || { echo "缺少.fuiapp，请使用完整迁移包或先构建。" >&2;exit 1; }
exhibit_args=(run "$exhibit_package" --allow-debug-unsigned --display-mode "$exhibit_display" --state-dir "$exhibit_project_root/.state/irisview")
((exhibit_replace==0)) || exhibit_args+=(--allow-debug-replace)
if ((exhibit_dry_run)); then
  exec "$exhibit_kit_root/bin/irisview" "${exhibit_args[@]}" --dry-run
fi
"$exhibit_node_bin" "$exhibit_project_root/tools/check-env.cjs" --native
"$exhibit_kit_root/bin/irisview" doctor "$exhibit_project_root"
"$exhibit_kit_root/bin/irisview" verify "$exhibit_package" --allow-debug-unsigned
mkdir -p "$exhibit_project_root/.logs"
exhibit_backend_pid=
exhibit_cleanup(){
  if [[ -n "$exhibit_backend_pid" ]]; then
    kill "$exhibit_backend_pid" 2>/dev/null || true
    wait "$exhibit_backend_pid" 2>/dev/null || true
  fi
}
trap exhibit_cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
set +e
"$exhibit_node_bin" "$exhibit_project_root/tools/check-env.cjs" --probe-service
exhibit_service_status=$?
set -e
if ((exhibit_service_status==3)); then
  "$exhibit_node_bin" "$exhibit_project_root/backend/server.cjs" > "$exhibit_project_root/.logs/backend.log" 2>&1 &
  exhibit_backend_pid=$!
  "$exhibit_node_bin" "$exhibit_project_root/tools/check-env.cjs" --wait-service
elif ((exhibit_service_status!=0)); then
  echo "4317端口不是本应用服务或无法确认状态；未关闭其他进程。" >&2;exit 1
fi
echo "后端就绪；即将打开官方Client和模拟器。关闭Client或Ctrl+C结束本次会话。"
"$exhibit_kit_root/bin/irisview" "${exhibit_args[@]}"

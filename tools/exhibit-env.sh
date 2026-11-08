#!/usr/bin/env bash
# Shared only by the local launch tools. Never source .env as shell code.
exhibit_project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
exhibit_bundle_root=$(dirname "$exhibit_project_root")
exhibit_kit_root=${IRISVIEW_KIT_ROOT:-"$exhibit_bundle_root/vendor/IrisView-Developer-Kit-v1.0.0"}
exhibit_node_root="$exhibit_project_root/.tools/node-v24.13.0-linux-x64"

exhibit_use_node() {
  if [[ -n "${EXHIBIT_NODE_BIN:-}" ]]; then
    exhibit_node_bin=$EXHIBIT_NODE_BIN
  elif [[ -x "$exhibit_node_root/bin/node" ]]; then
    exhibit_node_bin="$exhibit_node_root/bin/node"
  else
    exhibit_node_bin=$(command -v node || true)
  fi
  if [[ -z "$exhibit_node_bin" || ! -x "$exhibit_node_bin" ]]; then
    echo "缺少 Node 24.13.0，请先执行 bash tools/setup-ubuntu.sh。" >&2; return 1
  fi
  if [[ "$("$exhibit_node_bin" --version)" != v24.13.0 ]]; then
    echo "Node 版本不符合SDK要求，请先执行 bash tools/setup-ubuntu.sh。" >&2; return 1
  fi
  export PATH="$(dirname "$exhibit_node_bin"):$PATH"
}

exhibit_require_kit() {
  if [[ ! -f "$exhibit_kit_root/DEVELOPER_KIT_INFO.json" || ! -x "$exhibit_kit_root/bin/irisview" ]]; then
    echo "未找到完整 SDK，请先运行 setup-ubuntu.sh，或设置 IRISVIEW_KIT_ROOT。" >&2; return 1
  fi
}

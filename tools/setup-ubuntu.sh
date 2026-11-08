#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/exhibit-env.sh"
exhibit_install_deps=0
case "${1:-}" in
  --with-host-deps) exhibit_install_deps=1 ;;
  "") ;;
  *) echo "用法：bash tools/setup-ubuntu.sh [--with-host-deps]" >&2; exit 2 ;;
esac
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "本安装脚本只用于 Ubuntu x86_64；当前系统不做任何安装。" >&2; exit 1
fi
exhibit_os_id=unknown;exhibit_os_version=unknown
if [[ -r /etc/os-release ]]; then
  exhibit_os_id=$(sed -n 's/^ID=//p' /etc/os-release | tr -d '"')
  exhibit_os_version=$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tr -d '"')
fi
case "$exhibit_os_id:$exhibit_os_version" in ubuntu:22.04|ubuntu:26.04) ;; *) echo "SDK只支持Ubuntu 22.04/26.04；请核对镜像版本。" >&2;exit 1;; esac
for exhibit_command in python3 tar xz sha256sum; do
  command -v "$exhibit_command" >/dev/null || { echo "缺少 $exhibit_command，请先安装该系统工具。" >&2;exit 1; }
done
exhibit_node_archive="$exhibit_bundle_root/downloads/node-v24.13.0-linux-x64.tar.xz"
exhibit_node_sha=e798599612f4bb71333a3397ab0d095fd62214e115aea45aa858a145fc72d67e
if [[ ! -f "$exhibit_node_archive" ]]; then
  echo "迁移包缺少Linux Node压缩包，请使用完整Ubuntu迁移包。" >&2;exit 1
fi
printf '%s  %s\n' "$exhibit_node_sha" "$exhibit_node_archive" | sha256sum --check --status
if [[ ! -d "$exhibit_node_root" ]]; then
  mkdir -p "$exhibit_project_root/.tools"
  tar -xJf "$exhibit_node_archive" -C "$exhibit_project_root/.tools"
fi
exhibit_use_node
[[ "$(npm --version)" == 11.6.2 ]] || { echo "npm版本不符合SDK要求。" >&2;exit 1; }
(cd "$exhibit_project_root" && npm ci --offline --ignore-scripts --no-audit --no-fund)
if [[ ! -d "$exhibit_kit_root" ]]; then
  exhibit_kit_archive="$exhibit_bundle_root/downloads/IrisView-Developer-Kit-v1.0.0-LLVISION-v2.tar.gz"
  [[ -f "$exhibit_kit_archive" ]] || { echo "迁移包缺少SDK压缩包。" >&2;exit 1; }
  (cd "$exhibit_bundle_root" && sha256sum --check --status SHA256SUMS)
  mkdir -p "$(dirname "$exhibit_kit_root")"
  tar -xzf "$exhibit_kit_archive" -C "$(dirname "$exhibit_kit_root")"
fi
exhibit_require_kit
(cd "$exhibit_kit_root" && sha256sum --check --status SHA256SUMS)
if [[ ! -f "$exhibit_project_root/.env" ]]; then
  (umask 077; cp "$exhibit_project_root/.env.example" "$exhibit_project_root/.env")
  echo "已创建资料摘录模式的.env。要用现有模型，请单独复制Mac工程中的.env。"
fi
if ((exhibit_install_deps)); then
  "$exhibit_kit_root/bin/install-host-dependencies"
fi
# Restore the actual source baseline; preserve all exported working files as dirty changes.
if [[ -f "$exhibit_bundle_root/source-history.bundle" && ! -e "$exhibit_project_root/.git" ]]; then
  if command -v git >/dev/null; then
    git -C "$exhibit_project_root" init --initial-branch=main
    git -C "$exhibit_project_root" fetch "$exhibit_bundle_root/source-history.bundle" HEAD
    git -C "$exhibit_project_root" reset --mixed FETCH_HEAD
  else
    echo "系统缺少git；安装SDK系统依赖后再运行一次setup即可恢复原始Git基准。"
  fi
fi
echo "本地工具链和SDK已准备。接下来执行：bash tools/doctor.sh"
echo "自检通过后执行：bash tools/start-ubuntu.sh"

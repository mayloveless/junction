#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
kit_root=${IRISVIEW_KIT_ROOT:-"$(dirname "$project_root")/vendor/IrisView-Developer-Kit-v1.0.0"}
mkdir -p "$project_root/artifacts"
node "$project_root/tools/validate-data.cjs"
"$kit_root/bin/irisview" test "$project_root"
"$kit_root/bin/irisview" build "$project_root"
"$kit_root/bin/irisview" package "$project_root" --debug-unsigned --output "$project_root/artifacts/exhibit.companion.fuiapp"
"$kit_root/bin/irisview" verify "$project_root/artifacts/exhibit.companion.fuiapp" --allow-debug-unsigned

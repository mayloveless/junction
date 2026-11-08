#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/exhibit-env.sh"
exhibit_use_node
cd "$exhibit_project_root"
exec "$exhibit_node_bin" backend/server.cjs

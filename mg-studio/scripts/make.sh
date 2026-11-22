#!/usr/bin/env bash
# 在项目目录执行：bash <toolkit>/scripts/make.sh <toolkit> [local|bailian] [输出名]
set -euo pipefail
TOOLKIT="${1:?用法: make.sh <toolkit目录> [local|bailian] [输出名]}"
shift
exec node "$TOOLKIT/scripts/export.js" "$@"

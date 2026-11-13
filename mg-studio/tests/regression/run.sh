#!/usr/bin/env bash
# 旧片回归：复制源项目（含旧 timeline.json，不含 frames/out）→ 抽帧重渲 → 与原帧像素比对
# 用旧 timeline.json（只读复制）而非重建：隔离已失传的旧 build_timeline 算法漂移，
# 使像素回归专测 render.js + scene.html 的迁移保真（真正的迁移问题）。
# build_timeline 保真由其与冻结插件源字节一致（cmp）+ e2e.v1 冒烟覆盖；sicd 重建字节一致见 task-9-report.md 取证。
set -euo pipefail
TOOLKIT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_ROOT="/Users/wangguoyang/Documents/Qoder/2026-11-05/1dbc0620"
WORK="$TOOLKIT/tests/regression/work"
REPORT="[]"
for PROJ in qwenwork-video sicd-video; do
  DIR="$WORK/$PROJ"
  rm -rf "$DIR"; mkdir -p "$DIR"
  cp "$SRC_ROOT/$PROJ/script.json" "$SRC_ROOT/$PROJ/scene.html" "$SRC_ROOT/$PROJ/timeline.json" "$DIR/"
  cp -R "$SRC_ROOT/$PROJ/vo" "$DIR/vo"
  INDICES=$(node -e "const tl=require('$DIR/timeline.json');const ix=[];for(const sc of tl.scenes){ix.push(sc.start+5,sc.end-5);}console.log(ix.join(' '))")
  for I in $INDICES; do
    (cd "$DIR" && node "$TOOLKIT/scripts/render.js" range "$I" $((I+1)) >/dev/null)
  done
  PART=$(python3 "$TOOLKIT/tests/regression/diff_frames.py" "$DIR/frames" "$SRC_ROOT/$PROJ/frames" $INDICES)
  REPORT=$(node -e "const a=$REPORT,b=$PART;console.log(JSON.stringify(a.concat(b.map(x=>Object.assign({project:'$PROJ'},x)))))")
done
echo "$REPORT"

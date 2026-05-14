#!/bin/zsh

set -u

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

verify_commands=(
  "cd \"$ROOT_DIR\" && pnpm exec vitest run apps/agent-server/src/SessionManager.test.ts packages/core/tests/runtime.test.ts packages/core/tests/selection.test.ts packages/core/tests/context-tools.test.ts packages/core/tests/file-tools.test.ts"
  "cd \"$ROOT_DIR\" && bash ./scripts/swiftw test"
  "cd \"$ROOT_DIR\" && bash ./scripts/swiftw build"
)

json_escape() {
  python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))'
}

emit_block_json() {
  local reason="$1"
  local system_message="$2"

  local reason_json
  local system_message_json
  reason_json="$(printf "%s" "$reason" | json_escape)"
  system_message_json="$(printf "%s" "$system_message" | json_escape)"

  cat <<EOF
{"continue":true,"decision":"block","reason":$reason_json,"systemMessage":$system_message_json}
EOF
}

if [ ! -x "$ROOT_DIR/node_modules/.bin/vitest" ]; then
  emit_block_json \
    "当前 worktree 还没有完成独立初始化。先在仓库根目录安装依赖，再重新执行收尾校验。" \
    "缺少可执行文件: $ROOT_DIR/node_modules/.bin/vitest；建议先执行: cd $ROOT_DIR && pnpm install"
  exit 0
fi

for command in "${verify_commands[@]}"; do
  output="$(zsh -lc "$command" 2>&1)"
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    emit_block_json \
      "完成前校验失败。请先修复失败项，重新运行相关校验，再结束本次任务。" \
      "失败命令: $command"$'\n\n'"$output"
    exit 0
  fi
done

exit 0

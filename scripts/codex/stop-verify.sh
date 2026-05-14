#!/bin/zsh

set -u

resolve_root_dir() {
  local git_root
  git_root="$(git rev-parse --show-toplevel 2>/dev/null)" || true
  if [ -n "${git_root:-}" ]; then
    printf "%s\n" "$git_root"
    return 0
  fi

  cd "$(dirname "$0")/../.." && pwd
}

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

main() {
  local root_dir
  root_dir="$(resolve_root_dir)"

  if [ ! -f "$root_dir/scripts/test.sh" ]; then
    emit_block_json \
      "缺少统一测试脚本，无法执行收尾校验。" \
      "找不到文件: $root_dir/scripts/test.sh；请先同步仓库脚本后重试。"
    exit 0
  fi

  if [ ! -x "$root_dir/node_modules/.bin/vitest" ]; then
    emit_block_json \
      "当前 worktree 还没有完成独立初始化。先在仓库根目录安装依赖，再重新执行收尾校验。" \
      "缺少可执行文件: $root_dir/node_modules/.bin/vitest；建议先执行: cd $root_dir && pnpm install"
    exit 0
  fi

  run_verify_command \
    "cd \"$root_dir\" && bash ./scripts/test.sh" \
    "$root_dir" \
    bash ./scripts/test.sh
}

run_verify_command() {
  local display_command="$1"
  local root_dir="$2"
  shift 2

  local output exit_code
  output="$(
    cd "$root_dir" &&
      "$@" 2>&1
  )"
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    emit_block_json \
      "完成前校验失败。请先修复失败项，重新运行相关校验，再结束本次任务。" \
      "失败命令: $display_command"$'\n\n'"$output"
    exit 0
  fi
}

if [ "${STOP_VERIFY_TEST_MODE:-0}" != "1" ]; then
  main
fi

if [ "${STOP_VERIFY_TEST_MODE:-0}" = "1" ]; then
  return 0 2>/dev/null || true
fi

exit 0

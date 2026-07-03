#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Dream Writer 停止脚本 (macOS)
# 用法: bash stop.sh
# ──────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }

stopped=0

kill_port() {
  local port=$1
  local name=$2
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    info "停止 ${name}（端口 ${port}）..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    ok "${name} 已停止"
    stopped=1
  fi
}

kill_port 5173 "前端开发服务器"
kill_port 3000 "后端服务器"

if [ "$stopped" -eq 0 ]; then
  warn "未检测到正在运行的 Dream Writer 服务"
else
  echo ""
  echo -e "${GREEN}✅ Dream Writer 已停止${NC}"
fi

#!/usr/bin/env bash
# 开启严谨模式（但在遇到网络调用时，会通过显式判断容错，确保断网也能运行）
set -euo pipefail

# ──────────────────────────────────────────────
# Dream Writer 一键自动安装与启动脚本
# ──────────────────────────────────────────────

PROJECT_DIR="dream-writer"
REPO_URL="https://github.com/wangjiangtao-lingoace/dream-writer.git"
BRANCH="feat/lightweight-rebuild"
PORT_CLIENT=5173
PORT_SERVER=3000

# 状态标记（用于决定是否重新安装依赖或更新数据库）
NEED_REINSTALL=false
NEED_REDB=false

# 终端颜色
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# 1. 自动定位工作目录为脚本所在的同级目录
cd "$(dirname "$0")"

# 2. 检测系统基础依赖 (Git, Curl)
check_base_deps() {
  if ! command -v git &>/dev/null; then
    warn "未检测到 Git，尝试引导安装..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS 引导安装 Xcode Command Line Tools
      xcode-select --install 2>/dev/null || true
      echo "已唤起 Mac 的命令行工具安装，请在弹出的系统窗口中点击「安装」。"
      echo "安装完成后，请按【回车键】继续..."
      read -r
    else
      # Linux 自动安装
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq git curl
      elif command -v yum &>/dev/null; then
        sudo yum install -y -q git curl
      else
        fail "请先在您的系统上安装 git 和 curl，然后再运行此脚本。"
      fi
    fi
  fi
}

# 3. 检测并安装 Node.js 和 pnpm 环境
check_node_env() {
  if ! command -v node &>/dev/null; then
    info "未检测到 Node.js 环境，正在为您自动下载配置..."
    export NVM_DIR="$HOME/.nvm"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash || true
    fi
    # 加载 NVM 环境
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
  fi

  if ! command -v pnpm &>/dev/null; then
    info "正在安装包管理器 pnpm..."
    corepack enable 2>/dev/null || npm install -g pnpm
  fi
}

# 4. 极速清理被占用端口
clean_ports() {
  if command -v lsof &>/dev/null; then
    for port in $PORT_CLIENT $PORT_SERVER; do
      local pids
      pids=$(lsof -ti :"$port" 2>/dev/null || true)
      if [ -n "$pids" ]; then
        info "清理端口 $port 的旧服务进程..."
        echo "$pids" | xargs kill -9 2>/dev/null || true
      fi
    done
  fi
}

# 5. 获取并自动静默更新代码
sync_code() {
  if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    info "正在检查项目更新..."

    # 临时关闭错误退出，防止网络异常导致脚本崩溃
    set +e
    git fetch --timeout=3 origin "$BRANCH" &>/dev/null
    local fetch_status=$?
    set -e

    if [ $fetch_status -eq 0 ]; then
      local local_commit remote_commit
      local_commit=$(git rev-parse HEAD)
      remote_commit=$(git rev-parse @{u})

      if [ "$local_commit" != "$remote_commit" ]; then
        info "发现新版本！正在自动升级..."

        local before_lock before_schema
        before_lock=$(git rev-parse HEAD:pnpm-lock.yaml 2>/dev/null || echo "none")
        before_schema=$(git rev-parse HEAD:server/prisma/schema.prisma 2>/dev/null || echo "none")

        git pull origin "$BRANCH"

        local after_lock after_schema
        after_lock=$(git rev-parse HEAD:pnpm-lock.yaml 2>/dev/null || echo "none")
        after_schema=$(git rev-parse HEAD:server/prisma/schema.prisma 2>/dev/null || echo "none")

        # 标记是否需要重新初始化
        [ "$before_lock" != "$after_lock" ] && NEED_REINSTALL=true
        [ "$before_schema" != "$after_schema" ] && NEED_REDB=true

        ok "项目已更新到最新版本！"
      else
        ok "当前已是最新版本。"
      fi
    else
      warn "网络连接超时，将使用本地已有版本直接启动。"
    fi
  else
    info "首次运行：正在克隆项目代码..."
    git clone -b "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
  fi
}

# 6. 初始化/重构项目 (首次或更新后触发，日常秒跳过)
setup_project() {
  if [ ! -d "node_modules" ] || [ "$NEED_REINSTALL" = true ]; then
    info "正在安装/更新依赖包..."
    pnpm install
  fi

  if [ ! -d "shared/dist" ] || [ "$NEED_REINSTALL" = true ]; then
    info "正在编译 shared 基础模块..."
    cd shared && pnpm build && cd ..
  fi

  # 初始化 .env 环境变量
  if [ ! -f "server/.env" ]; then
    cp server/.env.example server/.env
    # 自动生成 32 字符的加密 Key
    local key
    if command -v openssl &>/dev/null; then
      key=$(openssl rand -hex 16)
    else
      key=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
    fi

    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=${key}|" server/.env 2>/dev/null || true
    else
      sed -i "s|^AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=${key}|" server/.env 2>/dev/null || true
    fi
  fi

  # 初始化 SQLite 数据库
  if [ ! -f "server/prisma/dev.db" ] || [ "$NEED_REDB" = true ]; then
    info "正在更新本地数据库架构..."
    cd server
    pnpm prisma:generate
    pnpm prisma:push
    cd ..
  fi
}

# 7. 智能调起浏览器
open_browser() {
  local url=$1
  if command -v open &>/dev/null; then
    open "$url" # macOS
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$url" # Linux
  elif command -v start &>/dev/null; then
    start "$url" # Windows (Git Bash)
  else
    info "服务已启动，请手动在浏览器打开: $url"
  fi
}

# 8. 启动开发服务器
run_project() {
  info "正在为您拉起 Dream Writer 创作平台..."
  pnpm dev &
  local dev_pid=$!

  # 监听端口并在就绪后开启浏览器
  (
    for i in $(seq 1 30); do
      if curl -s -o /dev/null -w "" "http://localhost:${PORT_CLIENT}" 2>/dev/null; then
        ok "服务已就绪！"
        open_browser "http://localhost:${PORT_CLIENT}"
        break
      fi
      sleep 1
    done
  ) &

  wait "$dev_pid"
}

# ── 执行主线流程 ──
check_base_deps
check_node_env
clean_ports
sync_code
setup_project
run_project
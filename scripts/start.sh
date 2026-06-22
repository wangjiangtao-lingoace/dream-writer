#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# Dream Writer 一键启动脚本
# 用法: bash start.sh
# 功能: 环境检查 → 拉取/克隆代码 → 依赖同步 → 数据库迁移 → 启动
# 无论首次安装还是日常启动，一条命令搞定
# ──────────────────────────────────────────────

REPO_URL="https://github.com/wangjiangtao-lingoace/dream-writer.git"
BRANCH="feat/lightweight-rebuild"
# 自动检测项目目录：优先使用脚本所在目录的上级
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_MIN_VERSION="20.19.0"
PNPM_MIN_VERSION="10.6.0"
PORT_CLIENT=5173
PORT_SERVER=3000

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}[$1/8]${NC} ${BOLD}$*${NC}"; }

# 版本比较: 返回 0 表示 $1 >= $2
version_gte() {
  [ "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" = "$2" ]
}

# 检测 OS
OS="$(uname -s)"
IS_MACOS=false
IS_LINUX=false
[ "$OS" = "Darwin" ] && IS_MACOS=true
[ "$OS" = "Linux" ] && IS_LINUX=true

# ──────────────────────────────────────────────
# Step 1: 环境检查
# ──────────────────────────────────────────────
check_environment() {
  step 1 "检查运行环境"

  # 系统依赖
  if [ "$IS_MACOS" = true ]; then
    if ! xcode-select -p &>/dev/null; then
      info "正在安装 Xcode Command Line Tools..."
      xcode-select --install 2>/dev/null
      echo "请在弹出的窗口中点击「安装」，安装完成后按回车继续..."
      read -r
      xcode-select -p &>/dev/null || fail "Xcode CLT 安装失败"
    fi
  elif [ "$IS_LINUX" = true ]; then
    local missing=()
    command -v git &>/dev/null || missing+=("git")
    command -v curl &>/dev/null || missing+=("curl")
    if [ ${#missing[@]} -gt 0 ]; then
      warn "缺少: ${missing[*]}，尝试自动安装..."
      if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y -qq "${missing[@]}" || true
      elif command -v yum &>/dev/null; then
        sudo yum install -y "${missing[@]}" || true
      fi
    fi
  fi

  # Node.js
  if ! command -v node &>/dev/null; then
    # 尝试通过 nvm 安装
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
      # shellcheck source=/dev/null
      . "$NVM_DIR/nvm.sh"
    else
      info "正在安装 nvm..."
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
      [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    fi
    info "正在通过 nvm 安装 Node.js LTS..."
    nvm install --lts
    nvm use --lts
    nvm alias default 'lts/*'
  fi

  local node_version
  node_version=$(node -v | sed 's/^v//')
  if ! version_gte "$node_version" "$NODE_MIN_VERSION"; then
    fail "Node.js v${node_version} 版本过低，需要 >= ${NODE_MIN_VERSION}"
  fi
  ok "Node.js v${node_version}"

  # pnpm
  if ! command -v pnpm &>/dev/null; then
    info "正在安装 pnpm..."
    corepack enable 2>/dev/null || npm install -g pnpm
  fi

  local pnpm_version
  pnpm_version=$(pnpm -v)
  if ! version_gte "$pnpm_version" "$PNPM_MIN_VERSION"; then
    fail "pnpm v${pnpm_version} 版本过低，需要 >= ${PNPM_MIN_VERSION}"
  fi
  ok "pnpm v${pnpm_version}"
}

# ──────────────────────────────────────────────
# Step 2: 拉取/克隆代码
# ──────────────────────────────────────────────
sync_code() {
  step 2 "同步代码"

  if [ -d "$INSTALL_DIR/.git" ]; then
    ok "项目目录已存在: $INSTALL_DIR"
    cd "$INSTALL_DIR"

    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")
    if [ "$current_branch" != "$BRANCH" ]; then
      info "切换到分支 $BRANCH ..."
      git fetch origin
      git checkout "$BRANCH"
    fi

    # 记录更新前的关键文件 hash
    BEFORE_LOCK=$(git rev-parse HEAD:pnpm-lock.yaml 2>/dev/null || echo "none")
    BEFORE_SCHEMA=$(git rev-parse HEAD:server/prisma/schema.prisma 2>/dev/null || echo "none")
    BEFORE_SHARED=$(git rev-parse HEAD:shared/tsconfig.json 2>/dev/null || echo "none")

    info "正在拉取最新代码..."
    if ! git pull --ff-only origin "$BRANCH" 2>/dev/null; then
      warn "git pull 失败（可能有本地修改），使用当前代码"
      BEFORE_LOCK="none"  # 强制后续检查
      BEFORE_SCHEMA="none"
      BEFORE_SHARED="none"
    fi

    # 对比更新后的 hash
    AFTER_LOCK=$(git rev-parse HEAD:pnpm-lock.yaml 2>/dev/null || echo "none")
    AFTER_SCHEMA=$(git rev-parse HEAD:server/prisma/schema.prisma 2>/dev/null || echo "none")
    AFTER_SHARED=$(git rev-parse HEAD:shared/tsconfig.json 2>/dev/null || echo "none")

    NEED_INSTALL=false
    NEED_PRISMA=false
    NEED_SHARED=false

    [ "$BEFORE_LOCK" != "$AFTER_LOCK" ] && NEED_INSTALL=true
    [ "$BEFORE_SCHEMA" != "$AFTER_SCHEMA" ] && NEED_PRISMA=true
    [ "$BEFORE_SHARED" != "$AFTER_SHARED" ] && NEED_SHARED=true

    if $NEED_INSTALL || $NEED_PRISMA || $NEED_SHARED; then
      ok "检测到更新"
    else
      ok "代码已是最新"
    fi
  else
    info "正在克隆代码到 $INSTALL_DIR ..."
    git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    ok "代码克隆完成"

    # 首次安装，全部需要
    NEED_INSTALL=true
    NEED_PRISMA=true
    NEED_SHARED=true
  fi
}

# ──────────────────────────────────────────────
# Step 3: 端口检查
# ──────────────────────────────────────────────
check_ports() {
  step 3 "检查端口占用"

  local occupied=""

  if lsof -ti :"$PORT_CLIENT" &>/dev/null 2>&1; then
    occupied="${PORT_CLIENT}(前端)"
  fi
  if lsof -ti :"$PORT_SERVER" &>/dev/null 2>&1; then
    occupied="${occupied:+$occupied, }${PORT_SERVER}(后端)"
  fi

  if [ -z "$occupied" ]; then
    ok "端口 ${PORT_CLIENT}/${PORT_SERVER} 可用"
    return
  fi

  warn "端口被占用: $occupied"
  read -rp "是否释放这些端口？[Y/n]: " choice
  choice="${choice:-Y}"
  if [[ "$choice" =~ ^[Yy]$ ]]; then
    for port in $PORT_CLIENT $PORT_SERVER; do
      local pids
      pids=$(lsof -ti :"$port" 2>/dev/null || true)
      if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
      fi
    done
    sleep 1
    ok "端口已释放"
  fi
}

# ──────────────────────────────────────────────
# Step 4: 安装/更新依赖
# ──────────────────────────────────────────────
sync_dependencies() {
  step 4 "同步项目依赖"

  local need_install=${NEED_INSTALL:-false}

  if [ ! -d "node_modules" ]; then
    need_install=true
  fi

  if $need_install; then
    info "正在安装依赖..."
    pnpm install
    ok "依赖安装完成"
  else
    ok "依赖无需更新"
  fi
}

# ──────────────────────────────────────────────
# Step 5: 数据库同步
# ──────────────────────────────────────────────
sync_database() {
  step 5 "同步数据库"

  local need_prisma=${NEED_PRISMA:-false}

  if [ ! -f "server/prisma/dev.db" ]; then
    need_prisma=true
  fi

  if $need_prisma; then
    info "正在更新 Prisma Client..."
    pnpm prisma:generate
    info "正在推送数据库 Schema..."
    pnpm prisma:push
    ok "数据库同步完成"
  else
    ok "数据库无需更新"
  fi
}

# ──────────────────────────────────────────────
# Step 6: 构建共享包
# ──────────────────────────────────────────────
sync_shared() {
  step 6 "构建共享类型包"

  local need_shared=${NEED_SHARED:-false}

  if [ ! -d "shared/dist" ]; then
    need_shared=true
  fi

  if $need_shared; then
    pnpm build:shared
    ok "shared 包构建完成"
  else
    ok "shared 包无需更新"
  fi
}

# ──────────────────────────────────────────────
# Step 7: 环境配置
# ──────────────────────────────────────────────
setup_env() {
  step 7 "检查环境配置"

  local env_file="server/.env"
  local example_file="server/.env.example"

  # 复制 .env.example → .env
  if [ ! -f "$env_file" ] && [ -f "$example_file" ]; then
    cp "$example_file" "$env_file"
  fi

  # 自动生成加密密钥（内部使用，无需用户关注）
  if [ -f "$env_file" ]; then
    if ! grep -q "^AI_CONFIG_ENCRYPTION_KEY=.\+" "$env_file" 2>/dev/null; then
      local key
      if command -v openssl &>/dev/null; then
        key=$(openssl rand -hex 32)
      else
        key=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
      fi

      if grep -q "^AI_CONFIG_ENCRYPTION_KEY=" "$env_file" 2>/dev/null; then
        if [ "$IS_MACOS" = true ]; then
          sed -i '' "s|^AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=${key}|" "$env_file"
        else
          sed -i "s|^AI_CONFIG_ENCRYPTION_KEY=.*|AI_CONFIG_ENCRYPTION_KEY=${key}|" "$env_file"
        fi
      else
        echo "" >> "$env_file"
        echo "AI_CONFIG_ENCRYPTION_KEY=${key}" >> "$env_file"
      fi
    fi
  fi

  if [ ! -f "client/.env" ] && [ -f "client/.env.example" ]; then
    cp "client/.env.example" "client/.env"
  fi

  ok "环境配置就绪"
}

# ──────────────────────────────────────────────
# Step 8: 启动
# ──────────────────────────────────────────────
start_dev() {
  step 8 "启动开发服务器"

  local url="http://localhost:${PORT_CLIENT}"

  echo ""
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Dream Writer 环境就绪！${NC}"
  echo -e "${GREEN}════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  前端地址: ${CYAN}${url}${NC}"
  echo -e "  后端地址: ${CYAN}http://localhost:${PORT_SERVER}${NC}"
  echo ""
  echo -e "  ${DIM}首次使用在页面配置 AI 模型和 API Key 即可开始创作${NC}"
  echo -e "  ${DIM}按 Ctrl+C 可随时停止${NC}"
  echo ""

  pnpm dev &
  local dev_pid=$!

  # 等待前端端口就绪后自动打开浏览器（仅 macOS）
  if [ "$IS_MACOS" = true ]; then
    (
      for i in $(seq 1 30); do
        if curl -s -o /dev/null -w "" "http://localhost:${PORT_CLIENT}" 2>/dev/null; then
          open "$url"
          break
        fi
        sleep 1
      done
    ) &
  fi

  wait "$dev_pid" 2>/dev/null
}

# ──────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────
main() {
  echo ""
  echo -e "${CYAN}════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  Dream Writer 启动脚本${NC}"
  echo -e "${CYAN}  AI 小说创作平台${NC}"
  echo -e "${CYAN}════════════════════════════════════════════${NC}"

  NEED_INSTALL=false
  NEED_PRISMA=false
  NEED_SHARED=false

  check_environment
  sync_code
  check_ports
  sync_dependencies
  sync_database
  sync_shared
  setup_env
  start_dev
}

main "$@"

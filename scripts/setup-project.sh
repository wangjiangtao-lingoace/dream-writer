#!/bin/bash
# Dream Writer 项目启动脚本
# 古色古香AI小说创作助手 - 快速启动脚本

set -e

echo "🏮 梦中笔者 - Dream Writer 项目启动"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查Node.js版本
echo "📋 检查环境依赖..."
NODE_VERSION=$(node -v)
PNPM_VERSION=$(pnpm -v)

echo "✅ Node.js: $NODE_VERSION"
echo "✅ pnpm: $PNPM_VERSION"
echo ""

# 检查版本是否符合要求
if [[ ! "$NODE_VERSION" =~ ^v(20\.19\.[0-9]+|22\.12\.[0-9]+|2[4-9]\.[0-9]+\.[0-9]+) ]]; then
    echo -e "${YELLOW}⚠️  警告: Node.js版本建议使用 ^20.19.0 || ^22.12.0 || >=24.0.0${NC}"
    echo "当前版本: $NODE_VERSION"
    echo ""
fi

# 创建必要的目录结构
echo "📁 创建项目目录结构..."
mkdir -p client/src/{components,pages,hooks,styles,lib}
mkdir -p server/src/{routes,services,prompting}
mkdir -p shared/src
mkdir -p docs
echo "✅ 目录结构创建完成"
echo ""

# 检查Git远程仓库
echo "🔗 检查Git配置..."
if git remote get-url origin &>/dev/null; then
    REMOTE_URL=$(git remote get-url origin)
    echo "✅ Git远程仓库: $REMOTE_URL"
else
    echo "⚠️  未配置Git远程仓库"
    echo "正在添加默认仓库..."
    git remote add origin git@github.com:wangjiangtao-lingoace/dream-writer.git
    echo "✅ Git远程仓库已配置"
fi
echo ""

# 初始化package.json文件
echo "📦 初始化包管理文件..."
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 未找到package.json"
    exit 1
fi
echo "✅ package.json已存在"
echo ""

# 创建子项目package.json
echo "📦 创建子项目配置..."

# client package.json
cat > client/package.json << 'EOF'
{
  "name": "@dream-writer/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.1",
    "@tanstack/react-query": "^5.59.20"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.2",
    "vite": "^6.0.1"
  }
}
EOF

# server package.json
cat > server/package.json << 'EOF'
{
  "name": "@dream-writer/server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/app.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^5.1.0",
    "@prisma/client": "^7.4.2",
    "cors": "^2.8.6",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^25.0.0",
    "prisma": "^7.4.2",
    "tsx": "^4.19.2",
    "typescript": "^5.6.2"
  }
}
EOF

# shared package.json
cat > shared/package.json << 'EOF'
{
  "name": "@dream-writer/shared",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.2"
  }
}
EOF

echo "✅ 子项目package.json创建完成"
echo ""

# 安装依赖
echo "📚 安装项目依赖..."
if [ -f "pnpm-lock.yaml" ]; then
    echo "📦 检测到lock文件，跳过安装..."
    echo "如需重新安装，请删除 pnpm-lock.yaml 后重试"
else
    pnpm install
    echo "✅ 依赖安装完成"
fi
echo ""

# 创建初始提交
echo "💾 创建初始Git提交..."
git add .
git commit -m "🏮 梦中笔者项目初始化

- 创建古色古香项目结构
- 配置monorepo工作空间
- 设计传统线装书UI风格系统
- 制定完整功能移植计划

墨香流传，笔耕不辍" || echo "⚠️  没有文件需要提交"
echo ""

# 检查是否可以推送到远程仓库
echo "🚀 检查远程推送..."
if git remote get-url origin &>/dev/null; then
    echo ""
    echo "📋 项目启动完成！"
    echo "========================================"
    echo ""
    echo "🎯 下一步操作:"
    echo "1. 查看实施计划: cat docs/MIGRATION_PLAN.md"
    echo "2. 查看路线图: cat docs/IMPLEMENTATION_ROADMAP.md"
    echo "3. 启动开发环境: pnpm dev"
    echo "4. 推送到远程仓库: git push -u origin main"
    echo ""
    echo "🏮 梦中笔者已准备就绪，祝创作愉快！"
    echo ""
else
    echo "❌ 错误: Git远程仓库未配置"
    echo "请手动配置: git remote add origin <your-repo-url>"
fi

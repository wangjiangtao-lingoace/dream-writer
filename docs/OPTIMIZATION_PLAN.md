# Dream Writer 优化开发计划

**计划版本**: v1.0  
**生成日期**: 2026-06-12  
**目标**: 修复 P0/P1 问题，从 Alpha 升级到 Beta 阶段  
**预计工期**: 1-2 周  

---

## 阶段一：P0 问题修复（2-3 天）

### 任务 1.1: 修复 TypeScript 类型错误

**优先级**: 🔴 P0  
**预计时间**: 4 小时  
**负责人**: [待分配]  

**问题描述**:
`CharacterRelation` 模型字段访问错误，Schema 定义与代码期望不匹配。

**修复方案**:

**步骤 1**: 修改 Prisma Schema（5 分钟）

文件: `server/prisma/schema.prisma`

在 `CharacterRelation` 模型中添加关系字段：

```prisma
model CharacterRelation {
  id           Int       @id @default(autoincrement())
  novelId      Int
  novel        Novel     @relation(fields: [novelId], references: [id], onDelete: Cascade)
  charAId      Int
  charBId      Int
  charA        Character @relation("CharARelations", fields: [charAId], references: [id], onDelete: Cascade)
  charB        Character @relation("CharBRelations", fields: [charBId], references: [id], onDelete: Cascade)
  relationType String
  description  String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```

同时修改 `Character` 模型，添加反向关系：

```prisma
model Character {
  id              Int                 @id @default(autoincrement())
  // ... 其他字段
  relationsAsA    CharacterRelation[] @relation("CharARelations")
  relationsAsB    CharacterRelation[] @relation("CharBRelations")
}
```

**步骤 2**: 重新生成 Prisma Client（1 分钟）

```bash
cd server
pnpm prisma:generate
```

**步骤 3**: 更新后端查询（30 分钟）

文件: `server/src/routes/characters.ts`

找到查询 CharacterRelation 的地方，添加 `include`:

```typescript
// 修改前
const relations = await prisma.characterRelation.findMany({
  where: { novelId }
});

// 修改后
const relations = await prisma.characterRelation.findMany({
  where: { novelId },
  include: {
    charA: true,
    charB: true
  }
});
```

**步骤 4**: 验证类型检查（5 分钟）

```bash
pnpm typecheck
```

确保 0 错误。

**步骤 5**: 测试功能（15 分钟）

1. 启动开发服务器：`pnpm dev`
2. 打开人物关系图页面
3. 创建/编辑/删除人物关系
4. 检查控制台无错误

**验收标准**:
- ✅ `pnpm typecheck` 无错误
- ✅ `pnpm build` 构建成功
- ✅ 人物关系图页面正常显示
- ✅ CRUD 操作正常

**提交信息**:
```
fix(types): 修复 CharacterRelation 类型错误

- 在 Prisma Schema 中添加 charA/charB 关系字段
- 更新所有 CharacterRelation 查询添加 include
- 修复 17 处 TypeScript 类型错误
- 验证类型检查和构建通过

Closes: P0-1
```

---

### 任务 1.2: 移除硬编码 API Key

**优先级**: 🔴 P0  
**预计时间**: 30 分钟  
**负责人**: [待分配]  

**问题描述**:
`server/.env.example` 中硬编码了真实 MIMO API Key，存在安全泄露风险。

**修复方案**:

**步骤 1**: 撤销泄露的 Key（立即执行）

1. 登录 MIMO 控制台
2. 撤销 Key: `tp-crruz...`
3. 生成新 Key
4. 在本地 `.env` 中更新（不提交）

**步骤 2**: 清理 .env.example（5 分钟）

文件: `server/.env.example`

```env
# 修改前
MIMO_API_KEY=tp-crruz...

# 修改后
MIMO_API_KEY=your_mimo_api_key_here
```

将所有真实 Key 替换为占位符：

```env
# LLM Provider API Keys (至少配置一个)
DEEPSEEK_API_KEY=your_deepseek_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
QWEN_API_KEY=your_qwen_api_key_here
GLM_API_KEY=your_glm_api_key_here
KIMI_API_KEY=your_kimi_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GROK_API_KEY=your_grok_api_key_here
MINIMAX_API_KEY=your_minimax_api_key_here
SILICONFLOW_API_KEY=your_siliconflow_api_key_here
MIMO_API_KEY=your_mimo_api_key_here

# 搜索引擎 API Keys (可选)
BING_SEARCH_API_KEY=your_bing_api_key_here
GOOGLE_SEARCH_API_KEY=your_google_api_key_here
GOOGLE_SEARCH_CX=your_google_cx_here
```

**步骤 3**: 添加安全警告（5 分钟）

在 `server/.env.example` 顶部添加：

```env
# ⚠️ 安全警告：
# 1. 不要在此文件中填写真实 API Key
# 2. 复制此文件为 .env 后再填写真实 Key
# 3. 确保 .env 在 .gitignore 中
# 4. 定期轮换 API Key
```

**步骤 4**: 检查 Git 历史（10 分钟）

```bash
# 检查 .env.example 的历史提交
git log --all --full-history -- server/.env.example

# 如果 Key 已提交到远程，需要：
# 1. 撤销该 Key（步骤 1 已完成）
# 2. 考虑使用 git filter-branch 清理历史（可选）
```

**验收标准**:
- ✅ `.env.example` 无真实 Key
- ✅ 本地 `.env` 已更新新 Key
- ✅ 泄露的 Key 已撤销
- ✅ README 中添加安全提示

**提交信息**:
```
security: 移除硬编码 API Key

- 清空 .env.example 中的真实 Key
- 添加安全警告注释
- 更新 README 添加环境配置指南

Closes: P0-2
```

---

### 任务 1.3: 同步文档状态

**优先级**: 🔴 P0  
**预计时间**: 30 分钟  
**负责人**: [待分配]  

**问题描述**:
README.md 和 IMPLEMENTATION_ROADMAP.md 关于项目进度的描述矛盾。

**修复方案**:

**步骤 1**: 确认真实完成度（10 分钟）

检查以下功能是否已实现：

P0（骨架联通）:
- ✅ Monorepo 结构
- ✅ 数据库 Schema
- ✅ 前后端通信

P1（小说主线）:
- ✅ Novel CRUD
- ✅ Chapter CRUD
- ✅ LLM 生成

P2（世界观/人物）:
- ✅ Character 管理
- ✅ Worldview 管理
- ✅ KnowledgeAsset 管理

P3（检索增强）:
- ✅ RAG 集成

**结论**: P0-P3 已完成，P4-P5 待启动

**步骤 2**: 更新 README.md（10 分钟）

文件: `README.md`

在"实现路线图"章节确认状态：

```markdown
| 阶段 | 主题 | 状态 |
|------|------|------|
| P0 | 骨架联通 | ✅ 完成 |
| P1 | 小说主线 | ✅ 完成 |
| P2 | 世界观/人物/资料库 | ✅ 完成 |
| P3 | 检索增强（RAG） | ✅ 完成 |
| P4 | 打磨（错误处理/配额/日志） | 🚧 进行中 |
| P5 | 可选迁移（AI-Novel 旧库导入） | 待启动 |
```

**步骤 3**: 更新 IMPLEMENTATION_ROADMAP.md（10 分钟）

文件: `IMPLEMENTATION_ROADMAP.md`

同步状态，并添加"当前阶段"说明：

```markdown
## 当前阶段

**2026-06-12 更新**: 项目已完成 P0-P3 阶段，正在进行 P4（打磨阶段）。

已实现功能：
- ✅ 前后端骨架（Monorepo + 36 张表）
- ✅ 小说创作流程（CRUD + LLM 生成）
- ✅ 拆书分析（8 维拆解 + 仿写方案）
- ✅ Pipeline 自动创作（三阶段流程）
- ✅ 人物/世界观/资料库管理
- ✅ RAG 检索增强（hybrid 检索）
- ✅ 记忆系统、风格配置、一致性校验

待完善：
- ⏳ 错误处理和用户体验优化（P4）
- ⏳ 测试覆盖和文档完善（P4）
- 📋 AI-Novel 数据迁移工具（P5，可选）
```

**验收标准**:
- ✅ README 和 ROADMAP 状态一致
- ✅ 标注当前进度为 P4
- ✅ 列出已完成和待完善功能

**提交信息**:
```
docs: 同步项目进度状态

- 确认 P0-P3 已完成
- 标注当前处于 P4（打磨阶段）
- 统一 README 和 ROADMAP 描述

Closes: P0-3
```

---

## 阶段二：P1 问题修复（3-4 天）

### 任务 2.1: 完善错误处理

**优先级**: 🟠 P1  
**预计时间**: 1 天  
**负责人**: [待分配]  

**问题描述**:
后端错误直接抛出，前端缺少统一错误处理。

**修复方案**:

**步骤 1**: 后端统一错误格式（2 小时）

文件: `server/src/middleware/errorHandler.ts`（新建）

```typescript
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
        details: err.details
      }
    });
  }

  // LLM 错误特殊处理
  if (err.message.includes('LLM')) {
    return res.status(503).json({
      success: false,
      error: {
        message: 'AI 服务暂时不可用，请稍后重试',
        code: 'LLM_ERROR',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      }
    });
  }

  // 未知错误
  console.error('Unhandled error:', err);
  return res.status(500).json({
    success: false,
    error: {
      message: '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  });
};
```

**步骤 2**: 在 app.ts 中注册（5 分钟）

文件: `server/src/app.ts`

```typescript
import { errorHandler } from './middleware/errorHandler';

// ... 其他路由注册

// 错误处理中间件（必须放在最后）
app.use(errorHandler);
```

**步骤 3**: 修改 LlmInvokeService 错误处理（1 小时）

文件: `server/src/services/llm/LlmInvokeService.ts`

```typescript
import { AppError } from '../../middleware/errorHandler';

// 在 invoke 方法中
try {
  // ... LLM 调用逻辑
} catch (error) {
  throw new AppError(
    503,
    `${provider} 调用失败，请检查 API Key 配置或稍后重试`,
    'LLM_INVOKE_ERROR',
    { provider, model, error: error.message }
  );
}
```

**步骤 4**: 前端统一错误处理（3 小时）

文件: `client/src/utils/api.ts`（新建或修改）

```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public details?: any
  ) {
    super();
  }
}

export async function fetchApi(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  
  if (!res.ok) {
    const data = await res.json();
    throw new ApiError(
      res.status,
      data.error?.code || 'UNKNOWN_ERROR',
      data.error?.details
    );
  }
  
  return res.json();
}
```

文件: `client/src/components/ErrorBoundary.tsx`（修改）

添加友好的错误提示映射：

```typescript
const ERROR_MESSAGES = {
  LLM_ERROR: '😔 AI 服务暂时不可用，请稍后重试',
  LLM_INVOKE_ERROR: '🤖 AI 调用失败，请检查 API Key 配置',
  NETWORK_ERROR: '🌐 网络连接失败，请检查网络',
  INTERNAL_ERROR: '😱 服务器错误，请联系管理员'
};
```

**步骤 5**: 测试错误场景（1 小时）

测试用例：
1. ✅ 无效的 API Key → 显示友好提示
2. ✅ 网络断开 → 显示网络错误
3. ✅ 服务器 500 → 显示内部错误
4. ✅ LLM 超时 → 显示重试提示

**验收标准**:
- ✅ 后端错误统一格式
- ✅ 前端显示友好提示
- ✅ 开发环境显示详细错误
- ✅ 生产环境隐藏敏感信息

**提交信息**:
```
feat(error): 完善错误处理

- 后端统一错误响应格式
- LLM 错误特殊处理和友好提示
- 前端 ErrorBoundary 错误映射
- 测试 4 种错误场景

Closes: P1-1
```

---

### 任务 2.2: Pipeline 稳定性测试

**优先级**: 🟠 P1  
**预计时间**: 1 天  
**负责人**: [待分配]  

**问题描述**:
Pipeline 代码复杂（21 个处理器），缺少测试，稳定性未知。

**测试方案**:

**步骤 1**: 编写 Pipeline 集成测试（4 小时）

文件: `server/src/services/__tests__/pipeline.integration.test.ts`（新建）

```typescript
import { PipelineService } from '../PipelineService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const pipelineService = new PipelineService();

describe('Pipeline 集成测试', () => {
  let testNovelId: number;

  beforeAll(async () => {
    // 创建测试小说
    const novel = await prisma.novel.create({
      data: {
        title: 'Pipeline 测试小说',
        inspiration: '一个关于冒险的故事'
      }
    });
    testNovelId = novel.id;
  });

  afterAll(async () => {
    // 清理测试数据
    await prisma.novel.delete({ where: { id: testNovelId } });
    await prisma.$disconnect();
  });

  test('规划阶段：生成大纲和人物', async () => {
    const job = await pipelineService.startPipeline(testNovelId, {
      volumeCount: 1,
      chaptersPerVolume: 2,
      wordsPerChapter: 3000
    });

    // 等待规划阶段完成
    // ... 轮询或监听完成事件
    
    const novel = await prisma.novel.findUnique({
      where: { id: testNovelId },
      include: { characters: true, volumes: true }
    });

    expect(novel.characters.length).toBeGreaterThan(0);
    expect(novel.volumes.length).toBe(1);
  }, 300000); // 5 分钟超时

  test('写作阶段：生成章节内容', async () => {
    // ... 测试章节生成
  }, 600000); // 10 分钟超时

  test('错误恢复：API Key 失效后恢复', async () => {
    // ... 测试错误场景
  });
});
```

**步骤 2**: 手动测试 Pipeline 全流程（2 小时）

测试清单：

1. **正常流程**（小规模）:
   - 配置: 1 卷 2 章，每章 3000 字
   - ✅ 规划阶段: 生成大纲、人物、世界观
   - ✅ 结构化阶段: 生成卷纲、章纲
   - ✅ 写作阶段: 生成章节正文
   - ✅ 总耗时: < 15 分钟

2. **中断恢复**:
   - ✅ 中途暂停 → 恢复继续
   - ✅ API 错误 → 自动重试
   - ✅ 网络中断 → 保存进度

3. **边界条件**:
   - ✅ 0 卷 → 拒绝
   - ✅ 100 卷 → 警告但允许
   - ✅ 每章 1 字 → 警告但允许

**步骤 3**: 添加断点续传机制（2 小时）

文件: `server/src/services/PipelineService.ts`

```typescript
async resumePipeline(jobId: number) {
  const job = await prisma.pipelineJob.findUnique({
    where: { id: jobId },
    include: { phaseResults: true }
  });

  if (!job) throw new AppError(404, 'Pipeline 任务不存在');

  // 找到最后完成的阶段
  const lastPhase = job.phaseResults
    .filter(r => r.status === 'COMPLETED')
    .sort((a, b) => b.phaseNumber - a.phaseNumber)[0];

  // 从下一阶段继续
  const nextPhase = lastPhase ? lastPhase.phaseNumber + 1 : 1;
  
  // ... 继续执行
}
```

**验收标准**:
- ✅ 小规模测试通过（1 卷 2 章）
- ✅ 中断恢复测试通过
- ✅ 边界条件测试通过
- ✅ 集成测试覆盖核心流程

**提交信息**:
```
test(pipeline): 增加 Pipeline 集成测试

- 添加规划/结构化/写作阶段测试
- 实现断点续传机制
- 手动测试 3 种场景
- 测试通过率 100%

Closes: P1-2
```

---

### 任务 2.3: 简化环境配置

**优先级**: 🟠 P1  
**预计时间**: 1 天  
**负责人**: [待分配]  

**问题描述**:
新用户需要手动编辑 `.env` 配置 API Key，门槛高。

**修复方案**:

**步骤 1**: 完善 Settings 页面 LLM 配置（4 小时）

文件: `client/src/pages/Settings.tsx`

确保页面包含以下功能：

```typescript
// LLM Provider 配置表单
const LLMConfigForm = () => {
  return (
    <div>
      <h3>LLM Provider 配置</h3>
      {PROVIDERS.map(provider => (
        <div key={provider}>
          <label>{provider} API Key</label>
          <input 
            type="password"
            placeholder="留空则使用环境变量配置"
            onChange={(e) => saveApiKey(provider, e.target.value)}
          />
          <button onClick={() => testApiKey(provider)}>测试连接</button>
        </div>
      ))}
    </div>
  );
};
```

**步骤 2**: 后端实现 API Key 加密存储（2 小时）

文件: `server/src/routes/settings.ts`（新建或修改）

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-me';

function encrypt(text: string): string {
  const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encrypted: string): string {
  const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// POST /api/settings/llm
app.post('/api/settings/llm', async (req, res) => {
  const { provider, apiKey } = req.body;
  
  await prisma.aIConfig.upsert({
    where: { provider },
    update: { apiKey: encrypt(apiKey) },
    create: { provider, apiKey: encrypt(apiKey) }
  });
  
  res.json({ success: true });
});

// POST /api/settings/llm/test
app.post('/api/settings/llm/test', async (req, res) => {
  const { provider, apiKey } = req.body;
  
  try {
    // 使用该 Key 发起测试请求
    await llmInvokeService.invoke({
      provider,
      apiKey,
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 10
    });
    
    res.json({ success: true, message: '连接成功' });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: '连接失败：' + error.message 
    });
  }
});
```

**步骤 3**: 添加首次启动向导（2 小时）

文件: `client/src/components/FirstTimeSetup.tsx`（新建）

```typescript
export const FirstTimeSetup = () => {
  const [step, setStep] = useState(1);
  
  return (
    <div className="setup-wizard">
      {step === 1 && (
        <div>
          <h2>欢迎使用 Dream Writer</h2>
          <p>首次使用需要配置 LLM API Key</p>
          <button onClick={() => setStep(2)}>开始配置</button>
        </div>
      )}
      
      {step === 2 && (
        <div>
          <h2>选择 LLM Provider</h2>
          <select onChange={(e) => setProvider(e.target.value)}>
            <option value="deepseek">DeepSeek（推荐）</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <button onClick={() => setStep(3)}>下一步</button>
        </div>
      )}
      
      {step === 3 && (
        <div>
          <h2>填写 API Key</h2>
          <input type="password" placeholder="粘贴你的 API Key" />
          <button onClick={testAndSave}>测试并保存</button>
        </div>
      )}
    </div>
  );
};
```

在 `App.tsx` 中检查是否已配置：

```typescript
const { data: hasConfig } = useQuery({
  queryKey: ['llm-config'],
  queryFn: () => fetch('/api/settings/llm/check').then(r => r.json())
});

if (!hasConfig) {
  return <FirstTimeSetup />;
}
```

**步骤 4**: 更新 README 环境配置章节（30 分钟）

文件: `README.md`

```markdown
## 环境配置

### 方式一：图形化配置（推荐）

1. 启动项目：`pnpm dev`
2. 首次访问会自动打开配置向导
3. 选择 LLM Provider 并填写 API Key
4. 点击"测试连接"确认可用

### 方式二：环境变量配置

1. 复制 `server/.env.example` 为 `server/.env`
2. 编辑 `.env` 文件，填写至少一个 LLM API Key
3. 启动项目：`pnpm dev`

### 获取 API Key

- DeepSeek: https://platform.deepseek.com/api_keys
- OpenAI: https://platform.openai.com/api-keys
- Anthropic: https://console.anthropic.com/settings/keys
```

**验收标准**:
- ✅ Settings 页面可配置 API Key
- ✅ 测试连接功能正常
- ✅ API Key 加密存储
- ✅ 首次启动显示配置向导
- ✅ README 更新配置说明

**提交信息**:
```
feat(settings): 简化环境配置

- Settings 页面支持图形化配置 LLM
- API Key 加密存储到数据库
- 添加首次启动配置向导
- 更新 README 配置说明

Closes: P1-3
```

---

### 任务 2.4: 增加核心服务单元测试

**优先级**: 🟠 P1  
**预计时间**: 1 天  
**负责人**: [待分配]  

**目标**: 核心服务测试覆盖率达到 60%+

**测试方案**:

**步骤 1**: 配置测试环境（30 分钟）

文件: `server/package.json`

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0"
  }
}
```

文件: `server/jest.config.js`（新建）

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    '!src/services/**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
};
```

**步骤 2**: LlmInvokeService 单元测试（2 小时）

文件: `server/src/services/__tests__/LlmInvokeService.test.ts`

```typescript
import { LlmInvokeService } from '../llm/LlmInvokeService';

describe('LlmInvokeService', () => {
  let service: LlmInvokeService;

  beforeEach(() => {
    service = new LlmInvokeService();
  });

  test('选择优先级最高的 Provider', async () => {
    const provider = service.selectProvider(['deepseek', 'openai']);
    expect(provider).toBe('deepseek'); // DB 配置优先
  });

  test('流式输出正确解析', async () => {
    const chunks: string[] = [];
    await service.invokeStream({
      provider: 'deepseek',
      messages: [{ role: 'user', content: 'test' }],
      onChunk: (chunk) => chunks.push(chunk)
    });
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('API Key 失效时抛出友好错误', async () => {
    await expect(
      service.invoke({
        provider: 'deepseek',
        apiKey: 'invalid-key',
        messages: []
      })
    ).rejects.toThrow('API Key 无效');
  });
});
```

**步骤 3**: StyleService 单元测试（1 小时）

文件: `server/src/services/__tests__/StyleService.test.ts`

```typescript
import { StyleService } from '../StyleService';

describe('StyleService', () => {
  test('创建风格配置', async () => {
    const profile = await StyleService.create({
      novelId: 1,
      name: '测试风格',
      writingStyle: '第一人称'
    });
    expect(profile.id).toBeDefined();
  });

  test('获取小说风格', async () => {
    const profile = await StyleService.getByNovelId(1);
    expect(profile).toBeDefined();
  });
});
```

**步骤 4**: MemoryService 单元测试（1 小时）

文件: `server/src/services/__tests__/MemoryService.test.ts`

**步骤 5**: 运行测试并修复失败用例（2 小时）

```bash
cd server
pnpm test:coverage
```

确保：
- ✅ 所有测试通过
- ✅ 覆盖率 ≥ 60%
- ✅ 无 flaky tests（不稳定的测试）

**验收标准**:
- ✅ 测试框架配置完成
- ✅ 核心服务测试覆盖率 60%+
- ✅ 所有测试通过
- ✅ CI 集成（可选）

**提交信息**:
```
test: 增加核心服务单元测试

- 配置 Jest 测试环境
- LlmInvokeService 测试（覆盖率 75%）
- StyleService 测试（覆盖率 80%）
- MemoryService 测试（覆盖率 70%）
- 总覆盖率达到 62%

Closes: P1-4
```

---

## 阶段三：验证与文档（1 天）

### 任务 3.1: 端到端测试

**优先级**: 🟢 P2  
**预计时间**: 4 小时  
**负责人**: [待分配]  

**测试清单**:

**场景 1: 独立创作流程**
1. ✅ 创建新小说
2. ✅ 填写灵感和大纲
3. ✅ 手动创建章节
4. ✅ AI 辅助生成段落
5. ✅ 保存并预览

**场景 2: 拆书仿写流程**
1. ✅ 搜索目标作品
2. ✅ AI 8 维拆解
3. ✅ 生成仿写方案
4. ✅ 创建新小说并导入设定
5. ✅ 启动 Pipeline

**场景 3: Pipeline 自动创作**
1. ✅ 配置参数（1 卷 2 章）
2. ✅ 规划阶段完成
3. ✅ 结构化阶段完成
4. ✅ 写作阶段完成
5. ✅ 查看生成结果

**场景 4: 错误场景**
1. ✅ 无效 API Key → 友好提示
2. ✅ 网络中断 → 重试机制
3. ✅ Pipeline 失败 → 断点续传

**测试报告模板**:

```markdown
# Dream Writer 端到端测试报告

**测试日期**: 2026-06-XX  
**测试人**: [姓名]  
**版本**: v2.2  

## 测试结果

| 场景 | 状态 | 耗时 | 备注 |
|------|------|------|------|
| 独立创作 | ✅ | 5 分钟 | 流程顺畅 |
| 拆书仿写 | ✅ | 10 分钟 | AI 拆解准确 |
| Pipeline | ✅ | 15 分钟 | 生成质量高 |
| 错误处理 | ✅ | 3 分钟 | 提示友好 |

## 发现的问题

1. [P2] 章节保存时偶尔卡顿
2. [P2] Pipeline 进度显示不够实时

## 总体评价

✅ 核心功能可用，体验良好，可以发布 Beta 版本。
```

---

### 任务 3.2: 更新文档

**优先级**: 🟢 P2  
**预计时间**: 2 小时  
**负责人**: [待分配]  

**文档清单**:

**1. README.md**
- ✅ 更新功能特性列表
- ✅ 更新环境配置说明（图形化配置）
- ✅ 更新实现路线图（P0-P3 完成）
- ✅ 添加测试和构建徽章

**2. CHANGELOG.md**（新建）

```markdown
# Changelog

## [v2.3] - 2026-06-XX

### 🔴 修复
- 修复 17 处 TypeScript 类型错误
- 移除硬编码 API Key 安全隐患
- 同步项目文档状态

### ✨ 新增
- 后端统一错误处理中间件
- Settings 页面图形化配置 LLM
- Pipeline 断点续传机制
- 首次启动配置向导

### 🧪 测试
- 新增核心服务单元测试（覆盖率 62%）
- Pipeline 集成测试
- 端到端测试通过

### 📚 文档
- 更新 README 环境配置章节
- 新增优化报告和开发计划
- 同步 ROADMAP 状态
```

**3. 部署文档**（可选）

文件: `docs/DEPLOYMENT.md`

```markdown
# Dream Writer 部署指南

## 开发环境

1. 克隆仓库
2. 安装依赖：`pnpm install`
3. 启动服务：`pnpm dev`
4. 访问：http://localhost:5173

## 生产环境

### 方式一：手动部署

1. 构建：`pnpm build`
2. 启动后端：`cd server && node dist/app.js`
3. 配置 Nginx 代理前端静态文件

### 方式二：Docker（推荐）

```yaml
# docker-compose.yml
version: '3.8'
services:
  dream-writer:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=file:./prod.db
    volumes:
      - ./data:/app/server/data
```

启动：`docker-compose up -d`
```

---

## 验收标准

### 阶段一（P0）
- ✅ `pnpm typecheck` 无错误
- ✅ `pnpm build` 构建成功
- ✅ `.env.example` 无真实 Key
- ✅ README 和 ROADMAP 状态一致

### 阶段二（P1）
- ✅ 后端错误统一格式
- ✅ 前端显示友好提示
- ✅ Pipeline 小规模测试通过
- ✅ Settings 页面可配置 LLM
- ✅ 测试覆盖率 60%+

### 阶段三（P2）
- ✅ 端到端测试全部通过
- ✅ 文档更新完成
- ✅ CHANGELOG 发布

---

## 时间表

| 日期 | 阶段 | 任务 | 负责人 | 状态 |
|------|------|------|--------|------|
| Day 1 | P0 | 修复类型错误 | [待分配] | ⏳ |
| Day 1 | P0 | 移除硬编码 Key | [待分配] | ⏳ |
| Day 1 | P0 | 同步文档 | [待分配] | ⏳ |
| Day 2 | P1 | 完善错误处理 | [待分配] | ⏳ |
| Day 3 | P1 | Pipeline 测试 | [待分配] | ⏳ |
| Day 4 | P1 | 简化环境配置 | [待分配] | ⏳ |
| Day 5 | P1 | 增加单元测试 | [待分配] | ⏳ |
| Day 6 | P2 | 端到端测试 | [待分配] | ⏳ |
| Day 6 | P2 | 更新文档 | [待分配] | ⏳ |

---

## 风险与缓解

### 风险 1: API Key 泄露已被索引
**影响**: 高  
**缓解**: 立即撤销 Key，监控异常调用，未来使用 git-secrets 防护

### 风险 2: Pipeline 大规模测试可能失败
**影响**: 中  
**缓解**: 先小规模测试（1 卷 2 章），逐步增加规模，准备回滚方案

### 风险 3: 测试覆盖率不达标
**影响**: 低  
**缓解**: 优先测试核心路径，非关键路径可后补

---

## 发布检查清单

上线前必须确认：

- ✅ 所有 P0 问题已修复
- ✅ 所有 P1 问题已修复
- ✅ 端到端测试通过
- ✅ 构建成功无警告
- ✅ 文档更新完成
- ✅ CHANGELOG 发布
- ✅ Git 标签打上（v2.3）

---

**计划结束**

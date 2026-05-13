# Dream Writer 产品架构设计文档

## 一、当前系统 vs 目标架构差距分析

### 当前已实现
| 模块 | 状态 | 说明 |
|------|------|------|
| 小说 CRUD | ✅ | 基础完成 |
| 章节 CRUD | ✅ | 基础完成 |
| 人物卡 | ✅ | 基础字段 |
| 世界观 | ✅ | 基础字段 |
| 知识库 | ✅ | 基础 CRUD |
| AI 生成 | ✅ | 单章生成 |
| 拆书分析 | ✅ | 8 维拆解 |

### 目标架构需要新增
| 模块 | 优先级 | 复杂度 |
|------|--------|--------|
| 灵感层 | P0 | 低 |
| 市场分析层 | P1 | 中 |
| 卷纲系统 | P0 | 中 |
| 章纲系统 | P0 | 中 |
| 爽点系统 | P0 | 中 |
| 记忆系统 | P0 | 高 |
| 一致性校验 | P1 | 高 |
| 多 Agent 协作 | P2 | 高 |

---

## 二、完整产品架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Dream Writer 架构                       │
├─────────────────────────────────────────────────────────────┤
│  前端层 (React)                                              │
│  ├── 小说控制台 (当前卷/主线/情绪/角色状态)                   │
│  ├── 世界观编辑器                                            │
│  ├── 角色关系图                                              │
│  ├── 卷纲/章纲编辑器                                         │
│  ├── 正文编辑器 (带 AI 辅助)                                 │
│  └── 一致性校验面板                                          │
├─────────────────────────────────────────────────────────────┤
│  API 层 (Express)                                            │
│  ├── 小说管理 API                                            │
│  ├── 世界观 API                                              │
│  ├── 角色 API                                                │
│  ├── 剧情 API                                                │
│  ├── 生成 API (SSE 流式)                                     │
│  └── 校验 API                                                │
├─────────────────────────────────────────────────────────────┤
│  Service 层                                                  │
│  ├── NovelService (小说管理)                                 │
│  ├── WorldService (世界观管理)                               │
│  ├── CharacterService (角色管理)                             │
│  ├── PlotService (剧情管理)                                  │
│  ├── VolumeService (卷纲管理)                                │
│  ├── ChapterService (章纲管理)                               │
│  ├── MemoryService (记忆系统)                                │
│  ├── ConsistencyService (一致性校验)                         │
│  └── GenerationService (AI 生成)                             │
├─────────────────────────────────────────────────────────────┤
│  Agent 层 (LangChain)                                        │
│  ├── InspirationAgent (灵感生成)                             │
│  ├── WorldbuildingAgent (世界观构建)                         │
│  ├── CharacterAgent (角色设计)                               │
│  ├── PlotAgent (剧情设计)                                    │
│  ├── WritingAgent (正文写作)                                 │
│  ├── ReviewAgent (校验审核)                                  │
│  └── StyleAgent (风格控制)                                   │
├─────────────────────────────────────────────────────────────┤
│  记忆层                                                      │
│  ├── 短期记忆 (当前章节上下文)                               │
│  ├── 中期记忆 (当前卷剧情线)                                 │
│  ├── 长期记忆 (全书设定/角色/伏笔)                           │
│  └── 向量存储 (Qdrant - RAG 检索)                            │
├─────────────────────────────────────────────────────────────┤
│  数据层 (Prisma + SQLite)                                    │
│  ├── 小说表                                                  │
│  ├── 章节表                                                  │
│  ├── 角色表                                                  │
│  ├── 世界观表                                                │
│  ├── 卷纲表                                                  │
│  ├── 章纲表                                                  │
│  ├── 伏笔表                                                  │
│  ├── 爽点记录表                                              │
│  ├── 一致性问题表                                            │
│  └── 生成日志表                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、数据库 Schema 扩展设计

### 3.1 卷纲表 (Volume)
```prisma
model Volume {
  id          String   @id @default(cuid())
  novelId     String
  sortOrder   Int
  title       String
  goal        String   // 本卷目标
  conflict    String   // 主要冲突
  emotion     String   // 主要情绪
  newChars    String   // 新角色 JSON
  mapName     String   // 新地图
  endHook     String   // 结尾钩子
  status      String   @default("planned")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  novel       Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  chapters    ChapterOutline[]
}
```

### 3.2 章纲表 (ChapterOutline)
```prisma
model ChapterOutline {
  id            String   @id @default(cuid())
  volumeId      String
  novelId       String
  sortOrder     Int
  title         String
  goal          String   // 章节目标
  conflict      String   // 冲突
  emotion       String   // 情绪基调
  hook          String   // 章末钩子
  foreshadowing String   // 伏笔 JSON
  payoff        String   // 回收 JSON
  pleasurePoint String   // 爽点
  status        String   @default("planned")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  volume        Volume   @relation(fields: [volumeId], references: [id])
  novel         Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
}
```

### 3.3 伏笔表 (Foreshadow)
```prisma
model Foreshadow {
  id            String   @id @default(cuid())
  novelId       String
  chapterId     String?  // 埋设章节
  payoffId      String?  // 回收章节
  title         String
  description   String
  status        String   @default("planted") // planted/paid_off/expired
  createdAt     DateTime @default(now())
  
  novel         Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
}
```

### 3.4 爽点记录表 (PleasurePoint)
```prisma
model PleasurePoint {
  id          String   @id @default(cuid())
  novelId     String
  chapterId   String
  type        String   // survival/revenge/resource/status/romantic/intellectual
  description String
  intensity   Int      // 1-10
  createdAt   DateTime @default(now())
  
  novel       Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
}
```

### 3.5 一致性问题表 (ConsistencyIssue)
```prisma
model ConsistencyIssue {
  id          String   @id @default(cuid())
  novelId     String
  chapterId   String?
  type        String   // power/character/world/timeline/foreshadow
  severity    String   // low/medium/high/critical
  description String
  evidence    String
  suggestion  String
  status      String   @default("open") // open/resolved/ignored
  createdAt   DateTime @default(now())
  
  novel       Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
}
```

---

## 四、AI Agent 工作流设计

### 4.1 灵感生成 Agent
```
输入: 类型偏好 + 市场趋势
处理: 
  1. 分析热门作品关键词
  2. 生成 10 个 hook 候选
  3. 评估传播性
输出: { book_hook, high_concept, market_tags, reader_emotion }
```

### 4.2 世界观构建 Agent
```
输入: 小说类型 + 核心设定
处理:
  1. 生成修炼体系
  2. 生成势力结构
  3. 生成资源循环
  4. 生成社会规则
输出: 完整世界观 JSON
```

### 4.3 角色设计 Agent
```
输入: 世界观 + 角色定位
处理:
  1. 生成基础信息
  2. 生成行为逻辑
  3. 生成关系网络
  4. 生成成长线
输出: 角色卡 JSON
```

### 4.4 剧情设计 Agent
```
输入: 世界观 + 角色 + 卷目标
处理:
  1. 设计明线
  2. 设计暗线
  3. 设计情绪线
  4. 设计爽点分布
输出: 剧情结构 JSON
```

### 4.5 正文写作 Agent
```
输入: 章纲 + 记忆上下文 + 风格要求
处理:
  1. 生成场景骨架
  2. 生成对话
  3. 生成动作描写
  4. 润色去 AI 味
输出: 正文文本
```

### 4.6 一致性校验 Agent
```
输入: 新章节 + 历史记忆
处理:
  1. 检查战力崩坏
  2. 检查人设崩坏
  3. 检查世界观冲突
  4. 检查时间线错误
  5. 检查伏笔遗忘
输出: 问题列表 + 修复建议
```

---

## 五、Prompt System 设计

### 5.1 灵感生成 Prompt
```
你是一位资深网文策划编辑，擅长把握市场趋势和读者心理。

请基于以下信息生成小说核心概念：
- 目标类型: {genre}
- 目标读者: {audience}
- 市场趋势: {trends}

要求：
1. 生成一个极具传播性的一句话 hook
2. 分析这个 hook 为什么能吸引读者
3. 列出 5 个核心爽点
4. 评估市场潜力

输出 JSON 格式。
```

### 5.2 正文生成 Prompt
```
你是一位专业的中文网络小说作家，风格{style}。

当前状态：
- 小说名: {novel_title}
- 当前卷: {volume_title}
- 章节名: {chapter_title}
- 章节目标: {chapter_goal}
- 情绪基调: {emotion}
- 爽点设计: {pleasure_point}

记忆上下文：
{memory_context}

要求：
1. 严格按照章纲写作
2. 保持人设一致性
3. 控制节奏，不要写太满
4. 章末必须有钩子
5. 去除 AI 味，多用短句和对话

请开始写作。
```

### 5.3 一致性校验 Prompt
```
你是一位严格的小说编辑，负责检查长篇小说的一致性。

请检查以下内容：
1. 战力系统是否崩坏
2. 角色行为是否符合人设
3. 世界观是否自洽
4. 时间线是否正确
5. 伏笔是否遗忘

历史记忆：
{memory_context}

新章节：
{new_chapter}

请列出所有问题，并给出修复建议。
```

---

## 六、记忆系统设计

### 6.1 记忆分层
```
短期记忆 (当前章节)
├── 当前场景
├── 正在对话的角色
├── 当前冲突
└── 未完成动作

中期记忆 (当前卷)
├── 本卷主线进度
├── 已出场角色
├── 已发生事件
└── 未回收伏笔

长期记忆 (全书)
├── 世界观设定
├── 角色基础设定
├── 历史事件
├── 已回收伏笔
└── 风格规范
```

### 6.2 记忆检索策略
```
生成新章节时：
1. 加载长期记忆 (世界观/角色设定)
2. 加载中期记忆 (本卷剧情线)
3. 加载短期记忆 (上一章结尾)
4. RAG 检索相关记忆片段
5. 组装成完整上下文
```

---

## 七、MVP 实施路线图

### 第一阶段：基础框架 (1-2 周)
- [ ] 扩展数据库 Schema (卷纲/章纲/伏笔/爽点)
- [ ] 实现卷纲 CRUD API
- [ ] 实现章纲 CRUD API
- [ ] 前端卷纲/章纲编辑器

### 第二阶段：记忆系统 (1-2 周)
- [ ] 实现记忆分层存储
- [ ] 实现记忆检索 API
- [ ] 集成 RAG 向量检索
- [ ] 前端记忆面板

### 第三阶段：AI 增强 (2-3 周)
- [ ] 实现灵感生成 Agent
- [ ] 实现卷纲生成 Agent
- [ ] 实现章纲生成 Agent
- [ ] 增强正文生成 (带记忆)

### 第四阶段：一致性校验 (1-2 周)
- [ ] 实现一致性检查 Agent
- [ ] 实现问题管理 API
- [ ] 前端校验面板

### 第五阶段：多 Agent 协作 (2-3 周)
- [ ] 实现 Agent 编排
- [ ] 实现风格控制
- [ ] 实现去 AI 味引擎

---

## 八、技术选型

| 模块 | 技术 | 说明 |
|------|------|------|
| 前端 | React + TypeScript | 已有 |
| 后端 | Express + Prisma | 已有 |
| 数据库 | SQLite | 本地优先 |
| AI 调用 | LangChain.js | 灵活编排 |
| 向量存储 | Qdrant | RAG 检索 |
| 流式输出 | SSE | 已有 |

---

## 九、核心创新点

1. **记忆驱动创作** - 不是无脑生成，而是基于结构化记忆的精准创作
2. **一致性守护** - 自动检测并修复长篇崩坏问题
3. **爽点节奏控制** - 数据化管理爽点分布，避免重复
4. **分层创作** - 从灵感→卷纲→章纲→正文，逐层细化
5. **风格引擎** - 可配置的写作风格，支持模仿不同作者

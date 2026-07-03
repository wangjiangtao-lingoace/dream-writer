# P0 优化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现审计报告中的P0优先级优化，提升用户体验和代码质量

**Architecture:** 基于现有React + Express架构，优化前端组件结构和后端API，不改变核心数据模型

**Tech Stack:** React 19, TypeScript, Express 5, Prisma 7, SQLite

---

## 任务概览

| 任务 | 优先级 | 预估工期 | 依赖 |
|------|--------|----------|------|
| Task 1: NovelWorkspace组件拆分 | P0 | 2天 | 无 |
| Task 2: 工作台tab精简（14→5） | P0 | 3天 | Task 1 |
| Task 3: Pipeline后台执行 | P0 | 2天 | 无 |
| Task 4: 章节版本历史 | P0 | 3天 | 无 |
| Task 5: CharacterRelation改用ID引用 | P0 | 1天 | 无 |

---

## Task 1: NovelWorkspace组件拆分

**Files:**
- Modify: `client/src/pages/NovelWorkspace.tsx`
- Create: `client/src/components/workspace/WorkspaceWriteLayout.tsx`
- Create: `client/src/components/workspace/WorkspaceStandardLayout.tsx`
- Create: `client/src/components/workspace/WorkspaceHeader.tsx`
- Create: `client/src/components/workspace/WorkspaceContent.tsx`
- Test: `client/src/components/workspace/__tests__/WorkspaceWriteLayout.test.tsx`

**目标:** 将1100行的NovelWorkspace.tsx拆分为5个职责清晰的子组件

- [ ] **Step 1: 创建WorkspaceWriteLayout组件**

```tsx
// client/src/components/workspace/WorkspaceWriteLayout.tsx
import React from 'react';
import { AIProgressBanner } from './AIProgressBanner';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { ChapterSidebar } from './ChapterSidebar';
import { RichTextEditor } from './RichTextEditor';
import { ChapterHeaderView } from './ChapterHeaderView';
import { AssetPanel } from './AssetPanel';
import { WorkspaceBottomBar } from './WorkspaceBottomBar';

interface WorkspaceWriteLayoutProps {
  // 定义props
}

export const WorkspaceWriteLayout: React.FC<WorkspaceWriteLayoutProps> = ({
  // 解构props
}) => {
  return (
    // 实现3列布局
  );
};
```

- [ ] **Step 2: 创建WorkspaceStandardLayout组件**

```tsx
// client/src/components/workspace/WorkspaceStandardLayout.tsx
import React from 'react';
import { AIPanel } from '../layout/AIPanel';
import { WorkspaceSidebar } from './WorkspaceSidebar';

interface WorkspaceStandardLayoutProps {
  // 定义props
}

export const WorkspaceStandardLayout: React.FC<WorkspaceStandardLayoutProps> = ({
  // 解构props
}) => {
  return (
    // 实现标准布局
  );
};
```

- [ ] **Step 3: 创建WorkspaceHeader组件**

```tsx
// client/src/components/workspace/WorkspaceHeader.tsx
import React from 'react';

interface WorkspaceHeaderProps {
  title: string;
  onBack: () => void;
  onSave: () => void;
  onPipeline: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  title,
  onBack,
  onSave,
  onPipeline,
}) => {
  return (
    // 实现头部
  );
};
```

- [ ] **Step 4: 重构NovelWorkspace.tsx**

将现有逻辑拆分到子组件中，保留状态管理和路由逻辑。

- [ ] **Step 5: 测试验证**

确保所有功能正常工作，无回归问题。

- [ ] **Step 6: 提交代码**

```bash
git add client/src/components/workspace/ client/src/pages/NovelWorkspace.tsx
git commit -m "refactor(workspace): split NovelWorkspace into 5 sub-components"
```

---

## Task 2: 工作台tab精简（14→5）

**Files:**
- Modify: `client/src/pages/NovelWorkspace.tsx`
- Modify: `client/src/components/workspace/types.ts`
- Modify: `client/src/router/index.tsx`

**目标:** 将14个tab精简为5个主要工作区

- [ ] **Step 1: 定义新的tab结构**

```typescript
// 新的5个tab结构
type WorkspaceGroupId = 'writing' | 'outline' | 'assets' | 'quality' | 'ai';

// 合并后的tab映射
const TAB_MERGE_MAP = {
  // 写作组：保留write, 移除analysis（合并到AI组）
  writing: ['write'],
  // 大纲组：合并outline, volumes, mainlines, hooks
  outline: ['outline', 'volumes', 'mainlines', 'hooks'],
  // 资产组：合并characters, relations, worldviews, style, knowledge
  assets: ['characters', 'relations', 'worldviews', 'style', 'knowledge'],
  // 质量组：保留memory, consistency
  quality: ['memory', 'consistency'],
  // AI组：新增，包含dashboard和analysis
  ai: ['dashboard', 'analysis'],
};
```

- [ ] **Step 2: 更新groupDefs配置**

```typescript
const groupDefs: WorkspaceGroupDef[] = [
  {
    id: 'writing',
    label: '写作',
    tabs: [{ key: 'write', label: '写作' }],
  },
  {
    id: 'outline',
    label: '大纲',
    tabs: [
      { key: 'outline', label: '大纲' },
      { key: 'volumes', label: '卷纲' },
      { key: 'mainlines', label: '主线' },
      { key: 'hooks', label: '钩子' },
    ],
  },
  // ... 其他组
];
```

- [ ] **Step 3: 更新路由配置**

```typescript
// 简化路由
{ path: "novel/:id", element: <NovelWorkspace /> },
{ path: "novel/:id/:tab", element: <NovelWorkspace /> },
```

- [ ] **Step 4: 测试验证**

确保所有tab切换正常，内容显示正确。

- [ ] **Step 5: 提交代码**

```bash
git add client/src/pages/NovelWorkspace.tsx client/src/components/workspace/types.ts client/src/router/index.tsx
git commit -m "refactor(workspace): reduce tabs from 14 to 5 groups"
```

---

## Task 3: Pipeline后台执行

**Files:**
- Modify: `server/src/services/PipelineService.ts`
- Modify: `server/src/routes/pipeline.ts`
- Modify: `client/src/pages/NovelWorkspace.tsx`

**目标:** Pipeline执行不阻塞用户操作

- [ ] **Step 1: 修改PipelineService为异步执行**

```typescript
// server/src/services/PipelineService.ts
export class PipelineService {
  async startPipeline(novelId: string, config: PipelineConfig): Promise<string> {
    // 创建PipelineJob记录
    const job = await this.createJob(novelId, config);

    // 异步执行，不等待完成
    this.executePipelineAsync(job.id).catch(error => {
      console.error('Pipeline execution failed:', error);
      this.updateJobStatus(job.id, 'error', error.message);
    });

    return job.id;
  }

  private async executePipelineAsync(jobId: string): Promise<void> {
    // 异步执行逻辑
  }
}
```

- [ ] **Step 2: 添加进度查询API**

```typescript
// server/src/routes/pipeline.ts
router.get('/api/pipeline/:jobId/progress', async (req, res) => {
  const { jobId } = req.params;
  const progress = await pipelineService.getProgress(jobId);
  res.json(progress);
});
```

- [ ] **Step 3: 前端轮询进度**

```typescript
// client/src/pages/NovelWorkspace.tsx
useEffect(() => {
  if (pipelineJobId) {
    const interval = setInterval(async () => {
      const progress = await api.get(`/api/pipeline/${pipelineJobId}/progress`);
      setPipelineProgress(progress);
      if (progress.status === 'completed' || progress.status === 'error') {
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }
}, [pipelineJobId]);
```

- [ ] **Step 4: 测试验证**

确保Pipeline可以在后台执行，用户可以继续其他操作。

- [ ] **Step 5: 提交代码**

```bash
git add server/src/services/PipelineService.ts server/src/routes/pipeline.ts client/src/pages/NovelWorkspace.tsx
git commit -m "feat(pipeline): enable background execution without blocking UI"
```

---

## Task 4: 章节版本历史

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/src/services/ChapterRevisionService.ts`
- Modify: `server/src/routes/chapters.ts`
- Create: `client/src/components/ChapterRevisionHistory.tsx`

**目标:** 添加章节版本历史功能，支持回滚

- [ ] **Step 1: 添加ChapterRevision模型**

```prisma
// server/prisma/schema.prisma
model ChapterRevision {
  id          String   @id @default(cuid())
  chapterId   String
  chapter     Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
  content     String
  wordCount   Int
  revision    Int      // 版本号
  createdAt   DateTime @default(now())

  @@unique([chapterId, revision])
  @@index([chapterId, revision])
}
```

- [ ] **Step 2: 创建ChapterRevisionService**

```typescript
// server/src/services/ChapterRevisionService.ts
export class ChapterRevisionService {
  async createRevision(chapterId: string, content: string): Promise<ChapterRevision> {
    const lastRevision = await this.getLastRevision(chapterId);
    const newRevision = (lastRevision?.revision || 0) + 1;

    return await prisma.chapterRevision.create({
      data: {
        chapterId,
        content,
        wordCount: content.length,
        revision: newRevision,
      },
    });
  }

  async getRevisions(chapterId: string): Promise<ChapterRevision[]> {
    return await prisma.chapterRevision.findMany({
      where: { chapterId },
      orderBy: { revision: 'desc' },
    });
  }

  async rollbackToRevision(chapterId: string, revision: number): Promise<Chapter> {
    const revisionData = await prisma.chapterRevision.findUnique({
      where: { chapterId_revision: { chapterId, revision } },
    });

    if (!revisionData) {
      throw new Error('Revision not found');
    }

    return await prisma.chapter.update({
      where: { id: chapterId },
      data: { content: revisionData.content, wordCount: revisionData.wordCount },
    });
  }
}
```

- [ ] **Step 3: 添加API路由**

```typescript
// server/src/routes/chapters.ts
router.get('/api/chapters/:chapterId/revisions', async (req, res) => {
  const { chapterId } = req.params;
  const revisions = await chapterRevisionService.getRevisions(chapterId);
  res.json(revisions);
});

router.post('/api/chapters/:chapterId/revisions/:revision/rollback', async (req, res) => {
  const { chapterId, revision } = req.params;
  const chapter = await chapterRevisionService.rollbackToRevision(chapterId, parseInt(revision));
  res.json(chapter);
});
```

- [ ] **Step 4: 创建前端组件**

```tsx
// client/src/components/ChapterRevisionHistory.tsx
import React, { useState, useEffect } from 'react';

interface ChapterRevisionHistoryProps {
  chapterId: string;
  onRollback: (revision: number) => void;
}

export const ChapterRevisionHistory: React.FC<ChapterRevisionHistoryProps> = ({
  chapterId,
  onRollback,
}) => {
  const [revisions, setRevisions] = useState<any[]>([]);

  useEffect(() => {
    loadRevisions();
  }, [chapterId]);

  const loadRevisions = async () => {
    const data = await api.get(`/api/chapters/${chapterId}/revisions`);
    setRevisions(data);
  };

  return (
    <div className="revision-history">
      <h3>版本历史</h3>
      {revisions.map((rev) => (
        <div key={rev.id} className="revision-item">
          <span>版本 {rev.revision}</span>
          <span>{rev.wordCount} 字</span>
          <span>{new Date(rev.createdAt).toLocaleString()}</span>
          <button onClick={() => onRollback(rev.revision)}>回滚</button>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 5: 测试验证**

确保版本历史正确记录，回滚功能正常。

- [ ] **Step 6: 提交代码**

```bash
git add server/prisma/schema.prisma server/src/services/ChapterRevisionService.ts server/src/routes/chapters.ts client/src/components/ChapterRevisionHistory.tsx
git commit -m "feat(chapters): add version history with rollback support"
```

---

## Task 5: CharacterRelation改用ID引用

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/src/scripts/migrate-character-relations.ts`
- Modify: `server/src/routes/characters.ts`

**目标:** 将CharacterRelation的charA/charB从name改为characterId

- [ ] **Step 1: 更新schema**

```prisma
// server/prisma/schema.prisma
model CharacterRelation {
  id          String   @id @default(cuid())
  novelId     String
  novel       Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  charAId     String   // 改为ID引用
  charBId     String   // 改为ID引用
  charA       Character @relation("CharARelations", fields: [charAId], references: [id], onDelete: Cascade)
  charB       Character @relation("CharBRelations", fields: [charBId], references: [id], onDelete: Cascade)
  relType     String
  description String?
  startChapter Int?
  endChapter  Int?
  status      String   @default("active")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([novelId, charAId, charBId])
  @@index([novelId, charAId])
  @@index([novelId, charBId])
}
```

- [ ] **Step 2: 创建迁移脚本**

```typescript
// server/src/scripts/migrate-character-relations.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateCharacterRelations() {
  const relations = await prisma.characterRelation.findMany();

  for (const relation of relations) {
    const charA = await prisma.character.findFirst({
      where: { novelId: relation.novelId, name: relation.charA },
    });
    const charB = await prisma.character.findFirst({
      where: { novelId: relation.novelId, name: relation.charB },
    });

    if (charA && charB) {
      await prisma.characterRelation.update({
        where: { id: relation.id },
        data: { charAId: charA.id, charBId: charB.id },
      });
    }
  }
}

migrateCharacterRelations()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: 更新API路由**

```typescript
// server/src/routes/characters.ts
router.post('/api/characters/:characterId/relations', async (req, res) => {
  const { characterId } = req.params;
  const { targetCharacterId, relType, description } = req.body;

  const relation = await prisma.characterRelation.create({
    data: {
      novelId: req.body.novelId,
      charAId: characterId,
      charBId: targetCharacterId,
      relType,
      description,
    },
  });

  res.json(relation);
});
```

- [ ] **Step 4: 测试验证**

确保关系创建、查询、删除功能正常。

- [ ] **Step 5: 提交代码**

```bash
git add server/prisma/schema.prisma server/src/scripts/migrate-character-relations.ts server/src/routes/characters.ts
git commit -m "refactor(characters): change CharacterRelation to use ID references"
```

---

## 执行顺序

1. Task 1: NovelWorkspace组件拆分 (2天)
2. Task 2: 工作台tab精简 (3天) - 依赖Task 1
3. Task 3: Pipeline后台执行 (2天) - 可并行
4. Task 4: 章节版本历史 (3天) - 可并行
5. Task 5: CharacterRelation改用ID (1天) - 可并行

**总工期:** 约8天（考虑依赖关系）

---

## 验证清单

- [ ] 所有功能正常工作
- [ ] 无回归问题
- [ ] 代码符合项目规范
- [ ] 测试覆盖关键路径
- [ ] 文档更新（如需要）

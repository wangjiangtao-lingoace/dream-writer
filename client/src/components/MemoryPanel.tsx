import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { ConfirmDialog } from "./ui/CommonComponents";
import SmartJsonViewer from "./SmartJsonViewer";

interface Memory {
  id: string;
  novelId: string;
  type: string;
  category: string;
  title: string;
  content: string;
  importance: number;
  level?: string;
  chapterId?: string | null;
  metadata: string;
  createdAt: string;
  updatedAt: string;
}

interface MemoryStats {
  total: number;
  world: number;
  character: number;
  plot: number;
  foreshadow: number;
  pleasure: number;
  style: number;
}

interface StoryState {
  currentVolume: number;
  currentChapter: number;
  currentStage: string;
  protagonist: {
    level: string;
    goal: string;
    situation: string;
  };
  emotion: {
    current: string;
    intensity: number;
    suppressedValue: number;
  };
  pleasurePoint: {
    lastChapter: number;
    cooldown: number;
  };
  foreshadow: {
    activeCount: number;
    pendingCount: number;
  };
}

interface MemoryLevelStats {
  permanent: number;
  longTerm: number;
  shortTerm: number;
  temporary: number;
}

type MemoryLevel = "permanent" | "longTerm" | "shortTerm" | "temporary";

interface MemoryPanelProps {
  novelId: string;
  onNotice: (msg: string) => void;
}

const MEMORY_TYPES = [
  { value: "world", label: "世界记忆", icon: "🌍" },
  { value: "character", label: "角色记忆", icon: "👤" },
  { value: "plot", label: "剧情记忆", icon: "📖" },
  { value: "foreshadow", label: "伏笔记忆", icon: "🔗" },
  { value: "pleasure", label: "爽点记忆", icon: "⚡" },
  { value: "style", label: "风格记忆", icon: "✍️" },
];

const MEMORY_LEVELS: { value: MemoryLevel; label: string; color: string }[] = [
  { value: "permanent", label: "永久记忆", color: "var(--error)" },
  { value: "longTerm", label: "长期记忆", color: "var(--warning)" },
  { value: "shortTerm", label: "短期记忆", color: "var(--info)" },
  { value: "temporary", label: "临时记忆", color: "var(--text-muted)" },
];

export default function MemoryPanel({ novelId, onNotice }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [storyState, setStoryState] = useState<StoryState | null>(null);
  const [levelStats, setLevelStats] = useState<MemoryLevelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<MemoryLevel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showStoryState, setShowStoryState] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [form, setForm] = useState({
    type: "world",
    category: "",
    title: "",
    content: "",
    importance: 5,
    level: "shortTerm" as MemoryLevel,
  });

  async function loadMemories() {
    setLoading(true);
    try {
      const url = activeType
        ? `/api/memories/${novelId}?type=${activeType}`
        : `/api/memories/${novelId}`;
      const list = await api<Memory[]>(url);
      setMemories(list);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载记忆失败。");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      const data = await api<MemoryStats>(`/api/memories/${novelId}/stats`);
      setStats(data);
    } catch (error) {
      console.error("加载统计失败:", error);
    }
  }

  const loadStoryState = useCallback(async () => {
    try {
      const data = await api<StoryState>(`/api/story-state/${novelId}`);
      setStoryState(data);
    } catch (error) {
      console.error("加载剧情状态失败:", error);
    }
  }, [novelId]);

  const loadLevelStats = useCallback(async () => {
    try {
      const data = await api<MemoryLevelStats>(`/api/memories/${novelId}/level-stats`);
      setLevelStats(data);
    } catch (error) {
      console.error("加载层级统计失败:", error);
    }
  }, [novelId]);

  function requestCompress() {
    setConfirmAction({
      title: "压缩记忆",
      message: "确定要压缩记忆？这将合并相似记忆并减少总数量。",
      onConfirm: doCompress,
    });
  }

  async function doCompress() {
    setConfirmAction(null);
    setCompressing(true);
    try {
      const result = await api<{ compressed: number }>(`/api/memory-compression/${novelId}/consolidate`, {
        method: "POST",
      });
      onNotice(`压缩完成，减少了 ${result.compressed} 条记忆。`);
      await loadMemories();
      await loadStats();
      await loadLevelStats();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "压缩失败。");
    } finally {
      setCompressing(false);
    }
  }

  async function handleAutoManage() {
    setCompressing(true);
    try {
      const result = await api<{ managed: number }>(`/api/memory-compression/${novelId}/auto-manage`, {
        method: "POST",
      });
      onNotice(`自动管理完成，处理了 ${result.managed} 条记忆。`);
      await loadMemories();
      await loadStats();
      await loadLevelStats();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "自动管理失败。");
    } finally {
      setCompressing(false);
    }
  }

  useEffect(() => {
    loadMemories();
    loadStats();
    loadStoryState();
    loadLevelStats();
  }, [novelId, activeType, loadStoryState, loadLevelStats]);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      onNotice("标题和内容不能为空。");
      return;
    }
    try {
      if (editingId) {
        await api(`/api/memories/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        onNotice("记忆已更新。");
      } else {
        await api(`/api/memories/${novelId}`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        onNotice("记忆已创建。");
      }
      resetForm();
      await loadMemories();
      await loadStats();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存记忆失败。");
    }
  }

  function requestDelete(id: string) {
    setConfirmAction({
      title: "删除记忆",
      message: "确定删除此记忆？此操作不可撤销。",
      onConfirm: () => doDelete(id),
    });
  }

  async function doDelete(id: string) {
    setConfirmAction(null);
    try {
      await api(`/api/memories/${id}`, { method: "DELETE" });
      onNotice("记忆已删除。");
      await loadMemories();
      await loadStats();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除记忆失败。");
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      await loadMemories();
      return;
    }
    try {
      const results = await api<Memory[]>(
        `/api/memories/${novelId}/search?q=${encodeURIComponent(searchQuery)}${activeType ? `&type=${activeType}` : ""}`
      );
      setMemories(results);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "搜索失败。");
    }
  }

  function handleEdit(memory: Memory) {
    setEditingId(memory.id);
    setForm({
      type: memory.type,
      category: memory.category,
      title: memory.title,
      content: memory.content,
      importance: memory.importance,
      level: (memory.level as MemoryLevel) || "shortTerm",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ type: "world", category: "", title: "", content: "", importance: 5, level: "shortTerm" });
    setShowForm(false);
  }

  const typeLabel = (type: string) => {
    return MEMORY_TYPES.find((t) => t.value === type)?.label || type;
  };

  const typeIcon = (type: string) => {
    return MEMORY_TYPES.find((t) => t.value === type)?.icon || "📝";
  };

  const levelLabel = (level?: string) => {
    return MEMORY_LEVELS.find((l) => l.value === level)?.label || "未知";
  };

  const levelColor = (level?: string) => {
    return MEMORY_LEVELS.find((l) => l.value === level)?.color || "#f3f4f6";
  };

  const getLevelBadgeStyle = (level?: string): React.CSSProperties => {
    const color = levelColor(level);
    return {
      backgroundColor: color,
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "0.75rem",
      fontWeight: 500,
    };
  };

  return (
    <section className="memory-panel">
      <header className="section-header">
        <div>
          <h2>记忆系统</h2>
          <p>管理小说的结构化记忆，支持按类型筛选和搜索。</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="primary-button" type="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "收起" : "添加记忆"}
          </button>
          <button
            type="button"
            onClick={() => setShowStoryState(!showStoryState)}
          >
            {showStoryState ? "隐藏剧情状态" : "剧情状态"}
          </button>
        </div>
      </header>

      {/* 剧情状态可视化 */}
      {showStoryState && storyState && (
        <div className="story-state-panel">
          <h3>剧情状态</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-3)" }}>
            <div className="story-state-card">
              <div className="story-state-label">当前进度</div>
              <div>第 {storyState.currentVolume} 卷 · 第 {storyState.currentChapter} 章</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>阶段：{storyState.currentStage}</div>
            </div>
            <div className="story-state-card">
              <div className="story-state-label">主角状态</div>
              <div>等级：{storyState.protagonist.level}</div>
              <div style={{ fontSize: "var(--text-sm)" }}>目标：{storyState.protagonist.goal}</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>处境：{storyState.protagonist.situation}</div>
            </div>
            <div className="story-state-card">
              <div className="story-state-label">情绪状态</div>
              <div>当前：{storyState.emotion.current}</div>
              <div style={{ fontSize: "var(--text-sm)" }}>强度：{storyState.emotion.intensity}/10</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--error)" }}>压抑值：{storyState.emotion.suppressedValue}</div>
            </div>
            <div className="story-state-card">
              <div className="story-state-label">爽点状态</div>
              <div>上次爽点：第 {storyState.pleasurePoint.lastChapter} 章</div>
              <div style={{ fontSize: "var(--text-sm)" }}>冷却值：{storyState.pleasurePoint.cooldown}</div>
            </div>
            <div className="story-state-card">
              <div className="story-state-label">伏笔状态</div>
              <div>活跃伏笔：{storyState.foreshadow.activeCount} 个</div>
              <div style={{ fontSize: "var(--text-sm)" }}>待回收：{storyState.foreshadow.pendingCount} 个</div>
            </div>
          </div>
        </div>
      )}

      {/* 记忆统计和层级统计 */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
        {stats && (
          <div className="memory-stats" style={{ flex: 1 }}>
            {MEMORY_TYPES.map((type) => (
              <article
                key={type.value}
                className={activeType === type.value ? "active" : ""}
                onClick={() => setActiveType(activeType === type.value ? null : type.value)}
              >
                <strong>{stats[type.value as keyof MemoryStats] || 0}</strong>
                <span>{type.icon} {type.label}</span>
              </article>
            ))}
          </div>
        )}
        {levelStats && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>层级：</span>
            {MEMORY_LEVELS.map((level) => (
              <div
                key={level.value}
                style={{
                  ...getLevelBadgeStyle(level.value),
                  cursor: "pointer",
                  border: activeLevel === level.value ? "2px solid #3b82f6" : "2px solid transparent",
                }}
                onClick={() => setActiveLevel(activeLevel === level.value ? null : level.value)}
                title={`${level.label}: ${levelStats[level.value]} 条`}
              >
                {level.label}: {levelStats[level.value]}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 压缩操作 */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button
          type="button"
          onClick={requestCompress}
          disabled={compressing}
          style={{ opacity: compressing ? 0.6 : 1 }}
        >
          {compressing ? "压缩中..." : "压缩记忆"}
        </button>
        <button
          type="button"
          onClick={handleAutoManage}
          disabled={compressing}
          style={{ opacity: compressing ? 0.6 : 1 }}
        >
          {compressing ? "处理中..." : "自动管理"}
        </button>
      </div>

      {/* 搜索框 */}
      <div className="memory-search">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索记忆..."
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button type="button" onClick={handleSearch}>搜索</button>
        {searchQuery && (
          <button type="button" onClick={() => { setSearchQuery(""); loadMemories(); }}>清除</button>
        )}
      </div>

      {/* 记忆表单 */}
      {showForm && (
        <div className="memory-form">
          <h3>{editingId ? "编辑记忆" : "添加记忆"}</h3>
          <div className="form-row">
            <label>
              <span>类型</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                {MEMORY_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>层级</span>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value as MemoryLevel })}
              >
                {MEMORY_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>分类</span>
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="可选，如：宗门/地图/势力"
              />
            </label>
            <label>
              <span>重要程度 ({form.importance})</span>
              <input
                type="range"
                min="1"
                max="10"
                value={form.importance}
                onChange={(e) => setForm({ ...form, importance: parseInt(e.target.value) })}
              />
            </label>
          </div>
          <label>
            <span>标题 *</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="记忆标题"
            />
          </label>
          <label>
            <span>内容 *</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="记忆内容，支持多行文本"
              rows={4}
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" type="button" onClick={handleSave}>
              {editingId ? "更新" : "创建"}
            </button>
            <button type="button" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}

      {/* 记忆列表 */}
      <div className="memory-list">
        {loading ? (
          <p className="empty-note">加载中...</p>
        ) : memories.length === 0 ? (
          <p className="empty-note">
            {searchQuery ? "没有找到匹配的记忆。" : "还没有记忆。点击'添加记忆'开始积累。"}
          </p>
        ) : (
          memories.map((memory) => (
            <article
              key={memory.id}
              className="memory-card"
              style={{ borderLeft: `4px solid ${levelColor(memory.level)}` }}
            >
              <header>
                <span className="memory-icon">{typeIcon(memory.type)}</span>
                <div className="memory-meta">
                  <strong>{memory.title}</strong>
                  <span className="memory-type">{typeLabel(memory.type)}</span>
                </div>
                <span style={getLevelBadgeStyle(memory.level)}>
                  {levelLabel(memory.level)}
                </span>
                <span
                  className="memory-importance"
                  title={`重要程度: ${memory.importance}/10`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{
                    display: "inline-block",
                    width: "4rem",
                    height: "0.375rem",
                    borderRadius: "9999px",
                    background: "var(--border)",
                    overflow: "hidden",
                  }}>
                    <span style={{
                      display: "block",
                      width: `${memory.importance * 10}%`,
                      height: "100%",
                      borderRadius: "9999px",
                      background: memory.importance >= 8 ? "#ef4444" : memory.importance >= 5 ? "#f59e0b" : "#22c55e",
                    }} />
                  </span>
                  {memory.importance}/10
                </span>
              </header>
              <div className="memory-content">
                <SmartJsonViewer
                  data={memory.content}
                  maxDepth={2}
                />
              </div>
              {memory.category && (
                <div className="memory-category">
                  <span>分类：{memory.category}</span>
                </div>
              )}
              <div className="card-actions">
                <button type="button" onClick={() => handleEdit(memory)}>编辑</button>
                <button type="button" onClick={() => requestDelete(memory.id)}>删除</button>
              </div>
            </article>
          ))
        )}
      </div>
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmText="确认"
          cancelText="取消"
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
          variant="danger"
        />
      )}
    </section>
  );
}

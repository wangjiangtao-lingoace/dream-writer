import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { toast } from "../ui/toast";

const HookPanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const [hooks, setHooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "suspense",
    intensity: 5,
  });

  useEffect(() => {
    loadHooks();
  }, [novelId]);

  const loadHooks = async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>(`/api/novels/${novelId}/hooks`);
      setHooks(data || []);
    } catch (error) {
      console.error("加载钩子失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      toast.error("请输入钩子标题");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/api/novels/${novelId}/hooks/${editingId}`, formData);
      } else {
        await api.post(`/api/novels/${novelId}/hooks`, formData);
      }
      setFormData({ title: "", description: "", type: "suspense", intensity: 5 });
      setShowForm(false);
      setEditingId(null);
      loadHooks();
    } catch (error) {
      console.error("保存钩子失败:", error);
    }
  };

  const handleEdit = (hook: any) => {
    setEditingId(hook.id);
    setFormData({
      title: hook.title,
      description: hook.description || "",
      type: hook.type || "suspense",
      intensity: hook.intensity || 5,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个钩子吗？")) return;
    try {
      await api.delete(`/api/novels/${novelId}/hooks/${id}`);
      loadHooks();
    } catch (error) {
      console.error("删除钩子失败:", error);
    }
  };

  const handleAIGenerate = async () => {
    try {
      setGenerating(true);
      const result = await api.post<{ hooks: any[] }>("/api/ai/generate-hooks", { novelId });
      if (result.hooks && result.hooks.length > 0) {
        for (const hook of result.hooks) {
          await api.post(`/api/novels/${novelId}/hooks`, hook);
        }
        await loadHooks();
        toast.success(`已生成 ${result.hooks.length} 个钩子`);
      }
    } catch (error) {
      console.error("AI生成钩子失败:", error);
      toast.error("AI生成钩子失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      suspense: "悬念",
      foreshadow: "伏笔",
      cliffhanger: "悬念",
      comedy: "喜剧",
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="hook-panel">
      <div className="panel-header">
        <h2>故事钩子</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-ai"
            onClick={handleAIGenerate}
            disabled={generating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.75rem",
              background: generating ? "var(--border-default)" : "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {generating ? "生成中..." : "AI批量预设钩子"}
          </button>
          <button className="btn-add" onClick={() => { setEditingId(null); setFormData({ title: "", description: "", type: "suspense", intensity: 5 }); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加钩子
          </button>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <input
            type="text"
            placeholder="钩子标题"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <textarea
            placeholder="钩子描述"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="form-row">
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="suspense">悬念</option>
              <option value="foreshadow">伏笔</option>
              <option value="cliffhanger">悬念</option>
              <option value="comedy">喜剧</option>
            </select>
            <div className="range-group">
              <label>强度</label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.intensity}
                onChange={(e) => setFormData({ ...formData, intensity: parseInt(e.target.value) })}
              />
              <span>{formData.intensity}</span>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreate}>{editingId ? "更新" : "创建"}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
          </div>
        </div>
      )}

      <div className="hook-list">
        {hooks.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 22V8" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              <circle cx="12" cy="5" r="3" />
            </svg>
            <p>暂无钩子，点击上方按钮添加或使用AI生成</p>
          </div>
        ) : (
          hooks.map((hook) => (
            <div key={hook.id} className="hook-item">
              <div className="hook-content">
                <h3>{hook.title}</h3>
                <p>{hook.description || "暂无描述"}</p>
                <div className="hook-meta">
                  <span className="type">{getTypeLabel(hook.type)}</span>
                  <span className="intensity">强度: {hook.intensity}/10</span>
                  <span className={`status ${hook.status}`}>
                    {hook.status === "planted" ? "已埋设" : hook.status}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn-edit"
                  onClick={() => handleEdit(hook)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(hook.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default HookPanel;

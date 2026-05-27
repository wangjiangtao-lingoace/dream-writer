import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";

const MainlinePanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const [mainlines, setMainlines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", description: "" });

  useEffect(() => {
    loadMainlines();
  }, [novelId]);

  const loadMainlines = async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>(`/api/novels/${novelId}/mainlines`);
      setMainlines(data || []);
    } catch (error) {
      console.error("加载主线失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      alert("请输入主线标题");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/api/novels/${novelId}/mainlines/${editingId}`, formData);
      } else {
        await api.post(`/api/novels/${novelId}/mainlines`, formData);
      }
      setFormData({ title: "", description: "" });
      setShowForm(false);
      setEditingId(null);
      loadMainlines();
    } catch (error) {
      console.error("保存主线失败:", error);
    }
  };

  const handleEdit = (mainline: any) => {
    setEditingId(mainline.id);
    setFormData({ title: mainline.title, description: mainline.description || "" });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条主线吗？")) return;
    try {
      await api.delete(`/api/novels/${novelId}/mainlines/${id}`);
      loadMainlines();
    } catch (error) {
      console.error("删除主线失败:", error);
    }
  };

  const handleAIGenerate = async () => {
    try {
      setGenerating(true);
      const result = await api.post<{ mainlines: any[] }>("/api/ai/generate-mainlines", { novelId });
      if (result.mainlines && result.mainlines.length > 0) {
        for (const mainline of result.mainlines) {
          await api.post(`/api/novels/${novelId}/mainlines`, mainline);
        }
        await loadMainlines();
        alert(`已生成 ${result.mainlines.length} 条主线`);
      }
    } catch (error) {
      console.error("AI生成主线失败:", error);
      alert("AI生成主线失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="mainline-panel">
      <div className="panel-header">
        <h2>故事主线</h2>
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
            {generating ? "生成中..." : "AI生成主线"}
          </button>
          <button className="btn-add" onClick={() => { setEditingId(null); setFormData({ title: "", description: "" }); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加主线
          </button>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <input
            type="text"
            placeholder="主线标题"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <textarea
            placeholder="主线描述"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreate}>{editingId ? "更新" : "创建"}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
          </div>
        </div>
      )}

      <div className="mainline-list">
        {mainlines.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>暂无主线，点击上方按钮添加或使用AI生成</p>
          </div>
        ) : (
          mainlines.map((mainline) => (
            <div key={mainline.id} className="mainline-item">
              <div className="mainline-content">
                <h3>{mainline.title}</h3>
                <p>{mainline.description || "暂无描述"}</p>
                <span className={`status ${mainline.status}`}>
                  {mainline.status === "active" ? "进行中" : mainline.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn-edit"
                  onClick={() => handleEdit(mainline)}
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
                  onClick={() => handleDelete(mainline.id)}
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

export default MainlinePanel;

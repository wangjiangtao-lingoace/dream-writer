import { useEffect, useState } from "react";
import { api } from "../lib/api";
import SmartJsonViewer from "./SmartJsonViewer";
import { defaultLabelMap } from "../utils/translate";

interface KnowledgeAsset {
  id: string;
  novelId?: string | null;
  title: string;
  category: string;
  content: string;
  tags?: string | null;
}

interface KnowledgeHubProps {
  novelId?: string | null;
  onNotice: (msg: string) => void;
}

export default function KnowledgeHub({ novelId, onNotice }: KnowledgeHubProps) {
  const [assets, setAssets] = useState<KnowledgeAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("全部");
  const [form, setForm] = useState({
    title: "",
    category: "设定",
    content: "",
    tags: "",
  });

  async function loadAssets() {
    setLoading(true);
    try {
      const url = novelId ? `/api/knowledge-assets/novel/${novelId}` : "/api/knowledge-assets";
      const list = await api<KnowledgeAsset[]>(url);
      setAssets(list);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载知识库失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, [novelId]);

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      onNotice("标题和内容不能为空。");
      return;
    }
    try {
      if (editingId) {
        const query = novelId ? `?novelId=${novelId}` : "";
        await api(`/api/knowledge-assets/${editingId}${query}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        onNotice("知识资产已更新。");
      } else {
        const url = novelId ? `/api/knowledge-assets/novel/${novelId}` : "/api/knowledge-assets";
        await api(url, {
          method: "POST",
          body: JSON.stringify(form),
        });
        onNotice("知识资产已创建。");
      }
      resetForm();
      await loadAssets();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存知识资产失败。");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此知识资产？")) return;
    try {
      const query = novelId ? `?novelId=${novelId}` : "";
      await api(`/api/knowledge-assets/${id}${query}`, { method: "DELETE" });
      onNotice("知识资产已删除。");
      await loadAssets();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除知识资产失败。");
    }
  }

  function handleEdit(asset: KnowledgeAsset) {
    setEditingId(asset.id);
    setForm({
      title: asset.title,
      category: asset.category,
      content: asset.content,
      tags: asset.tags || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ title: "", category: "设定", content: "", tags: "" });
    setShowForm(false);
  }

  const categories = ["设定", "灵感", "大纲", "笔记", "参考", "其他"];

  function tryParseJson(content: string): Record<string, unknown>[] | null {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
        return parsed as Record<string, unknown>[];
      }
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return [parsed as Record<string, unknown>];
      }
      return null;
    } catch {
      return null;
    }
  }

  // 知识库专用 labelMap
  const knowledgeLabelMap: Record<string, string> = {
    ...defaultLabelMap,
    title: "标题",
    name: "名称",
    description: "描述",
    summary: "摘要",
    content: "内容",
    category: "分类",
    tags: "标签",
    type: "类型",
    source: "来源",
    setting: "设定",
    rules: "规则",
    powerSystem: "力量体系",
    geography: "地理",
    factions: "势力",
    history: "历史",
    culture: "文化",
    abilities: "能力",
    personality: "性格",
    background: "背景",
    motivation: "动机",
    relationships: "关系",
    appearance: "外貌",
  };

  function renderContent(asset: KnowledgeAsset) {
    return (
      <div style={{ marginTop: "0.5rem" }}>
        <SmartJsonViewer
          data={asset.content}
          labelMap={knowledgeLabelMap}
          maxDepth={3}
        />
      </div>
    );
  }

  const filteredAssets = filterCategory === "全部"
    ? assets
    : assets.filter((a) => a.category === filterCategory);

  const categoryCountMap = categories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = assets.filter((a) => a.category === cat).length;
    return acc;
  }, {});

  return (
    <section className="knowledge-panel" id="knowledge-center">
      <header className="section-header">
        <div>
          <h2>知识库中枢</h2>
          <p>管理作品的设定、灵感、参考资料等知识资产。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "收起表单" : "入库新设定"}
        </button>
      </header>

      {showForm && (
        <div className="knowledge-form">
          <label>
            <span>标题 *</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例如：力量体系设定"
            />
          </label>
          <label>
            <span>分类</span>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>
          <label>
            <span>内容 *</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="详细的知识内容，支持 Markdown 或 JSON 格式"
              rows={6}
            />
          </label>
          <label>
            <span>标签</span>
            <input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="用逗号分隔，例如：力量,修炼,境界"
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

      {/* 统计信息 */}
      <div className="knowledge-stats">
        <article>
          <strong>{assets.length}</strong>
          <span>知识资产</span>
        </article>
        <article>
          <strong>{new Set(assets.map((a) => a.category)).size}</strong>
          <span>分类数</span>
        </article>
      </div>

      {/* 分类筛选 */}
      <div className="knowledge-filter" style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        marginBottom: "1rem",
        padding: "0.75rem 0",
        borderBottom: "1px solid var(--border)",
      }}>
        <button
          type="button"
          onClick={() => setFilterCategory("全部")}
          style={{
            padding: "0.25rem 0.75rem",
            fontSize: "0.8125rem",
            borderRadius: "9999px",
            border: "1px solid var(--border)",
            background: filterCategory === "全部" ? "var(--accent-muted)" : "transparent",
            color: filterCategory === "全部" ? "var(--accent)" : "var(--text-secondary)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
          }}
        >
          全部 ({assets.length})
        </button>
        {categories.map((cat) => {
          const count = categoryCountMap[cat] || 0;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                borderRadius: "9999px",
                border: "1px solid var(--border)",
                background: filterCategory === cat ? "var(--accent-muted)" : "transparent",
                color: filterCategory === cat ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
              }}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      <div className="knowledge-list">
        {loading ? (
          <p className="empty-note">加载中...</p>
        ) : filteredAssets.length === 0 ? (
          <p className="empty-note">
            {filterCategory === "全部"
              ? "还没有知识资产。点击\"入库新设定\"开始积累。"
              : `没有"${filterCategory}"分类的知识资产。`}
          </p>
        ) : (
          filteredAssets.map((asset) => (
            <article key={asset.id} className="knowledge-card">
              <header>
                <strong>{asset.title}</strong>
                <em>{asset.category}</em>
              </header>
              {renderContent(asset)}
              {asset.tags && (
                <div className="asset-tags">
                  {asset.tags.split(",").map((tag) => (
                    <span key={tag} className="tag">{tag.trim()}</span>
                  ))}
                </div>
              )}
              <div className="card-actions">
                <button type="button" onClick={() => handleEdit(asset)}>编辑</button>
                <button type="button" onClick={() => handleDelete(asset.id)}>删除</button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

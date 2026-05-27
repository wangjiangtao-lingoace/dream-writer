import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface Worldview {
  id: string;
  novelId?: string | null;
  name: string;
  summary?: string | null;
  rules?: string | null;
  powerSystem?: string | null;
  geography?: string | null;
  factions?: string | null;
  history?: string | null;
  culture?: string | null;
  customNotes?: string | null;
}

interface WorldviewEditorProps {
  novelId?: string | null;
  onNotice: (msg: string) => void;
}

type WorldTab = "basic" | "power" | "geo" | "history";

const WORLD_TABS: { key: WorldTab; label: string }[] = [
  { key: "basic", label: "基础设定" },
  { key: "power", label: "力量体系" },
  { key: "geo", label: "地理势力" },
  { key: "history", label: "历史文化" },
];

export default function WorldviewEditor({ novelId, onNotice }: WorldviewEditorProps) {
  const [worldviews, setWorldviews] = useState<Worldview[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<WorldTab>("basic");
  const [form, setForm] = useState({
    name: "",
    summary: "",
    rules: "",
    powerSystem: "",
    geography: "",
    factions: "",
    history: "",
    culture: "",
    customNotes: "",
  });

  async function loadWorldviews() {
    setLoading(true);
    try {
      const url = novelId ? `/api/worldviews?novelId=${encodeURIComponent(novelId)}` : "/api/worldviews";
      const list = await api<Worldview[]>(url);
      setWorldviews(list);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载世界观失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorldviews();
  }, [novelId]);

  async function handleSave() {
    if (!form.name.trim()) {
      onNotice("世界观名称不能为空。");
      return;
    }
    try {
      const payload = novelId ? { ...form, novelId } : form;
      if (editingId) {
        await api(`/api/worldviews/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        onNotice("世界观已更新。");
      } else {
        await api("/api/worldviews", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onNotice("世界观已创建。");
      }
      resetForm();
      await loadWorldviews();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存世界观失败。");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此世界观？")) return;
    try {
      await api(`/api/worldviews/${id}`, { method: "DELETE" });
      onNotice("世界观已删除。");
      await loadWorldviews();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除世界观失败。");
    }
  }

  function handleEdit(world: Worldview) {
    setEditingId(world.id);
    setForm({
      name: world.name,
      summary: world.summary || "",
      rules: world.rules || "",
      powerSystem: world.powerSystem || "",
      geography: world.geography || "",
      factions: world.factions || "",
      history: world.history || "",
      culture: world.culture || "",
      customNotes: world.customNotes || "",
    });
    setActiveTab("basic");
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      summary: "",
      rules: "",
      powerSystem: "",
      geography: "",
      factions: "",
      history: "",
      culture: "",
      customNotes: "",
    });
    setActiveTab("basic");
  }

  const filteredWorldviews = worldviews.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.summary && w.summary.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <section className="worldview-panel">
      <header className="section-header">
        <div>
          <h2>世界观管理</h2>
          <p>构建作品的世界观设定，包括规则、地理、势力等。</p>
        </div>
        <button type="button" onClick={resetForm}>新建世界观</button>
      </header>

      <div className="worldview-layout" style={{ display: "flex", gap: "1.5rem", minHeight: "60vh" }}>
        {/* 左侧列表 */}
        <div className="worldview-sidebar" style={{
          width: "280px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}>
          <div style={{ padding: "0.75rem", borderBottom: "1px solid var(--border)" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索世界观..."
              style={{ width: "100%", height: "36px" }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
            {loading ? (
              <p className="empty-note">加载中...</p>
            ) : filteredWorldviews.length === 0 ? (
              <p className="empty-note">{search ? "无匹配结果" : "还没有世界观设定"}</p>
            ) : (
              filteredWorldviews.map((world) => (
                <article
                  key={world.id}
                  className={`worldview-list-item ${editingId === world.id ? "active" : ""}`}
                  onClick={() => handleEdit(world)}
                  style={{
                    padding: "0.75rem",
                    marginBottom: "0.5rem",
                    border: editingId === world.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: editingId === world.id ? "var(--accent-muted)" : "var(--bg-card)",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <strong style={{ display: "block", fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                    {world.name}
                  </strong>
                  {world.summary && (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                      {world.summary.length > 60 ? world.summary.slice(0, 60) + "..." : world.summary}
                    </p>
                  )}
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.375rem" }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(world.id); }}
                      style={{ fontSize: "0.75rem", padding: "0.125rem 0.5rem" }}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        {/* 右侧编辑表单 */}
        <div className="worldview-editor" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Tab 栏 */}
          <div className="world-tabs" style={{
            display: "flex",
            gap: "0",
            borderBottom: "1px solid var(--border)",
            marginBottom: "1rem",
          }}>
            {WORLD_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "0.625rem 1.25rem",
                  background: activeTab === tab.key ? "var(--accent-muted)" : "transparent",
                  color: activeTab === tab.key ? "var(--accent)" : "var(--text-secondary)",
                  border: "none",
                  borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  transition: "all var(--transition-fast)",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 世界观名称（始终显示） */}
          <div className="form-group">
            <label>世界观名称 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：九州大陆"
            />
          </div>

          {/* Tab 内容 */}
          <div className="world-tab-content" style={{ flex: 1 }}>
            {activeTab === "basic" && (
              <>
                <div className="form-group">
                  <label>概述</label>
                  <textarea
                    value={form.summary}
                    onChange={(e) => setForm({ ...form, summary: e.target.value })}
                    placeholder="世界观的整体描述"
                  />
                </div>
                <div className="form-group">
                  <label>世界规则</label>
                  <textarea
                    value={form.rules}
                    onChange={(e) => setForm({ ...form, rules: e.target.value })}
                    placeholder="基本规则、运行法则等"
                  />
                </div>
                <div className="form-group">
                  <label>自定义备注</label>
                  <textarea
                    value={form.customNotes}
                    onChange={(e) => setForm({ ...form, customNotes: e.target.value })}
                    placeholder="其他补充设定"
                  />
                </div>
              </>
            )}

            {activeTab === "power" && (
              <div className="form-group">
                <label>力量体系</label>
                <textarea
                  value={form.powerSystem}
                  onChange={(e) => setForm({ ...form, powerSystem: e.target.value })}
                  placeholder="修炼体系、魔法规则、战力等级等"
                  style={{ minHeight: "300px" }}
                />
              </div>
            )}

            {activeTab === "geo" && (
              <>
                <div className="form-group">
                  <label>地理环境</label>
                  <textarea
                    value={form.geography}
                    onChange={(e) => setForm({ ...form, geography: e.target.value })}
                    placeholder="大陆、城市、特殊地点"
                  />
                </div>
                <div className="form-group">
                  <label>势力阵营</label>
                  <textarea
                    value={form.factions}
                    onChange={(e) => setForm({ ...form, factions: e.target.value })}
                    placeholder="门派、国家、组织"
                  />
                </div>
              </>
            )}

            {activeTab === "history" && (
              <>
                <div className="form-group">
                  <label>历史背景</label>
                  <textarea
                    value={form.history}
                    onChange={(e) => setForm({ ...form, history: e.target.value })}
                    placeholder="重大历史事件、朝代更迭"
                  />
                </div>
                <div className="form-group">
                  <label>文化习俗</label>
                  <textarea
                    value={form.culture}
                    onChange={(e) => setForm({ ...form, culture: e.target.value })}
                    placeholder="语言、信仰、风俗、节日等"
                  />
                </div>
              </>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="form-actions" style={{ marginTop: "1rem", display: "flex", gap: "0.75rem" }}>
            <button className="btn-primary" type="button" onClick={handleSave}>
              {editingId ? "更新世界观" : "创建世界观"}
            </button>
            {editingId && (
              <button className="btn-secondary" type="button" onClick={resetForm}>取消编辑</button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

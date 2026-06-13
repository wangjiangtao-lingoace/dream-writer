import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ConfirmDialog } from "./ui/CommonComponents";

interface Character {
  id: string;
  novelId: string;
  name: string;
  role?: string | null;
  identity?: string | null;
  motivation?: string | null;
  appearance?: string | null;
  background?: string | null;
  relationsText?: string | null;
  notes?: string | null;
  powerLevel?: string | null;
  firstAppear?: number | null;
  arcSummary?: string | null;
  arcDetail?: string | null;
  speechStyle?: string | null;
  lastAppear?: number | null;
  appearanceCount?: number;
  knowledgeScope?: string | null;
  tags?: string | null;
}

interface CharacterCardProps {
  novelId: string;
  onNotice: (msg: string) => void;
}

const ROLE_OPTIONS = [
  // 基础类型
  "主角", "反派", "配角", "龙套", "导师", "盟友", "亦正亦邪",
  // 网文类型
  "系统", "后宫", "小弟", "师父",
  // 经典叙事类型
  "旁白", "牺牲者", "守护者", "背叛者", "催化剂", "信使", "变形者", "影子",
  // 自定义
  "自定义",
];

export default function CharacterCard({ novelId, onNotice }: CharacterCardProps) {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    role: "",
    identity: "",
    motivation: "",
    appearance: "",
    background: "",
    relationsText: "",
    notes: "",
  });

  async function loadCharacters() {
    setLoading(true);
    try {
      const list = await api<Character[]>(`/api/characters/${novelId}`);
      setCharacters(list);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载人物失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCharacters();
  }, [novelId]);

  function checkDuplicate(name: string): boolean {
    return characters.some(
      (c) => c.name === name && c.id !== editingId
    );
  }

  async function handleSave() {
    if (!form.name.trim()) {
      onNotice("人物名不能为空。");
      return;
    }
    if (checkDuplicate(form.name.trim())) {
      onNotice(`人物名"${form.name}"已存在，请勿重复创建。`);
      return;
    }
    try {
      if (editingId) {
        await api(`/api/characters/${novelId}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        onNotice("人物已更新。");
      } else {
        await api(`/api/characters/${novelId}`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        onNotice("人物已创建。");
      }
      resetForm();
      await loadCharacters();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存人物失败。");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/characters/${novelId}/${deleteTarget}`, { method: "DELETE" });
      onNotice("人物已删除。");
      await loadCharacters();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除人物失败。");
    } finally {
      setDeleteTarget(null);
    }
  }

  const filteredCharacters = useMemo(() => {
    if (!activeRoleFilter) return characters;
    return characters.filter((c) => c.role === activeRoleFilter);
  }, [characters, activeRoleFilter]);

  function handleEdit(char: Character) {
    setEditingId(char.id);
    setForm({
      name: char.name,
      role: char.role || "",
      identity: char.identity || "",
      motivation: char.motivation || "",
      appearance: char.appearance || "",
      background: char.background || "",
      relationsText: char.relationsText || "",
      notes: char.notes || "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "",
      role: "",
      identity: "",
      motivation: "",
      appearance: "",
      background: "",
      relationsText: "",
      notes: "",
    });
    setShowForm(false);
  }

  const roleColorMap: Record<string, string> = {
    "主角": "#c62828",
    "反派": "#6a1b9a",
    "配角": "#1565c0",
    "龙套": "#546e7a",
    "导师": "#2e7d32",
    "盟友": "#00838f",
    "亦正亦邪": "#e65100",
  };

  return (
    <section className="character-panel">
      <header className="section-header">
        <div>
          <h2>人物卡管理</h2>
          <p>管理作品中的角色，记录人物设定和关系。</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => navigate(`/novel/${novelId}/characters/import`)}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
            }}
          >
            导入
          </button>
          <button type="button" onClick={() => { resetForm(); setShowForm(true); }}>新建人物</button>
        </div>
      </header>

      {/* 弹出表单 */}
      {showForm && (
        <div className="character-form" style={{
          padding: "1.25rem",
          marginBottom: "1.5rem",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-card)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem" }}>{editingId ? "编辑人物" : "新建人物"}</h3>
            <button type="button" onClick={resetForm} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.25rem" }}>
              &times;
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
            <div className="form-group">
              <label>人物名称 *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：张无忌"
              />
            </div>
            <div className="form-group">
              <label>角色定位</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="">请选择</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>身份背景</label>
              <input
                type="text"
                value={form.identity}
                onChange={(e) => setForm({ ...form, identity: e.target.value })}
                placeholder="例如：明教教主"
              />
            </div>
            <div className="form-group">
              <label>核心动机</label>
              <input
                type="text"
                value={form.motivation}
                onChange={(e) => setForm({ ...form, motivation: e.target.value })}
                placeholder="人物的行为驱动力"
              />
            </div>
            <div className="form-group">
              <label>外貌描述</label>
              <textarea
                value={form.appearance}
                onChange={(e) => setForm({ ...form, appearance: e.target.value })}
                placeholder="人物的外在形象"
                style={{ minHeight: "80px" }}
              />
            </div>
            <div className="form-group">
              <label>人物背景</label>
              <textarea
                value={form.background}
                onChange={(e) => setForm({ ...form, background: e.target.value })}
                placeholder="人物的过往经历"
                style={{ minHeight: "80px" }}
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>人物关系</label>
              <textarea
                value={form.relationsText}
                onChange={(e) => setForm({ ...form, relationsText: e.target.value })}
                placeholder="与其他人物的关系"
              />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label>备注</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="其他补充信息"
                style={{ minHeight: "60px" }}
              />
            </div>
          </div>
          <div className="form-actions" style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem" }}>
            <button className="btn-primary" type="button" onClick={handleSave}>
              {editingId ? "更新人物" : "创建人物"}
            </button>
            <button className="btn-secondary" type="button" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}

      {/* 角色标签筛选 */}
      <div className="character-tags" style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
        marginBottom: "1rem",
      }}>
        <button
          type="button"
          onClick={() => setActiveRoleFilter(null)}
          style={{
            padding: "0.25rem 0.75rem",
            fontSize: "0.8125rem",
            borderRadius: "9999px",
            background: activeRoleFilter === null ? "var(--accent)" : "var(--accent-muted)",
            color: activeRoleFilter === null ? "var(--text-inverse)" : "var(--accent)",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
        >
          全部 ({characters.length})
        </button>
        {ROLE_OPTIONS.map((role) => {
          const count = characters.filter((c) => c.role === role).length;
          if (count === 0) return null;
          const isActive = activeRoleFilter === role;
          return (
            <button
              key={role}
              type="button"
              onClick={() => setActiveRoleFilter(isActive ? null : role)}
              style={{
                padding: "0.25rem 0.75rem",
                fontSize: "0.8125rem",
                borderRadius: "9999px",
                background: isActive ? (roleColorMap[role] || "#546e7a") : `${roleColorMap[role] || "#546e7a"}15`,
                color: isActive ? "#fff" : (roleColorMap[role] || "#546e7a"),
                border: `1px solid ${roleColorMap[role] || "#546e7a"}40`,
                cursor: "pointer",
              }}
            >
              {role} ({count})
            </button>
          );
        })}
      </div>

      {/* 卡片网格 */}
      <div className="character-grid" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "1rem",
      }}>
        {loading ? (
          <p className="empty-note">加载中...</p>
        ) : filteredCharacters.length === 0 ? (
          <p className="empty-note">{activeRoleFilter ? `没有"${activeRoleFilter}"类型的人物。` : "还没有人物。创建第一个人物卡吧。"}</p>
        ) : (
          filteredCharacters.map((char) => {
            const isExpanded = expandedId === char.id;
            return (
              <article
                key={char.id}
                className="character-card"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-card)",
                  overflow: "hidden",
                  transition: "all var(--transition-fast)",
                }}
              >
                <header
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : char.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>{char.name}</strong>
                    {char.role && (
                      <span style={{
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.75rem",
                        borderRadius: "9999px",
                        background: `${roleColorMap[char.role] || "#546e7a"}15`,
                        color: roleColorMap[char.role] || "#546e7a",
                        border: `1px solid ${roleColorMap[char.role] || "#546e7a"}40`,
                      }}>
                        {char.role}
                      </span>
                    )}
                    {char.arcSummary && (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {char.arcSummary}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {isExpanded ? "收起 ▲" : "展开 ▼"}
                  </span>
                </header>

                {/* 简略视图 */}
                {!isExpanded && (
                  <div style={{ padding: "0.75rem 1rem" }}>
                    {char.identity && (
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                        {char.identity}
                      </p>
                    )}
                    {char.motivation && (
                      <p className="char-field" style={{ margin: "0 0 0.375rem", fontSize: "0.8125rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>动机：</span>
                        {char.motivation.length > 50 ? char.motivation.slice(0, 50) + "..." : char.motivation}
                      </p>
                    )}
                    {char.appearance && (
                      <p className="char-field" style={{ margin: "0 0 0.375rem", fontSize: "0.8125rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>外貌：</span>
                        {char.appearance.length > 50 ? char.appearance.slice(0, 50) + "..." : char.appearance}
                      </p>
                    )}
                    {char.background && (
                      <p className="char-field" style={{ margin: "0 0 0.375rem", fontSize: "0.8125rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>背景：</span>
                        {char.background.length > 50 ? char.background.slice(0, 50) + "..." : char.background}
                      </p>
                    )}
                    {char.relationsText && (
                      <p className="char-field" style={{ margin: "0 0 0.375rem", fontSize: "0.8125rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>关系：</span>
                        {char.relationsText.length > 50 ? char.relationsText.slice(0, 50) + "..." : char.relationsText}
                      </p>
                    )}
                  </div>
                )}

                {/* 详细视图 */}
                {isExpanded && (
                  <div style={{ padding: "0.75rem 1rem" }}>
                    {char.identity && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>身份背景</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{char.identity}</div>
                      </div>
                    )}
                    {char.motivation && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>核心动机</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{char.motivation}</div>
                      </div>
                    )}
                    {char.appearance && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>外貌描述</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{char.appearance}</div>
                      </div>
                    )}
                    {char.background && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>人物背景</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{char.background}</div>
                      </div>
                    )}
                    {char.relationsText && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>人物关系</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{char.relationsText}</div>
                      </div>
                    )}
                    {char.arcDetail && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>角色弧线</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{char.arcDetail}</div>
                      </div>
                    )}
                    {char.speechStyle && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>言语风格</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{char.speechStyle}</div>
                      </div>
                    )}
                    {char.powerLevel && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>战力等级</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)" }}>{char.powerLevel}</div>
                      </div>
                    )}
                    {char.notes && (
                      <div style={{ margin: "0 0 0.75rem" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>备注</div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{char.notes}</div>
                      </div>
                    )}
                    {(char.firstAppear != null || char.lastAppear != null || (char.appearanceCount != null && char.appearanceCount > 0)) && (
                      <div style={{ margin: "0 0 0.75rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                        {char.firstAppear != null && (
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>首次出场：</span>
                            <span style={{ fontSize: "0.8125rem" }}>第{char.firstAppear}章</span>
                          </div>
                        )}
                        {char.lastAppear != null && (
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>最后出场：</span>
                            <span style={{ fontSize: "0.8125rem" }}>第{char.lastAppear}章</span>
                          </div>
                        )}
                        {char.appearanceCount != null && char.appearanceCount > 0 && (
                          <div>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>出场次数：</span>
                            <span style={{ fontSize: "0.8125rem" }}>{char.appearanceCount}次</span>
                          </div>
                        )}
                      </div>
                    )}
                    {char.tags && (() => {
                      try {
                        const parsedTags = JSON.parse(char.tags);
                        if (Array.isArray(parsedTags) && parsedTags.length > 0) {
                          return (
                            <div style={{ margin: "0 0 0.75rem" }}>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>标签</div>
                              <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                                {parsedTags.map((tag: string, i: number) => (
                                  <span key={i} style={{
                                    padding: "0.125rem 0.5rem",
                                    fontSize: "0.75rem",
                                    borderRadius: "9999px",
                                    background: "var(--accent-muted)",
                                    color: "var(--accent)",
                                    border: "1px solid var(--border)",
                                  }}>{tag}</span>
                                ))}
                              </div>
                            </div>
                          );
                        }
                      } catch { /* ignore parse error */ }
                      return null;
                    })()}
                  </div>
                )}

                <div className="card-actions">
                  <button
                    type="button"
                    className={`btn-detail ${isExpanded ? 'active' : ''}`}
                    onClick={() => { setExpandedId(isExpanded ? null : char.id); }}
                  >
                    {isExpanded ? "收起" : "详情"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEdit(char)}
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(char.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title="删除人物"
          message="确定删除此人物？此操作不可撤销。"
          confirmText="删除"
          cancelText="取消"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          variant="danger"
        />
      )}
    </section>
  );
}

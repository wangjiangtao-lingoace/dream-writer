import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

interface Character {
  id: string;
  name: string;
  role?: string | null;
}

interface Relationship {
  id: string;
  characterId: string;
  targetId: string;
  relationType: string;
  description?: string | null;
}

interface RelationshipMatrixProps {
  novelId: string;
  onNotice: (msg: string) => void;
}

const RELATION_TYPES = [
  "朋友", "敌人", "师徒", "恋人", "亲人", "同事", "对手", "盟友", "背叛", "保护",
];

export const RelationshipMatrix: React.FC<RelationshipMatrixProps> = ({
  novelId,
  onNotice,
}) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ from: string; to: string } | null>(null);
  const [selectedType, setSelectedType] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [novelId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [chars, rels] = await Promise.all([
        api.get<Character[]>(`/api/characters/${novelId}`),
        api.get<Relationship[]>(`/api/relationships/${novelId}`).catch(() => []),
      ]);
      setCharacters(chars);
      setRelationships(rels);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载人物关系失败。");
    } finally {
      setLoading(false);
    }
  };

  const getRelationship = (fromId: string, toId: string): Relationship | undefined => {
    return relationships.find(
      (r) => r.characterId === fromId && r.targetId === toId
    );
  };

  const handleCellClick = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const existing = getRelationship(fromId, toId);
    setEditingCell({ from: fromId, to: toId });
    setSelectedType(existing?.relationType || "");
    setDescription(existing?.description || "");
  };

  const handleSave = async () => {
    if (!editingCell) return;
    try {
      const existing = getRelationship(editingCell.from, editingCell.to);
      if (existing) {
        if (selectedType === "") {
          // 删除关系
          await api.delete(`/api/relationships/${existing.id}`);
        } else {
          // 更新关系
          await api.put(`/api/relationships/${existing.id}`, {
            relationType: selectedType,
            description,
          });
        }
      } else if (selectedType !== "") {
        // 创建新关系
        await api.post(`/api/relationships`, {
          novelId,
          characterId: editingCell.from,
          targetId: editingCell.to,
          relationType: selectedType,
          description,
        });
      }
      setEditingCell(null);
      await loadData();
      onNotice("关系已更新。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存关系失败。");
    }
  };

  const handleCancel = () => {
    setEditingCell(null);
    setSelectedType("");
    setDescription("");
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  if (characters.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无人物，请先创建人物角色。</p>
      </div>
    );
  }

  return (
    <div className="relationship-matrix">
      <div className="matrix-header">
        <h3>人物关系矩阵</h3>
        <p className="matrix-desc">
          点击单元格设置人物之间的关系，行列交叉处显示关系类型。
        </p>
      </div>

      <div className="matrix-container" style={{ overflowX: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: "0.8125rem",
            minWidth: `${120 + characters.length * 100}px`,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  padding: "0.5rem",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                }}
              >
                人物
              </th>
              {characters.map((char) => (
                <th
                  key={char.id}
                  style={{
                    padding: "0.5rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}
                >
                  <div>{char.name}</div>
                  {char.role && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {char.role}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {characters.map((fromChar) => (
              <tr key={fromChar.id}>
                <td
                  style={{
                    padding: "0.5rem",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    fontWeight: 600,
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                  }}
                >
                  <div>{fromChar.name}</div>
                  {fromChar.role && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {fromChar.role}
                    </div>
                  )}
                </td>
                {characters.map((toChar) => {
                  const isSelf = fromChar.id === toChar.id;
                  const rel = getRelationship(fromChar.id, toChar.id);
                  const isEditing =
                    editingCell?.from === fromChar.id &&
                    editingCell?.to === toChar.id;

                  return (
                    <td
                      key={toChar.id}
                      style={{
                        padding: "0.5rem",
                        border: "1px solid var(--border-default)",
                        textAlign: "center",
                        cursor: isSelf ? "default" : "pointer",
                        background: isSelf
                          ? "var(--bg-surface)"
                          : isEditing
                          ? "var(--accent-muted)"
                          : rel
                          ? "rgba(40,167,69,0.05)"
                          : "var(--bg-base)",
                        transition: "background var(--transition-fast)",
                      }}
                      onClick={() => !isSelf && handleCellClick(fromChar.id, toChar.id)}
                    >
                      {isSelf ? (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      ) : isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                          <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            style={{
                              padding: "0.25rem",
                              fontSize: "0.75rem",
                              border: "1px solid var(--border-default)",
                              borderRadius: "var(--radius-sm)",
                            }}
                          >
                            <option value="">无关系</option>
                            {RELATION_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            placeholder="描述（可选）"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            style={{
                              padding: "0.25rem",
                              fontSize: "0.75rem",
                              border: "1px solid var(--border-default)",
                              borderRadius: "var(--radius-sm)",
                            }}
                          />
                          <div style={{ display: "flex", gap: "0.25rem" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSave();
                              }}
                              style={{
                                flex: 1,
                                padding: "0.25rem",
                                fontSize: "0.75rem",
                                background: "var(--accent)",
                                color: "var(--text-inverse)",
                                border: "none",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer",
                              }}
                            >
                              保存
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancel();
                              }}
                              style={{
                                flex: 1,
                                padding: "0.25rem",
                                fontSize: "0.75rem",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer",
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : rel ? (
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--accent)" }}>
                            {rel.relationType}
                          </div>
                          {rel.description && (
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                                marginTop: "0.25rem",
                              }}
                            >
                              {rel.description}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                          点击设置
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="matrix-legend" style={{ marginTop: "1rem" }}>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
          <strong>关系类型：</strong>
          {RELATION_TYPES.join("、")}
        </div>
      </div>
    </div>
  );
};

export default RelationshipMatrix;

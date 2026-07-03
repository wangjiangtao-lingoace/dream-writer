import React, { useState, useEffect } from "react";
import { api } from "../lib/api";

interface ChapterRevision {
  id: string;
  revision: number;
  title: string;
  wordCount: number;
  createdAt: string;
}

interface ChapterRevisionHistoryProps {
  chapterId: string;
  onRollback: () => void;
}

const ChapterRevisionHistory: React.FC<ChapterRevisionHistoryProps> = ({
  chapterId,
  onRollback,
}) => {
  const [revisions, setRevisions] = useState<ChapterRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  useEffect(() => {
    loadRevisions();
  }, [chapterId]);

  const loadRevisions = async () => {
    setLoading(true);
    try {
      const data = await api.get<ChapterRevision[]>(
        `/api/novels/*/chapters/${chapterId}/revisions`
      );
      setRevisions(data);
    } catch {
      setRevisions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (revision: number) => {
    if (!confirm(`确定要回滚到版本 ${revision} 吗？当前内容将被替换。`)) return;
    setRollingBack(revision);
    try {
      await api.post(
        `/api/novels/*/chapters/${chapterId}/revisions/${revision}/rollback`
      );
      onRollback();
      loadRevisions();
    } catch {
      alert("回滚失败");
    } finally {
      setRollingBack(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)" }}>
        加载版本历史...
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)" }}>
        暂无版本历史
      </div>
    );
  }

  return (
    <div style={{ padding: "0.5rem 0" }}>
      <h4 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        版本历史 ({revisions.length})
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {revisions.map((rev) => (
          <div
            key={rev.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              background: "var(--bg-base)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
            }}
          >
            <div>
              <span style={{ fontWeight: 500, fontSize: "0.8125rem" }}>
                版本 {rev.revision}
              </span>
              <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {rev.wordCount} 字
              </span>
              <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {new Date(rev.createdAt).toLocaleString()}
              </span>
            </div>
            <button
              onClick={() => handleRollback(rev.revision)}
              disabled={rollingBack === rev.revision}
              style={{
                padding: "0.25rem 0.5rem",
                fontSize: "0.75rem",
                background: "var(--accent-muted)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: "var(--radius-sm)",
                cursor: rollingBack === rev.revision ? "not-allowed" : "pointer",
                opacity: rollingBack === rev.revision ? 0.5 : 1,
              }}
            >
              {rollingBack === rev.revision ? "回滚中..." : "回滚"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChapterRevisionHistory;

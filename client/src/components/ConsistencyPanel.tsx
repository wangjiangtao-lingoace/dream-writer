import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface ConsistencyIssue {
  type: string;
  severity: string;
  description: string;
  evidence: string;
  suggestion: string;
  status?: "pending" | "fixed" | "ignored";
}

interface ConsistencyResult {
  id?: string;
  chapterId: string;
  issues: ConsistencyIssue[];
  overall_score: number;
  summary: string;
  checkedAt: string;
}

interface Chapter {
  id: string;
  title: string;
  order: number;
  content: string;
}

interface ConsistencyPanelProps {
  novelId: string;
  chapters: Chapter[];
  onNotice: (msg: string) => void;
}

const STORAGE_KEY_PREFIX = "consistency_result_";

function loadPersistedResults(novelId: string): ConsistencyResult[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${novelId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistResults(novelId: string, results: ConsistencyResult[]) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${novelId}`, JSON.stringify(results));
}

export default function ConsistencyPanel({ novelId, chapters, onNotice }: ConsistencyPanelProps) {
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<ConsistencyResult[]>([]);

  useEffect(() => {
    setResults(loadPersistedResults(novelId));
  }, [novelId]);

  const activeResult = selectedChapterId
    ? results.find((r) => r.chapterId === selectedChapterId) ?? null
    : null;

  async function handleCheck() {
    if (!selectedChapterId) {
      onNotice("请选择一个章节。");
      return;
    }
    setChecking(true);
    try {
      const response = await api<{ content: string }>("/api/ai/consistency-check", {
        method: "POST",
        body: JSON.stringify({ novelId, chapterId: selectedChapterId }),
      });

      let parsed: ConsistencyResult;
      try {
        const data = JSON.parse(response.content) as Omit<ConsistencyResult, "chapterId" | "checkedAt">;
        parsed = {
          ...data,
          chapterId: selectedChapterId,
          checkedAt: new Date().toISOString(),
          issues: (data.issues || []).map((issue) => ({ ...issue, status: "pending" as const })),
        };
      } catch {
        parsed = {
          chapterId: selectedChapterId,
          issues: [],
          overall_score: 0,
          summary: response.content,
          checkedAt: new Date().toISOString(),
        };
      }

      const updated = [parsed, ...results.filter((r) => r.chapterId !== selectedChapterId)];
      setResults(updated);
      persistResults(novelId, updated);
      onNotice(`校验完成，发现 ${parsed.issues?.length || 0} 个问题。`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "校验失败。");
    } finally {
      setChecking(false);
    }
  }

  function updateIssueStatus(chapterId: string, issueIndex: number, status: "fixed" | "ignored") {
    const updated = results.map((r) => {
      if (r.chapterId !== chapterId) return r;
      return {
        ...r,
        issues: r.issues.map((issue, i) =>
          i === issueIndex ? { ...issue, status } : issue
        ),
      };
    });
    setResults(updated);
    persistResults(novelId, updated);
  }

  function clearResult(chapterId: string) {
    const updated = results.filter((r) => r.chapterId !== chapterId);
    setResults(updated);
    persistResults(novelId, updated);
    onNotice("已清除该章节的校验结果。");
  }

  const severityLabel = (severity: string) => {
    switch (severity) {
      case "critical": return "严重";
      case "high": return "高";
      case "medium": return "中";
      case "low": return "低";
      default: return severity;
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#c62828";
      case "high": return "#e65100";
      case "medium": return "#f9a825";
      case "low": return "#2e7d32";
      default: return "#546e7a";
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "power": return "战力";
      case "character": return "人设";
      case "world": return "世界观";
      case "timeline": return "时间线";
      case "foreshadow": return "伏笔";
      default: return type;
    }
  };

  const statusLabel = (status?: string) => {
    switch (status) {
      case "fixed": return "已修复";
      case "ignored": return "已忽略";
      default: return "待处理";
    }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "fixed": return "#2e7d32";
      case "ignored": return "#546e7a";
      default: return "#e65100";
    }
  };

  const selectedChapter = chapters.find((c) => c.id === selectedChapterId);

  return (
    <section className="consistency-panel">
      <header className="section-header">
        <div>
          <h2>一致性校验</h2>
          <p>检查章节是否存在战力崩坏、人设崩坏、世界观冲突等问题。</p>
        </div>
      </header>

      <div className="consistency-form">
        <label>
          <span>选择章节</span>
          <select
            value={selectedChapterId || ""}
            onChange={(e) => setSelectedChapterId(e.target.value || null)}
          >
            <option value="">请选择章节</option>
            {chapters.map((chapter) => {
              const hasResult = results.some((r) => r.chapterId === chapter.id);
              return (
                <option key={chapter.id} value={chapter.id}>
                  第 {chapter.order} 章 - {chapter.title} {hasResult ? "✓" : ""}
                </option>
              );
            })}
          </select>
        </label>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className="primary-button"
            type="button"
            onClick={handleCheck}
            disabled={!selectedChapterId || checking}
          >
            {checking ? "校验中..." : "开始校验"}
          </button>
          {activeResult && (
            <button
              type="button"
              onClick={() => clearResult(selectedChapterId!)}
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
              }}
            >
              清除结果
            </button>
          )}
        </div>
      </div>

      {selectedChapter && !selectedChapter.content && (
        <p className="empty-note">该章节暂无正文内容，请先生成或编写正文。</p>
      )}

      {/* 历史校验记录 */}
      {results.length > 0 && !activeResult && (
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            校验记录 ({results.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {results.map((r) => {
              const chap = chapters.find((c) => c.id === r.chapterId);
              return (
                <button
                  key={r.chapterId}
                  type="button"
                  onClick={() => setSelectedChapterId(r.chapterId)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.625rem 1rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
                    {chap ? `第${chap.order}章 - ${chap.title}` : r.chapterId}
                  </span>
                  <span style={{
                    fontSize: "0.75rem",
                    color: r.overall_score >= 80 ? "#2e7d32" : r.overall_score >= 60 ? "#e65100" : "#c62828",
                    fontWeight: 600,
                  }}>
                    {r.overall_score}分 · {r.issues.length}问题
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 校验结果 */}
      {activeResult && (
        <div className="consistency-result" style={{ marginTop: "1rem" }}>
          <div className="result-summary" style={{
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            padding: "1rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-card)",
            marginBottom: "1rem",
          }}>
            <div className="score-card" style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0.75rem 1.5rem",
              borderRadius: "var(--radius-sm)",
              background: activeResult.overall_score >= 80
                ? "rgba(46,125,50,0.08)"
                : activeResult.overall_score >= 60
                  ? "rgba(230,81,0,0.08)"
                  : "rgba(198,40,40,0.08)",
            }}>
              <strong style={{
                fontSize: "2rem",
                color: activeResult.overall_score >= 80
                  ? "#2e7d32"
                  : activeResult.overall_score >= 60
                    ? "#e65100"
                    : "#c62828",
              }}>
                {activeResult.overall_score || "?"}
              </strong>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>一致性评分</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {activeResult.summary}
              </p>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                校验时间：{new Date(activeResult.checkedAt).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>

          {/* 问题统计 */}
          {activeResult.issues.length > 0 && (
            <div style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "1rem",
              flexWrap: "wrap",
            }}>
              {["critical", "high", "medium", "low"].map((sev) => {
                const count = activeResult.issues.filter((i) => i.severity === sev).length;
                if (count === 0) return null;
                return (
                  <span key={sev} style={{
                    padding: "0.25rem 0.75rem",
                    fontSize: "0.8125rem",
                    borderRadius: "9999px",
                    background: `${severityColor(sev)}15`,
                    color: severityColor(sev),
                    border: `1px solid ${severityColor(sev)}40`,
                  }}>
                    {severityLabel(sev)}: {count}
                  </span>
                );
              })}
              {(() => {
                const pending = activeResult.issues.filter((i) => !i.status || i.status === "pending").length;
                const fixed = activeResult.issues.filter((i) => i.status === "fixed").length;
                const ignored = activeResult.issues.filter((i) => i.status === "ignored").length;
                return (
                  <>
                    <span style={{ padding: "0.25rem 0.75rem", fontSize: "0.8125rem", borderRadius: "9999px", background: "rgba(230,81,0,0.08)", color: "#e65100", border: "1px solid rgba(230,81,0,0.3)" }}>
                      待处理: {pending}
                    </span>
                    <span style={{ padding: "0.25rem 0.75rem", fontSize: "0.8125rem", borderRadius: "9999px", background: "rgba(46,125,50,0.08)", color: "#2e7d32", border: "1px solid rgba(46,125,50,0.3)" }}>
                      已修复: {fixed}
                    </span>
                    {ignored > 0 && (
                      <span style={{ padding: "0.25rem 0.75rem", fontSize: "0.8125rem", borderRadius: "9999px", background: "rgba(84,110,122,0.08)", color: "#546e7a", border: "1px solid rgba(84,110,122,0.3)" }}>
                        已忽略: {ignored}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* 问题表格 */}
          {activeResult.issues.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8125rem",
                fontFamily: "'Songti SC', 'SimSun', serif",
              }}>
                <thead>
                  <tr>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      状态
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      类型
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      严重度
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600 }}>
                      问题描述
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600 }}>
                      原文证据
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "left", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600 }}>
                      建议
                    </th>
                    <th style={{ padding: "0.625rem 0.75rem", textAlign: "center", borderBottom: "2px solid var(--border)", background: "rgba(139,69,19,0.05)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeResult.issues.map((issue, index) => (
                    <tr key={index} style={{
                      background: issue.status === "fixed"
                        ? "rgba(46,125,50,0.03)"
                        : issue.status === "ignored"
                          ? "rgba(84,110,122,0.03)"
                          : undefined,
                    }}>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                        <span style={{
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.75rem",
                          borderRadius: "9999px",
                          background: `${statusColor(issue.status)}15`,
                          color: statusColor(issue.status),
                          border: `1px solid ${statusColor(issue.status)}40`,
                          whiteSpace: "nowrap",
                        }}>
                          {statusLabel(issue.status)}
                        </span>
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                        {typeLabel(issue.type)}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
                        <span style={{
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.75rem",
                          borderRadius: "9999px",
                          background: `${severityColor(issue.severity)}15`,
                          color: severityColor(issue.severity),
                          border: `1px solid ${severityColor(issue.severity)}40`,
                        }}>
                          {severityLabel(issue.severity)}
                        </span>
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", maxWidth: "250px", lineHeight: 1.5 }}>
                        {issue.description}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", maxWidth: "200px" }}>
                        {issue.evidence && (
                          <pre style={{
                            margin: 0,
                            padding: "0.375rem 0.5rem",
                            background: "rgba(139,69,19,0.03)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            maxHeight: "100px",
                            overflow: "auto",
                          }}>
                            {issue.evidence}
                          </pre>
                        )}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", maxWidth: "200px", lineHeight: 1.5 }}>
                        {issue.suggestion}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                        {(!issue.status || issue.status === "pending") && (
                          <div style={{ display: "flex", gap: "0.375rem", justifyContent: "center" }}>
                            <button
                              type="button"
                              onClick={() => updateIssueStatus(selectedChapterId!, index, "fixed")}
                              style={{
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.75rem",
                                background: "rgba(46,125,50,0.08)",
                                color: "#2e7d32",
                                border: "1px solid rgba(46,125,50,0.3)",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer",
                              }}
                            >
                              已修复
                            </button>
                            <button
                              type="button"
                              onClick={() => updateIssueStatus(selectedChapterId!, index, "ignored")}
                              style={{
                                padding: "0.25rem 0.5rem",
                                fontSize: "0.75rem",
                                background: "rgba(84,110,122,0.08)",
                                color: "#546e7a",
                                border: "1px solid rgba(84,110,122,0.3)",
                                borderRadius: "var(--radius-sm)",
                                cursor: "pointer",
                              }}
                            >
                              忽略
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeResult.overall_score > 0 ? (
            <p className="success-note">未发现一致性问题，章节质量良好！</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

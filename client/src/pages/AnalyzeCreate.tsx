import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface SearchResult {
  title: string;
  synopsis: string;
  outline?: string;
  characters?: string[];
  source?: string;
  status?: "found" | "no_source_found";
  sources?: Array<{ sourceUrl: string; sourceTitle: string; excerpt: string; confidence: number }>;
  failureReason?: string;
  rawContent?: string;
}

const AnalyzeCreate: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [step, setStep] = useState<"input" | "searching" | "preview" | "creating">("input");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!title.trim()) {
      alert("请输入作品标题");
      return;
    }

    setLoading(true);
    setStep("searching");
    setStatus("正在搜索作品内容...");

    try {
      // 1. 搜索作品内容
      const result = await api.post<SearchResult>("/api/search/novel", { title });
      setSearchResult(result);
      setStep("preview");
    } catch (error: any) {
      console.error("搜索失败:", error);
      alert(error.message || "搜索失败，请重试");
      setStep("input");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleAnalyze = async () => {
    if (!searchResult) return;

    setLoading(true);
    setStatus("正在创建拆书任务...");

    try {
      // 1. 创建拆书任务
      const analysis = await api.post<any>("/api/book-analysis", {
        title: `${title}拆解分析`,
        sourceTitle: title,
        sourceText: searchResult.rawContent || searchResult.synopsis,
      });
      setAnalysisId(analysis.id);

      // 2. 等待拆书完成
      setStatus("深度拆解中...");
      let attempts = 0;
      while (attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const status = await api.get<any>(`/api/book-analysis/${analysis.id}`);
        if (status.status === "succeeded") break;
        if (status.status === "failed") throw new Error("拆书失败");
        attempts++;
      }

      setStatus("分析完成！");
      setStep("creating");
    } catch (error: any) {
      console.error("分析失败:", error);
      alert(error.message || "分析失败，请重试");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleCreateNovel = async () => {
    if (!analysisId) return;

    setLoading(true);
    setStatus("正在创建作品...");

    try {
      // 1. 提取结构化数据
      const extractedData = await api.post<any>(
        `/api/analysis-to-novel/extract/${analysisId}`
      );

      // 2. 创建小说
      const novel = await api.post<any>("/api/novels", {
        title: extractedData.title,
        genre: extractedData.genre,
        inspiration: extractedData.synopsis,
        outline: extractedData.outline,
      });

      // 3. 落库
      setStatus("落库世界观、人物、主线...");
      await api.post(`/api/analysis-to-novel/${novel.id}/${analysisId}`);

      setStatus("完成！");
      setTimeout(() => navigate(`/novel/${novel.id}`), 1000);
    } catch (error: any) {
      console.error("创建失败:", error);
      alert(error.message || "创建失败，请重试");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      padding: "2rem",
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "2rem",
      }}>
        <button onClick={() => navigate("/")} style={{
          padding: "0.5rem 1rem",
          background: "transparent",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}>
          ← 返回书架
        </button>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: "1.5rem",
          color: "var(--text-primary)",
        }}>仿写创作</h1>
        <div style={{ width: "100px" }}></div>
      </header>

      {/* 步骤1：输入 */}
      {step === "input" && (
        <div style={{
          maxWidth: "500px",
          margin: "0 auto",
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: "2rem",
        }}>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.25rem",
            color: "var(--text-primary)",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}>输入作品标题</h2>

          <div style={{ marginBottom: "2rem" }}>
            <label style={{
              display: "block",
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
              marginBottom: "0.5rem",
            }}>作品标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：权宠天下、凡人修仙传..."
              disabled={loading}
              style={{
                width: "100%",
                height: "48px",
                padding: "0 1rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-primary)",
                fontSize: "1rem",
                color: "var(--text-primary)",
              }}
            />
            <p style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
            }}>系统将自动搜索作品内容进行分析</p>
          </div>

          <button
            onClick={handleSearch}
            disabled={!title.trim() || loading}
            style={{
              width: "100%",
              height: "48px",
              background: title.trim() ? "var(--accent)" : "var(--border)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "1rem",
              cursor: title.trim() ? "pointer" : "not-allowed",
            }}
          >
            搜索作品内容
          </button>
        </div>
      )}

      {/* 步骤2：搜索中 */}
      {step === "searching" && (
        <div style={{
          maxWidth: "500px",
          margin: "0 auto",
          textAlign: "center",
          padding: "4rem",
        }}>
          <div style={{
            width: "64px",
            height: "64px",
            margin: "0 auto 1.5rem",
            border: "4px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }} />
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            color: "var(--text-primary)",
            marginBottom: "0.5rem",
          }}>正在搜索</h2>
          <p style={{ color: "var(--text-secondary)" }}>{status}</p>
        </div>
      )}

      {/* 步骤3：预览搜索结果 */}
      {step === "preview" && searchResult && (
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            color: "var(--text-primary)",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}>搜索结果</h2>

          <div style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            padding: "2rem",
            marginBottom: "2rem",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
            }}>
              <span style={{
                padding: "0.25rem 0.5rem",
                background: searchResult.status === "found" ? "var(--success)" : "var(--warning)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                color: "white",
              }}>
                {searchResult.status === "found" ? "真实来源资料" : "缺资料"}
              </span>
              <span style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
              }}>
                来源数：{searchResult.sources?.length || 0}
              </span>
            </div>

            <h3 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.25rem",
              color: "var(--text-primary)",
              marginBottom: "1rem",
            }}>{searchResult.title}</h3>

            <div style={{ marginBottom: "1.5rem" }}>
              <strong style={{ color: "var(--text-primary)" }}>简介：</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem" }}>
                {searchResult.synopsis || searchResult.failureReason || "未找到可追踪资料，请粘贴资料后再拆书。"}
              </p>
            </div>

            {searchResult.outline && (
            <div style={{ marginBottom: "1.5rem" }}>
              <strong style={{ color: "var(--text-primary)" }}>大纲：</strong>
              <p style={{ color: "var(--text-secondary)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                {searchResult.outline}
              </p>
            </div>
            )}

            {(searchResult.characters || []).length > 0 && (
              <div style={{ marginBottom: "1.5rem" }}>
                <strong style={{ color: "var(--text-primary)" }}>人物：</strong>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  {(searchResult.characters || []).map((char, i) => (
                    <span key={i} style={{
                      padding: "0.25rem 0.75rem",
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                    }}>
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {searchResult.rawContent && (
              <div>
                <strong style={{ color: "var(--text-primary)" }}>原始内容（前500字）：</strong>
                <p style={{
                  color: "var(--text-muted)",
                  marginTop: "0.5rem",
                  fontSize: "0.8rem",
                  maxHeight: "150px",
                  overflow: "auto",
                  background: "var(--bg-primary)",
                  padding: "1rem",
                  borderRadius: "var(--radius-md)",
                }}>
                  {searchResult.rawContent.substring(0, 500)}...
                </p>
              </div>
            )}
          </div>

          <div style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
          }}>
            <button
              onClick={() => {
                setStep("input");
                setSearchResult(null);
              }}
              style={{
                padding: "0.75rem 2rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              重新搜索
            </button>
            <button
              onClick={handleAnalyze}
              disabled={loading || searchResult.status === "no_source_found"}
              style={{
                padding: "0.75rem 2rem",
                background: loading || searchResult.status === "no_source_found" ? "var(--border)" : "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "white",
                cursor: loading || searchResult.status === "no_source_found" ? "not-allowed" : "pointer",
              }}
            >
              {searchResult.status === "no_source_found" ? "需粘贴资料后拆书" : loading ? "分析中..." : "开始拆解分析"}
            </button>
          </div>
        </div>
      )}

      {/* 步骤4：创建中 */}
      {step === "creating" && (
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <h2 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            color: "var(--text-primary)",
            marginBottom: "1.5rem",
            textAlign: "center",
          }}>分析完成</h2>

          <div style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            padding: "2rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}>
            <div style={{
              width: "64px",
              height: "64px",
              margin: "0 auto 1.5rem",
              background: "var(--success)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" style={{ width: "32px", height: "32px" }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            <h3 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.25rem",
              color: "var(--text-primary)",
              marginBottom: "0.5rem",
            }}>拆解分析完成</h3>

            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              系统已分析原作品并生成新作品设定
            </p>

            <button
              onClick={handleCreateNovel}
              disabled={loading}
              style={{
                padding: "0.75rem 2rem",
                background: loading ? "var(--border)" : "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "创建中..." : "创建新作品"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default AnalyzeCreate;

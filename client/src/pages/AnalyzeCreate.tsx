import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";

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
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 文本粘贴相关状态
  const [pastedText, setPastedText] = useState("");
  const [sourceMode, setSourceMode] = useState<"none" | "search" | "manual">("none");

  // 文件上传相关状态
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append("document", file);

      // 使用 fetch 而非 api 工具，因为 api 工具仅支持 JSON，文件上传需要 FormData
      const response = await fetch("/api/upload/document", {
        method: "POST",
        body: formData,
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "文件提取失败");
      }

      setPastedText(json.data.text);
      if (!title.trim()) {
        setTitle(json.data.filename.replace(/\.[^.]+$/, ""));
      }
    } catch (error: any) {
      toast.error(error.message || "文件上传失败，请重试");
    } finally {
      setFileUploading(false);
      // 清空 input 以便重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // 解析数据源：优先使用粘贴文本，否则搜索
  const resolveSourceMaterial = useCallback((): { sourceText: string; sourceTitle: string } => {
    if (pastedText.trim().length >= 80) {
      setSourceMode("manual");
      return { sourceText: pastedText.trim(), sourceTitle: title };
    }
    setSourceMode("search");
    return {
      sourceText: searchResult?.rawContent || searchResult?.synopsis || "",
      sourceTitle: searchResult?.title || title,
    };
  }, [pastedText, title, searchResult]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const handleSearch = async () => {
    if (!title.trim()) {
      toast.error("请输入作品标题");
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
      toast.error(error.message || "搜索失败，请重试");
      setStep("input");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const handleAnalyze = async () => {
    // 解析数据源：优先使用粘贴文本
    const { sourceText, sourceTitle } = resolveSourceMaterial();

    if (!sourceText || sourceText.length < 80) {
      toast.error("请粘贴至少80字的原文内容，或等待搜索结果");
      return;
    }

    setLoading(true);
    setStatus("正在创建拆书任务...");
    abortControllerRef.current = new AbortController();

    try {
      // 1. 创建拆书任务
      const analysis = await api.post<any>("/api/book-analysis", {
        title: `${title}拆解分析`,
        sourceTitle: sourceTitle,
        sourceText: sourceText,
      });
      setAnalysisId(analysis.id);

      // 2. 等待拆书完成（非阻塞轮询）
      setStatus("深度拆解中...");
      let attempts = 0;
      const maxAttempts = 30;

      await new Promise<void>((resolve, reject) => {
        pollingRef.current = setInterval(async () => {
          try {
            if (abortControllerRef.current?.signal.aborted) {
              stopPolling();
              reject(new Error("已取消"));
              return;
            }

            attempts++;
            const status = await api.get<any>(`/api/book-analysis/${analysis.id}`);

            if (status.status === "succeeded") {
              stopPolling();
              resolve();
            } else if (status.status === "failed") {
              stopPolling();
              reject(new Error("拆书失败"));
            } else if (attempts >= maxAttempts) {
              stopPolling();
              reject(new Error("拆书超时"));
            }
          } catch (error) {
            stopPolling();
            reject(error);
          }
        }, 2000);
      });

      setStatus("分析完成！");
      setStep("creating");
    } catch (error: any) {
      if (error.message !== "已取消") {
        console.error("分析失败:", error);
        toast.error(error.message || "分析失败，请重试");
      }
    } finally {
      setLoading(false);
      setStatus("");
      abortControllerRef.current = null;
    }
  };

  const handleCancelAnalyze = () => {
    stopPolling();
    setLoading(false);
    setStatus("");
    setStep("preview");
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
      toast.success("作品创建成功");
      setTimeout(() => navigate(`/novel/${novel.id}?new=true`), 1000);
    } catch (error: any) {
      console.error("创建失败:", error);
      toast.error(error.message || "创建失败，请重试");
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

          <div style={{ marginBottom: "2rem" }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}>
              <label style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
              }}>原文内容（可选）</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.pdf,.epub"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || fileUploading}
                style={{
                  padding: "0.25rem 0.75rem",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: fileUploading ? "var(--text-muted)" : "var(--text-secondary)",
                  fontSize: "0.75rem",
                  cursor: fileUploading ? "not-allowed" : "pointer",
                }}
              >
                {fileUploading ? "提取中..." : "导入文件"}
              </button>
            </div>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="粘贴原文内容可跳过搜索，直接进入拆书分析（至少80字）"
              disabled={loading}
              maxLength={12000}
              style={{
                width: "100%",
                minHeight: "200px",
                padding: "1rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-primary)",
                fontSize: "0.875rem",
                color: "var(--text-primary)",
                resize: "vertical",
                lineHeight: 1.6,
              }}
            />
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "0.5rem",
            }}>
              <p style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
              }}>粘贴原文内容可跳过搜索，直接进入拆书分析（至少80字）</p>
              <span style={{
                fontSize: "0.75rem",
                color: pastedText.length >= 80 ? "var(--success)" : "var(--text-muted)",
              }}>
                已输入 {pastedText.length.toLocaleString()} 字 / 最多 12,000 字
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={handleSearch}
              disabled={!title.trim() || loading}
              style={{
                flex: 1,
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
            {pastedText.trim().length >= 80 && (
              <button
                onClick={() => {
                  setSourceMode("manual");
                  setStep("preview");
                  setSearchResult({
                    title: title,
                    synopsis: pastedText.substring(0, 200) + "...",
                    rawContent: pastedText,
                    status: "found",
                    source: "用户粘贴",
                  });
                }}
                disabled={!title.trim() || loading}
                style={{
                  flex: 1,
                  height: "48px",
                  background: "var(--success)",
                  color: "white",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: "1rem",
                  cursor: "pointer",
                }}
              >
                直接拆书（使用粘贴内容）
              </button>
            )}
          </div>
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
          }}>{sourceMode === "manual" ? "使用粘贴内容" : "搜索结果"}</h2>

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
                background: sourceMode === "manual" ? "var(--accent)" : searchResult.status === "found" ? "var(--success)" : "var(--warning)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                color: "white",
              }}>
                {sourceMode === "manual" ? "用户粘贴" : searchResult.status === "found" ? "真实来源资料" : "缺资料"}
              </span>
              {sourceMode !== "manual" && (
                <span style={{
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                }}>
                  来源数：{searchResult.sources?.length || 0}
                </span>
              )}
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
                <strong style={{ color: "var(--text-primary)" }}>
                  {sourceMode === "manual" ? "粘贴内容（前500字）：" : "原始内容（前500字）："}
                </strong>
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

            {/* 搜索失败时显示粘贴区域 */}
            {searchResult.status === "no_source_found" && sourceMode !== "manual" && (
              <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
                <strong style={{ color: "var(--text-primary)" }}>粘贴原文内容：</strong>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="搜索未找到资料，请在此粘贴原文内容（至少80字）"
                  disabled={loading}
                  maxLength={12000}
                  style={{
                    width: "100%",
                    minHeight: "200px",
                    padding: "1rem",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-primary)",
                    fontSize: "0.875rem",
                    color: "var(--text-primary)",
                    resize: "vertical",
                    lineHeight: 1.6,
                    marginTop: "0.5rem",
                  }}
                />
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "0.5rem",
                }}>
                  <p style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                  }}>粘贴至少80字内容后可直接拆书</p>
                  <span style={{
                    fontSize: "0.75rem",
                    color: pastedText.length >= 80 ? "var(--success)" : "var(--text-muted)",
                  }}>
                    已输入 {pastedText.length.toLocaleString()} 字 / 最多 12,000 字
                  </span>
                </div>
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
                setSourceMode("none");
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
            {loading && (
              <button
                onClick={handleCancelAnalyze}
                style={{
                  padding: "0.75rem 2rem",
                  background: "var(--error, #c62828)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            )}
            <button
              onClick={handleAnalyze}
              disabled={loading || (searchResult.status === "no_source_found" && pastedText.trim().length < 80 && sourceMode !== "manual")}
              style={{
                padding: "0.75rem 2rem",
                background: loading || (searchResult.status === "no_source_found" && pastedText.trim().length < 80 && sourceMode !== "manual") ? "var(--border)" : "var(--accent)",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: "white",
                cursor: loading || (searchResult.status === "no_source_found" && pastedText.trim().length < 80 && sourceMode !== "manual") ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "分析中..." : "开始拆解分析"}
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

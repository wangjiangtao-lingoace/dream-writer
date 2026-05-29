import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";

interface ImportResult {
  novelId: string;
  extraction: {
    characters: any[];
    worldviews: any[];
    plot: { plotSummary: string; mainlines: any[]; hooks: any[] };
    style: any;
  };
  chapters: Array<{ order: number; title: string; wordCount: number }>;
}

const ImportContinue: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setText(content);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.txt$/i, ""));
      }
    };
    reader.readAsText(file);
    // 清空 input 以便重复选择
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (text.trim().length < 100) {
      toast.error("文本内容过短，至少需要 100 字");
      return;
    }

    setLoading(true);
    setStatus("正在分析文本，提取人物、世界观、剧情和风格...");
    try {
      const data = await api.post<ImportResult>("/api/import/analyze", {
        text: text.trim(),
        title: title.trim() || undefined,
        genre: genre.trim() || undefined,
      });
      setResult(data);
      setStatus("分析完成！");
      toast.success("导入成功，即将跳转到工作台...");
      setTimeout(() => navigate(`/novel/${data.novelId}?new=true`), 1500);
    } catch (err: any) {
      toast.error(err.message || "导入分析失败");
      setStatus("");
    } finally {
      setLoading(false);
    }
  };

  // 完成状态
  if (result) {
    return (
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          textAlign: "center",
        }}>
          <div style={{
            width: "48px", height: "48px", margin: "0 auto var(--space-4)",
            background: "var(--success-muted)", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--success)", fontSize: "1.5rem",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "24px", height: "24px" }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 var(--space-2)" }}>
            导入成功
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "0 0 var(--space-4)" }}>
            已提取 {result.extraction.characters.length} 个人物、
            {result.extraction.worldviews.length} 个世界观、
            {result.chapters.length} 个章节
          </p>
          <button
            onClick={() => navigate(`/novel/${result.novelId}?new=true`)}
            style={{
              padding: "0.625rem 1.5rem",
              background: "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            进入工作台
          </button>
        </div>
      </div>
    );
  }

  // 输入状态
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      {/* 页头 */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <button
          onClick={() => navigate("/create")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.375rem 0.75rem", marginBottom: "var(--space-3)",
            background: "transparent", color: "var(--text-secondary)",
            border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem", cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "14px", height: "14px" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          导入续写
        </h1>
        <p style={{ margin: "var(--space-1) 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          上传已完成的 txt 小说文本，系统将自动提取人物、世界观、剧情等信息，然后继续创作后续章节。
        </p>
      </div>

      {/* 表单卡片 */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}>
        {/* 标题和类型 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "var(--space-1)" }}>
              作品标题（可选）
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则自动识别"
              style={{
                width: "100%", padding: "0.5rem 0.75rem",
                background: "var(--bg-surface)", color: "var(--text-primary)",
                border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
                fontSize: "0.875rem", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "var(--space-1)" }}>
              小说类型（可选）
            </label>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="如：玄幻、都市、科幻"
              style={{
                width: "100%", padding: "0.5rem 0.75rem",
                background: "var(--bg-surface)", color: "var(--text-primary)",
                border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
                fontSize: "0.875rem", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* 文件上传 */}
        <div>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "var(--space-1)" }}>
            上传文件
          </label>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "0.5rem 1rem",
                background: "var(--bg-surface)", color: "var(--text-primary)",
                border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
                fontSize: "0.8125rem", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: "0.375rem",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "14px", height: "14px" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              选择 .txt 文件
            </button>
            {text && (
              <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", alignSelf: "center" }}>
                已加载 {text.length.toLocaleString()} 字
              </span>
            )}
          </div>
        </div>

        {/* 文本输入 */}
        <div>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "var(--space-1)" }}>
            或直接粘贴文本
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="将小说文本粘贴到这里..."
            rows={12}
            style={{
              width: "100%", padding: "0.75rem",
              background: "var(--bg-surface)", color: "var(--text-primary)",
              border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
              fontSize: "0.875rem", lineHeight: 1.6, resize: "vertical",
              outline: "none", fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 状态提示 */}
        {status && (
          <div style={{
            padding: "0.75rem 1rem",
            background: loading ? "var(--accent-muted)" : "var(--success-muted)",
            border: `1px solid ${loading ? "rgba(79,124,255,0.25)" : "rgba(34,197,94,0.25)"}`,
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
            color: loading ? "var(--accent)" : "var(--success)",
            display: "flex", alignItems: "center", gap: "0.5rem",
          }}>
            {loading && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {status}
          </div>
        )}

        {/* 提交按钮 */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button
            onClick={() => navigate("/create")}
            style={{
              padding: "0.625rem 1.25rem",
              background: "transparent", color: "var(--text-secondary)",
              border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
              fontSize: "0.875rem", cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || text.trim().length < 100}
            style={{
              padding: "0.625rem 1.5rem",
              background: loading || text.trim().length < 100 ? "var(--bg-surface)" : "var(--accent)",
              color: loading || text.trim().length < 100 ? "var(--text-muted)" : "white",
              border: "none", borderRadius: "var(--radius-md)",
              fontSize: "0.875rem", fontWeight: 500,
              cursor: loading || text.trim().length < 100 ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "分析中..." : "开始分析"}
          </button>
        </div>
      </div>

      {/* 提示 */}
      <div style={{
        marginTop: "var(--space-4)",
        padding: "var(--space-4)",
        background: "var(--accent-muted)",
        border: "1px solid rgba(79,124,255,0.25)",
        borderRadius: "var(--radius-md)",
      }}>
        <strong style={{ display: "block", fontSize: "0.8125rem", color: "var(--accent)", marginBottom: "var(--space-2)" }}>
          使用说明
        </strong>
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-1)" }}>
          {[
            "支持标准章节格式（如「第X章」「第一章」等），也支持无章节标记的连续文本",
            "系统会自动提取人物、世界观、剧情、写作风格等信息",
            "提取结果会自动存入数据库，你可以在工作台中查看和修改",
            "分析完成后会自动跳转到工作台，可直接开始续写",
          ].map((tip, i) => (
            <li key={i} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "flex", gap: "var(--space-2)" }}>
              <span style={{ color: "var(--accent)", flexShrink: 0 }}>-</span>
              {tip}
            </li>
          ))}
        </ul>
      </div>

      {/* spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default ImportContinue;

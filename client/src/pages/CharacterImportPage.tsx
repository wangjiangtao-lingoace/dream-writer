import React, { useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";

interface ImportedCharacter {
  id: string;
  name: string;
  role?: string;
  tags?: string;
  appearance?: string;
  background?: string;
  motivation?: string;
  arcDetail?: string;
  speechStyle?: string;
  powerLevel?: string;
  notes?: string;
  knowledgeScope?: string;
}

interface ImportResult {
  success: boolean;
  characters?: ImportedCharacter[];
  error?: string;
}

const CharacterImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { novelId } = useParams<{ novelId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportedCharacter[] | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(txt|md)$/i)) {
      toast.error("仅支持 .txt 或 .md 文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setText(content);
      toast.success(`已加载文件：${file.name}（${Math.round(content.length / 1024)} KB）`);
    };
    reader.onerror = () => {
      toast.error("文件读取失败");
    };
    reader.readAsText(file, "UTF-8");

    // 清空 input 以便重复选择
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImport = async () => {
    if (!novelId) {
      toast.error("缺少小说 ID");
      return;
    }

    if (text.trim().length < 50) {
      toast.error("文本内容过短，至少需要 50 字");
      return;
    }

    setLoading(true);
    try {
      const data = await api.post<ImportResult>(`/api/characters/import/${novelId}`, {
        text: text.trim(),
      });

      if (!data.success || !data.characters) {
        throw new Error(data.error || "导入失败");
      }

      setResult(data.characters);
      toast.success(`成功导入 ${data.characters.length} 个人物`);
    } catch (err: any) {
      toast.error(err.message || "导入失败，请检查文本格式");
      console.error("Import error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setText("");
    setResult(null);
  };

  const handleBackToWorkspace = () => {
    navigate(`/novel/${novelId}/characters`);
  };

  // 解析 tags（如果是 JSON 字符串）
  const parseTags = (tags?: string): string[] => {
    if (!tags) return [];
    try {
      const parsed = JSON.parse(tags);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // 完成状态 - 显示导入的角色
  if (result) {
    return (
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
        }}>
          {/* 成功提示 */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-6)",
            padding: "var(--space-4)",
            background: "var(--success-muted)",
            border: "1px solid var(--success)",
            borderRadius: "var(--radius-md)",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" style={{ width: "24px", height: "24px", flexShrink: 0 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                导入成功
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: "var(--space-1) 0 0" }}>
                已成功导入 {result.length} 个人物及其关系到数据库
              </p>
            </div>
          </div>

          {/* 角色列表 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "var(--space-4)",
            marginBottom: "var(--space-6)",
          }}>
            {result.map((char) => {
              const tags = parseTags(char.tags);
              return (
                <div
                  key={char.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    padding: "var(--space-4)",
                  }}
                >
                  {/* 角色名和定位 */}
                  <div style={{ marginBottom: "var(--space-3)" }}>
                    <h4 style={{
                      fontSize: "1.125rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      margin: "0 0 var(--space-1)",
                    }}>
                      {char.name}
                    </h4>
                    {char.role && (
                      <p style={{
                        fontSize: "0.8125rem",
                        color: "var(--text-secondary)",
                        margin: 0,
                      }}>
                        {char.role}
                      </p>
                    )}
                  </div>

                  {/* 标签 */}
                  {tags.length > 0 && (
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.375rem",
                      marginBottom: "var(--space-3)",
                    }}>
                      {tags.map((tag, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: "0.25rem 0.5rem",
                            background: "var(--accent-muted)",
                            color: "var(--accent)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 简要信息 */}
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    {char.appearance && (
                      <p style={{ margin: "0 0 var(--space-2)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>外貌：</strong>
                        {char.appearance.substring(0, 60)}{char.appearance.length > 60 ? "..." : ""}
                      </p>
                    )}
                    {char.arcDetail && (
                      <p style={{ margin: "0 0 var(--space-2)" }}>
                        <strong style={{ color: "var(--text-primary)" }}>成长线：</strong>
                        {char.arcDetail.substring(0, 60)}{char.arcDetail.length > 60 ? "..." : ""}
                      </p>
                    )}
                    {char.speechStyle && (
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: "var(--text-primary)" }}>言语风格：</strong>
                        {char.speechStyle}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
            <button
              onClick={handleReset}
              style={{
                padding: "0.625rem 1.25rem",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              继续导入
            </button>
            <button
              onClick={handleBackToWorkspace}
              style={{
                padding: "0.625rem 1.25rem",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-md)",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              返回工作台
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 输入状态
  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      {/* 页头 */}
      <div style={{ marginBottom: "var(--space-6)" }}>
        <button
          onClick={() => navigate(`/novel/${novelId}/characters`)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.375rem 0.75rem",
            marginBottom: "var(--space-3)",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "14px", height: "14px" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          导入人物卡
        </h1>
        <p style={{ margin: "var(--space-2) 0 0", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          上传包含人物卡的文本文件（.txt 或 .md），系统将使用 AI 自动解析人物信息、关系和成长线。
        </p>
      </div>

      {/* 表单卡片 */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
        }}
      >
        {/* 文件上传区域 */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>
            上传文件
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "var(--space-6)",
              border: "2px dashed var(--border-default)",
              borderRadius: "var(--radius-md)",
              textAlign: "center",
              cursor: "pointer",
              background: "var(--bg-surface)",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.background = "var(--accent-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.background = "var(--bg-surface)";
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-secondary)"
              strokeWidth="2"
              style={{ width: "40px", height: "40px", margin: "0 auto var(--space-3)" }}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p style={{ fontSize: "0.875rem", color: "var(--text-primary)", margin: "0 0 var(--space-1)", fontWeight: 500 }}>
              点击选择文件
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: 0 }}>
              支持 .txt 和 .md 格式
            </p>
          </div>
        </div>

        {/* 文本预览 */}
        <div style={{ marginBottom: "var(--space-5)" }}>
          <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: "var(--space-2)" }}>
            文本内容
            {text && (
              <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--text-secondary)", marginLeft: "var(--space-2)" }}>
                （{text.length} 字符 / {text.split(/\n/).length} 行）
              </span>
            )}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="或直接粘贴人物卡文本内容..."
            style={{
              width: "100%",
              minHeight: "400px",
              padding: "var(--space-3)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              color: "var(--text-primary)",
              fontFamily: "monospace",
              lineHeight: 1.6,
              resize: "vertical",
            }}
          />
        </div>

        {/* 提示信息 */}
        <div
          style={{
            padding: "var(--space-3)",
            background: "var(--info-muted)",
            border: "1px solid var(--info)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: "var(--space-5)",
          }}
        >
          <strong style={{ color: "var(--info)" }}>提示：</strong>
          系统将智能识别人物卡中的姓名、角色定位、标签、外貌、背景、成长线、言语风格、知识范围和人物关系等信息。
          支持多个人物卡同时导入。
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button
            onClick={() => navigate(`/novel/${novelId}/characters`)}
            disabled={loading}
            style={{
              padding: "0.625rem 1.25rem",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !text.trim()}
            style={{
              padding: "0.625rem 1.25rem",
              background: loading || !text.trim() ? "var(--bg-disabled)" : "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: loading || !text.trim() ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            {loading && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ width: "16px", height: "16px", animation: "spin 1s linear infinite" }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {loading ? "解析中..." : "开始导入"}
          </button>
        </div>
      </div>

      {/* 添加旋转动画 */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default CharacterImportPage;

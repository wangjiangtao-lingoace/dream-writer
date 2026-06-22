import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";
import PipelineConfigModal, { PipelineConfig } from "../components/PipelineConfigModal";

const NovelForm: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    title: "",
    genre: "",
    inspiration: "",
    synopsis: "",
    targetWordCount: 300000,
    chapterWordMin: 2000,
    chapterWordMax: 4000,
    volumeCount: 5,
    chaptersPerVol: 30,
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: e.target.type === "number" ? Number(value) : value,
    }));
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("请输入作品标题");
      return;
    }
    setConfigModalOpen(true);
  };

  const handleConfigConfirm = async (config: PipelineConfig) => {
    setConfigModalOpen(false);
    try {
      setCreating(true);
      const novel = await api.post<{ id: string }>("/api/novels", formData);

      if (coverFile && novel?.id) {
        const formDataUpload = new FormData();
        formDataUpload.append("cover", coverFile);
        await fetch(`/api/upload/cover?novelId=${novel.id}`, {
          method: "POST",
          body: formDataUpload,
        });
      }

      if (novel?.id) {
        toast.success("作品创建成功，AI 正在分析...");
        try {
          await api.post("/api/pipeline/start", {
            novelId: novel.id,
            config: {
              mode: "create",
              sourceType: "idea",
              autoContinue: config.autoContinue,
              autoDraftChapters: config.autoDraftChapters,
              volumeCount: config.volumeCount,
              chaptersPerVolume: config.chaptersPerVolume,
              targetWordCount: config.targetWordCount,
              overwriteExistingChapters: config.overwriteExistingChapters,
            },
          });
        } catch {
          // Pipeline start failure is non-blocking
        }
        navigate(`/novel/${novel.id}`);
      }
    } catch (error) {
      console.error("创建作品失败:", error);
      toast.error("创建作品失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "0.75rem 1rem",
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "1rem",
    outline: "none",
  };

  const labelStyle = {
    display: "block",
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "var(--text-primary)",
    marginBottom: "0.5rem",
  };

  return (
    <div className="novel-form-page" style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
    }}>
      <header className="form-header" style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "1.5rem 2rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}>
        <button className="btn-back" onClick={() => navigate("/create")} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 1rem",
          background: "transparent",
          color: "var(--text-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          fontSize: "0.875rem",
          cursor: "pointer",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <h1 style={{
          fontSize: "1.5rem",
          color: "var(--text-primary)",
          letterSpacing: "0.05em",
        }}>创建新作品</h1>
      </header>

      <main className="form-content" style={{
        display: "flex",
        justifyContent: "center",
        padding: "3rem 2rem",
      }}>
        <form onSubmit={handleSubmit} className="novel-form-layout">
          <div className="form-cover">
            <div
              className="cover-upload"
              onClick={() => document.getElementById("cover-input")?.click()}
              style={{
                width: "280px",
                height: "380px",
                borderRadius: "var(--radius-lg)",
                border: "2px dashed var(--border)",
                background: "var(--bg-card)",
                cursor: "pointer",
                overflow: "hidden",
                position: "relative",
                transition: "all var(--transition-normal)",
              }}
            >
              {coverPreview ? (
                <img src={coverPreview} alt="封面预览" style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }} />
              ) : (
                <div className="cover-placeholder" style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: "1rem",
                  color: "var(--text-muted)",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "3rem", height: "3rem", opacity: 0.5 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: "0.875rem" }}>点击上传封面</span>
                  <span className="cover-hint" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>支持 JPG、PNG 格式</span>
                </div>
              )}
            </div>
            <input
              id="cover-input"
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              style={{ display: "none" }}
            />
          </div>

          <div className="form-fields" style={{
            background: "var(--bg-card)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
            padding: "2rem",
          }}>
            <div className="form-group" style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="title" style={labelStyle}>作品标题</label>
              <input
                id="title"
                name="title"
                type="text"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="请输入作品标题"
                maxLength={50}
                required
                style={inputStyle}
              />
            </div>

            <div className="form-group" style={{ marginBottom: "1.5rem" }}>
              <label htmlFor="genre" style={labelStyle}>作品类型</label>
              <select
                id="genre"
                name="genre"
                value={formData.genre}
                onChange={handleInputChange}
                style={inputStyle}
              >
                <option value="">请选择类型</option>
                <option value="都市玄幻">都市玄幻</option>
                <option value="仙侠修真">仙侠修真</option>
                <option value="历史架空">历史架空</option>
                <option value="科幻未来">科幻未来</option>
                <option value="悬疑推理">悬疑推理</option>
                <option value="都市言情">都市言情</option>
                <option value="游戏竞技">游戏竞技</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: "2rem" }}>
              <label htmlFor="inspiration" style={labelStyle}>
                创作灵感
              </label>
              <textarea
                id="inspiration"
                name="inspiration"
                value={formData.inspiration}
                onChange={handleInputChange}
                placeholder="描述你的创作灵感和故事梗概...&#10;&#10;可以只写一小段创意，也可以粘贴完整的大纲、人物设定、世界观等内容。AI 会自动识别已有内容并拆解入库，只补充缺失部分。"
                rows={15}
                style={{ ...inputStyle, resize: "vertical", minHeight: "300px" }}
              />
              <p style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: "0.5rem",
                lineHeight: 1.5,
              }}>
                提示：输入越详细，AI 生成质量越高。支持粘贴完整的大纲、人物设定、世界观、风格描述、卷结构等内容，AI 会智能识别并保留你的原创内容。
              </p>
            </div>

            <div className="form-actions" style={{
              display: "flex",
              justifyContent: "flex-end",
            }}>
              <button
                type="submit"
                className="btn-submit"
                disabled={creating}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  background: creating ? "var(--text-muted)" : "var(--accent)",
                  color: "var(--text-inverse)",
                  border: "none",
                  borderRadius: "var(--radius-md)",
                  fontSize: "1rem",
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? (
                  <>
                    <span className="btn-loading" style={{
                      width: "1rem",
                      height: "1rem",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                    }}></span>
                    创建中...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem" }}>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    开始创作
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </main>

      <PipelineConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onConfirm={handleConfigConfirm}
        mode="create"
      />
    </div>
  );
};

export default NovelForm;

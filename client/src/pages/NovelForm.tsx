import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";

const NovelForm: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: "",
    genre: "",
    inspiration: "",
    synopsis: "",
    targetWordCount: 300000,
    chapterWordMin: 2000,
    chapterWordMax: 4000,
    volumeCount: 1,
    chaptersPerVol: 20,
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");
  const [creating, setCreating] = useState(false);

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

  const handleNext = () => {
    if (!formData.title.trim()) {
      toast.error("请输入作品标题");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4a574' fill-opacity='0.05'%3E%3Cpath d='M50 0L51 100H49L50 0z' /%3E%3Cpath d='M0 50H100V52H0z' /%3E%3C/g%3E%3C/svg%3E\")",
    }}>
      <header className="form-header" style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "1.5rem 2rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}>
        <button className="btn-back" onClick={() => step === 1 ? navigate("/create") : setStep(1)} style={{
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
          {step === 1 ? "返回" : "上一步"}
        </button>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: "1.5rem",
          color: "var(--text-primary)",
          letterSpacing: "0.05em",
        }}>创建新作品</h1>
        <div style={{
          marginLeft: "auto",
          display: "flex",
          gap: "0.5rem",
        }}>
          <div style={{
            width: "2rem",
            height: "0.25rem",
            borderRadius: "0.125rem",
            background: step >= 1 ? "var(--accent)" : "var(--border)",
          }} />
          <div style={{
            width: "2rem",
            height: "0.25rem",
            borderRadius: "0.125rem",
            background: step >= 2 ? "var(--accent)" : "var(--border)",
          }} />
        </div>
      </header>

      <main className="form-content" style={{
        display: "flex",
        justifyContent: "center",
        padding: "3rem 2rem",
      }}>
        {step === 1 ? (
          <div className="novel-form" style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: "2rem",
            maxWidth: "960px",
            width: "100%",
          }}>
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
                <label htmlFor="inspiration" style={labelStyle}>创作灵感</label>
                <textarea
                  id="inspiration"
                  name="inspiration"
                  value={formData.inspiration}
                  onChange={handleInputChange}
                  placeholder="描述你的创作灵感和故事梗概..."
                  rows={6}
                  style={{ ...inputStyle, resize: "vertical", minHeight: "120px" }}
                />
              </div>

              <div className="form-actions" style={{
                display: "flex",
                justifyContent: "flex-end",
              }}>
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn-submit"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 2rem",
                    background: "var(--accent)",
                    color: "var(--text-inverse)",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    fontSize: "1rem",
                    cursor: "pointer",
                  }}
                >
                  下一步
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem" }}>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{
            maxWidth: "640px",
            width: "100%",
          }}>
            <div style={{
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
              }}>创作规划</h2>

              <div className="form-group" style={{ marginBottom: "1.5rem" }}>
                <label htmlFor="synopsis" style={labelStyle}>故事简介</label>
                <textarea
                  id="synopsis"
                  name="synopsis"
                  value={formData.synopsis}
                  onChange={handleInputChange}
                  placeholder="用几句话概括你的故事主线..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}>
                <div className="form-group">
                  <label htmlFor="targetWordCount" style={labelStyle}>目标总字数</label>
                  <input
                    id="targetWordCount"
                    name="targetWordCount"
                    type="number"
                    value={formData.targetWordCount}
                    onChange={handleInputChange}
                    min={10000}
                    max={10000000}
                    step={10000}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                    建议：短篇 5-10 万字，中篇 10-30 万字，长篇 30 万字以上
                  </span>
                </div>

                <div className="form-group">
                  <label htmlFor="volumeCount" style={labelStyle}>卷数</label>
                  <input
                    id="volumeCount"
                    name="volumeCount"
                    type="number"
                    value={formData.volumeCount}
                    onChange={handleInputChange}
                    min={1}
                    max={100}
                    style={inputStyle}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                    建议：每卷 10-30 章为宜
                  </span>
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "1rem",
                marginBottom: "2rem",
              }}>
                <div className="form-group">
                  <label htmlFor="chapterWordMin" style={labelStyle}>章节最小字数</label>
                  <input
                    id="chapterWordMin"
                    name="chapterWordMin"
                    type="number"
                    value={formData.chapterWordMin}
                    onChange={handleInputChange}
                    min={500}
                    max={10000}
                    step={500}
                    style={inputStyle}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="chapterWordMax" style={labelStyle}>章节最大字数</label>
                  <input
                    id="chapterWordMax"
                    name="chapterWordMax"
                    type="number"
                    value={formData.chapterWordMax}
                    onChange={handleInputChange}
                    min={1000}
                    max={20000}
                    step={500}
                    style={inputStyle}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="chaptersPerVol" style={labelStyle}>每卷章节数</label>
                  <input
                    id="chaptersPerVol"
                    name="chaptersPerVol"
                    type="number"
                    value={formData.chaptersPerVol}
                    onChange={handleInputChange}
                    min={1}
                    max={200}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{
                background: "var(--bg-primary)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                marginBottom: "2rem",
                border: "1px solid var(--border)",
              }}>
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  <strong>预估：</strong>
                  {formData.volumeCount} 卷 × {formData.chaptersPerVol} 章 = {formData.volumeCount * formData.chaptersPerVol} 章，
                  每章 {formData.chapterWordMin}-{formData.chapterWordMax} 字，
                  总计约 {((formData.chapterWordMin + formData.chapterWordMax) / 2 * formData.volumeCount * formData.chaptersPerVol / 10000).toFixed(1)} 万字
                </div>
              </div>

              <div className="form-actions" style={{
                display: "flex",
                justifyContent: "space-between",
              }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1.5rem",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "1rem",
                    cursor: "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                  上一步
                </button>
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
        )}
      </main>
    </div>
  );
};

export default NovelForm;

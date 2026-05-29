import React from "react";
import { useNavigate } from "react-router-dom";

const CreateWork: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="create-work" style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4a574' fill-opacity='0.05'%3E%3Cpath d='M50 0L51 100H49L50 0z' /%3E%3Cpath d='M0 50H100V52H0z' /%3E%3C/g%3E%3C/svg%3E\")",
    }}>
      <header className="create-header" style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        position: "relative",
      }}>
        <button className="btn-back" onClick={() => navigate("/")} style={{
          position: "absolute",
          left: "1.5rem",
          top: "50%",
          transform: "translateY(-50%)",
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
          返回书架
        </button>
        <h1 style={{
          fontFamily: "var(--font-serif)",
          fontSize: "1.75rem",
          color: "var(--text-primary)",
          letterSpacing: "0.1em",
        }}>选择创作方式</h1>
        <p className="header-desc" style={{
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
          marginTop: "0.5rem",
        }}>选择适合你的创作路径</p>
      </header>

      <main className="create-content" style={{
        display: "flex",
        justifyContent: "center",
        padding: "3rem 2rem",
      }}>
        <div className="create-options" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "2rem",
          maxWidth: "1200px",
          width: "100%",
        }}>
          <div
            className="create-option"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/create/new")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/create/new");
              }
            }}
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--border)",
              padding: "2rem",
              cursor: "pointer",
              transition: "all var(--transition-normal)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute",
              top: "0.5rem",
              left: "0.5rem",
              right: "0.5rem",
              bottom: "0.5rem",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute",
              top: "-20px",
              right: "-20px",
              width: "80px",
              height: "80px",
              opacity: 0.1,
              transform: "rotate(15deg)",
            }}>
              <svg viewBox="0 0 100 100" fill="var(--accent)">
                <circle cx="50" cy="50" r="40" />
                <circle cx="50" cy="50" r="30" fill="var(--bg-card)" />
                <circle cx="50" cy="50" r="20" fill="var(--accent)" />
              </svg>
            </div>
            <div className="option-icon" style={{
              width: "56px",
              height: "56px",
              marginBottom: "1.5rem",
              color: "var(--accent)",
              background: "var(--accent-muted)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.75rem", height: "1.75rem" }}>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </div>
            <div className="option-content">
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.5rem",
                color: "var(--text-primary)",
                marginBottom: "0.75rem",
                letterSpacing: "0.05em",
              }}>独立创作</h2>
              <p className="option-desc" style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}>从零开始构思，AI辅助你完成一部全新的作品</p>
              <ul className="option-features" style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}>
                {["AI生成大纲和章节", "智能人物设定", "世界观构建", "风格定制"].map((item) => (
                  <li key={item} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" style={{ width: "1rem", height: "1rem", flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="option-arrow" style={{
              position: "absolute",
              right: "1.5rem",
              bottom: "1.5rem",
              color: "var(--accent)",
              opacity: 0.5,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem" }}>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>

          <div
            className="create-option"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/create/analyze")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/create/analyze");
              }
            }}
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--border)",
              padding: "2rem",
              cursor: "pointer",
              transition: "all var(--transition-normal)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute",
              top: "0.5rem",
              left: "0.5rem",
              right: "0.5rem",
              bottom: "0.5rem",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute",
              top: "-20px",
              right: "-20px",
              width: "80px",
              height: "80px",
              opacity: 0.1,
              transform: "rotate(-15deg)",
            }}>
              <svg viewBox="0 0 100 100" fill="var(--accent)">
                <path d="M50 0 L100 50 L50 100 L0 50 Z" />
              </svg>
            </div>
            <div className="option-icon" style={{
              width: "56px",
              height: "56px",
              marginBottom: "1.5rem",
              color: "var(--accent)",
              background: "var(--accent-muted)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.75rem", height: "1.75rem" }}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <path d="M8 7h8" />
                <path d="M8 11h6" />
              </svg>
            </div>
            <div className="option-content">
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.5rem",
                color: "var(--text-primary)",
                marginBottom: "0.75rem",
                letterSpacing: "0.05em",
              }}>拆书创作</h2>
              <p className="option-desc" style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}>分析已有作品，学习其写作技巧和结构</p>
              <ul className="option-features" style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}>
                {["结构分析", "风格提取", "技巧学习", "知识库沉淀"].map((item) => (
                  <li key={item} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" style={{ width: "1rem", height: "1rem", flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="option-arrow" style={{
              position: "absolute",
              right: "1.5rem",
              bottom: "1.5rem",
              color: "var(--accent)",
              opacity: 0.5,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem" }}>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>

          {/* 导入续写 */}
          <div
            className="create-option"
            role="button"
            tabIndex={0}
            onClick={() => navigate("/create/import")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/create/import");
              }
            }}
            style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "2px solid var(--border)",
              padding: "2rem",
              cursor: "pointer",
              transition: "all var(--transition-normal)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{
              position: "absolute",
              top: "0.5rem",
              left: "0.5rem",
              right: "0.5rem",
              bottom: "0.5rem",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-md)",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute",
              top: "-20px",
              right: "-20px",
              width: "80px",
              height: "80px",
              opacity: 0.1,
              transform: "rotate(30deg)",
            }}>
              <svg viewBox="0 0 100 100" fill="var(--accent)">
                <polygon points="50,5 95,27.5 95,72.5 50,95 5,72.5 5,27.5" />
              </svg>
            </div>
            <div className="option-icon" style={{
              width: "56px",
              height: "56px",
              marginBottom: "1.5rem",
              color: "var(--accent)",
              background: "var(--accent-muted)",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "1.75rem", height: "1.75rem" }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="option-content">
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "1.5rem",
                color: "var(--text-primary)",
                marginBottom: "0.75rem",
                letterSpacing: "0.05em",
              }}>导入续写</h2>
              <p className="option-desc" style={{
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                marginBottom: "1.5rem",
                lineHeight: 1.6,
              }}>上传已完成的小说文本，自动提取信息后继续创作</p>
              <ul className="option-features" style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}>
                {["自动提取人物世界观", "剧情和风格分析", "章节自动拆分", "一键续写后续章节"].map((item) => (
                  <li key={item} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" style={{ width: "1rem", height: "1rem", flexShrink: 0 }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="option-arrow" style={{
              position: "absolute",
              right: "1.5rem",
              bottom: "1.5rem",
              color: "var(--accent)",
              opacity: 0.5,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1.25rem", height: "1.25rem" }}>
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateWork;

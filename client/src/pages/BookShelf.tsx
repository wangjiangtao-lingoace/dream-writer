import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface NovelListItem {
  id: string;
  title: string;
  genre: string | null;
  coverImage: string | null;
  status: string;
  chapters: { id: string; wordCount: number }[];
  updatedAt: string;
}

const BOOK_COLORS = [
  "#8b0000", "#1a237e", "#1b5e20", "#4e342e", "#4a148c", "#b8860b",
  "#b71c1c", "#0d47a1", "#2e7d32", "#3e2723", "#6a1b9a", "#f9a825",
];

const BookShelf: React.FC = () => {
  const navigate = useNavigate();
  const [novels, setNovels] = useState<NovelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredBook, setHoveredBook] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    loadNovels();
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => setIsLoaded(true), 100);
    }
  }, [loading]);

  const loadNovels = async () => {
    try {
      setLoading(true);
      const data = await api.get<NovelListItem[]>("/api/novels");
      setNovels(data || []);
    } catch (error) {
      console.error("加载作品列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/novels/${id}`);
      setNovels(novels.filter(n => n.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error("删除失败:", error);
      alert("删除失败，请重试");
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      drafting: "创作中",
      completed: "已完成",
      paused: "已暂停",
    };
    return statusMap[status] || status;
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return "刚刚";
  };

  const getBookColor = (index: number) => BOOK_COLORS[index % BOOK_COLORS.length];

  const filteredNovels = novels.filter(
    (novel) =>
      novel.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (novel.genre && novel.genre.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const shelfRows: NovelListItem[][] = [];
  const booksPerRow = windowWidth < 640 ? 2 : windowWidth < 1024 ? 3 : 5;
  for (let i = 0; i < filteredNovels.length; i += booksPerRow) {
    shelfRows.push(filteredNovels.slice(i, i + booksPerRow));
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #2c1810 0%, #3e2723 50%, #2c1810 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 48,
            height: 48,
            border: "3px solid #8d6e63",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 1rem",
          }} />
          <span style={{ color: "#bcaaa4", fontFamily: "serif", fontSize: "1.1rem", letterSpacing: "0.2em" }}>
            墨染中...
          </span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #2c1810 0%, #3e2723 50%, #2c1810 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* 背景纹理 */}
      <div style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='200' height='200' viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M0 0h200v2H0zM0 20h200v2H0zM0 40h200v2H0zM0 60h200v2H0zM0 80h200v2H0zM0 100h200v2H0zM0 120h200v2H0zM0 140h200v2H0zM0 160h200v2H0zM0 180h200v2H0z'/%3E%3C/g%3E%3C/svg%3E")`,
        opacity: 0.5,
      }} />

      {/* 光影效果 */}
      <div style={{
        position: "absolute",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "60%",
        height: "200px",
        background: "radial-gradient(ellipse, rgba(255,215,0,0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* 顶部导航 */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 2rem",
        background: "linear-gradient(180deg, rgba(44,24,16,0.95) 0%, rgba(44,24,16,0.8) 100%)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(139,110,99,0.3)",
      }}>
        <div>
          <h1 style={{
            fontFamily: "'STXingkai', 'FangSong', 'KaiTi', serif",
            fontSize: "2rem",
            color: "#d4a574",
            letterSpacing: "0.15em",
            fontWeight: 700,
            textShadow: "0 2px 4px rgba(0,0,0,0.3)",
          }}>
            梦中笔者
          </h1>
          <p style={{
            color: "#8d6e63",
            fontSize: "0.75rem",
            marginTop: "0.25rem",
            letterSpacing: "0.3em",
          }}>
            以墨为马，以梦为舟
          </p>
        </div>

        <div style={{ flex: 1, maxWidth: "24rem", margin: "0 2rem" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            background: "rgba(0,0,0,0.2)",
            border: "1px solid rgba(139,110,99,0.4)",
            borderRadius: "4px",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#8d6e63" style={{ width: "1rem", height: "1rem" }}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜寻古卷..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#d7ccc8",
                width: "100%",
                fontFamily: "serif",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => navigate("/knowledge")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "#a1887f",
              border: "1px solid rgba(139,110,99,0.4)",
              borderRadius: "4px",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "serif",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            知识库
          </button>
          <button
            onClick={() => navigate("/create")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1.25rem",
              background: "linear-gradient(135deg, #c62828 0%, #b71c1c 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              fontSize: "0.875rem",
              cursor: "pointer",
              fontFamily: "serif",
              boxShadow: "0 2px 8px rgba(198,40,40,0.4)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            开始创作
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <main style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {filteredNovels.length === 0 ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "6rem 2rem",
            textAlign: "center",
          }}>
            {/* 毛笔 SVG */}
            <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, marginBottom: "2rem", opacity: 0.7 }}>
              {/* 砚台 */}
              <ellipse cx="60" cy="90" rx="35" ry="12" fill="#3e2723" stroke="#5d4037" strokeWidth="2" />
              <ellipse cx="60" cy="85" rx="30" ry="10" fill="#2c1810" />
              <path d="M35 85 Q60 75 85 85" fill="none" stroke="#4e342e" strokeWidth="1" />
              {/* 墨汁 */}
              <ellipse cx="60" cy="85" rx="20" ry="6" fill="#1a1a1a" opacity="0.8" />
              {/* 毛笔 */}
              <g transform="rotate(-30 75 40)">
                <rect x="72" y="20" width="6" height="50" rx="2" fill="#5d4037" />
                <rect x="73" y="15" width="4" height="8" rx="1" fill="#8d6e63" />
                <path d="M70 70 L75 85 L80 70" fill="#2c1810" />
                <path d="M72 68 L75 80 L78 68" fill="#1a1a1a" />
              </g>
            </svg>
            <h2 style={{
              fontFamily: "'STXingkai', 'FangSong', 'KaiTi', serif",
              fontSize: "1.5rem",
              color: "#d4a574",
              marginBottom: "0.75rem",
              letterSpacing: "0.1em",
            }}>
              {searchQuery ? "未找到匹配的古卷" : "书架空空如也"}
            </h2>
            <p style={{
              color: "#8d6e63",
              fontSize: "1rem",
              marginBottom: "2rem",
              fontFamily: "serif",
              letterSpacing: "0.15em",
            }}>
              {searchQuery ? "换个关键词再搜寻一番" : "执笔落墨，书写你的故事篇章"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate("/create")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  background: "linear-gradient(135deg, #c62828 0%, #b71c1c 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  cursor: "pointer",
                  fontFamily: "serif",
                  boxShadow: "0 4px 12px rgba(198,40,40,0.4)",
                }}
              >
                执笔开篇
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {shelfRows.map((row, rowIndex) => (
              <div key={rowIndex} style={{
                position: "relative",
                marginBottom: "1.5rem",
                opacity: isLoaded ? 1 : 0,
                transform: isLoaded ? "translateX(0)" : "translateX(-30px)",
                transition: `all 0.6s ease ${rowIndex * 0.15}s`,
              }}>
                {/* 书架层板 */}
                <div style={{
                  display: "flex",
                  gap: "1.5rem",
                  padding: "1.5rem 1rem 2rem",
                  position: "relative",
                }}>
                  {row.map((novel, bookIndex) => {
                    const globalIndex = rowIndex * booksPerRow + bookIndex;
                    const bookColor = getBookColor(globalIndex);
                    const isHovered = hoveredBook === novel.id;
                    const totalWords = novel.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

                    return (
                      <div
                        key={novel.id}
                        onClick={() => navigate(`/novel/${novel.id}`)}
                        onMouseEnter={() => setHoveredBook(novel.id)}
                        onMouseLeave={() => setHoveredBook(null)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          cursor: "pointer",
                          position: "relative",
                          zIndex: isHovered ? 10 : 1,
                        }}
                      >
                        {/* 书籍 - 书脊 */}
                        <div style={{
                          height: "220px",
                          background: `linear-gradient(135deg, ${bookColor} 0%, ${bookColor}dd 50%, ${bookColor}bb 100%)`,
                          borderRadius: "2px 6px 6px 2px",
                          position: "relative",
                          transform: isHovered
                            ? "rotate(-8deg) translateY(-10px) scale(1.05)"
                            : "rotate(0deg) translateY(0) scale(1)",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          boxShadow: isHovered
                            ? `8px 8px 20px rgba(0,0,0,0.5), inset -2px 0 4px rgba(0,0,0,0.3), inset 2px 0 4px rgba(255,255,255,0.1)`
                            : `3px 3px 10px rgba(0,0,0,0.3), inset -2px 0 4px rgba(0,0,0,0.3), inset 2px 0 4px rgba(255,255,255,0.1)`,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "1rem 0.5rem",
                          overflow: "hidden",
                        }}>
                          {/* 书脊装饰 - 顶部 */}
                          <div style={{
                            position: "absolute",
                            top: 8,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "70%",
                            height: "2px",
                            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.6), transparent)",
                          }} />
                          <div style={{
                            position: "absolute",
                            top: 14,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "50%",
                            height: "1px",
                            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)",
                          }} />

                          {/* 书名 - 竖排 */}
                          <div style={{
                            writingMode: "vertical-rl",
                            textOrientation: "mixed",
                            fontFamily: "'STXingkai', 'FangSong', 'KaiTi', serif",
                            fontSize: "1.1rem",
                            color: "#fff",
                            textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                            letterSpacing: "0.2em",
                            lineHeight: 1.6,
                            maxHeight: "140px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {novel.title}
                          </div>

                          {/* 书脊装饰 - 底部 */}
                          <div style={{
                            position: "absolute",
                            bottom: 14,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "50%",
                            height: "1px",
                            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)",
                          }} />
                          <div style={{
                            position: "absolute",
                            bottom: 8,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "70%",
                            height: "2px",
                            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.6), transparent)",
                          }} />

                          {/* 书页边缘效果 */}
                          <div style={{
                            position: "absolute",
                            right: 0,
                            top: "10%",
                            bottom: "10%",
                            width: "3px",
                            background: "repeating-linear-gradient(180deg, #f5f5dc 0px, #f5f5dc 1px, #e8e0d0 1px, #e8e0d0 2px)",
                            opacity: 0.6,
                          }} />

                          {/* 装订线 */}
                          <div style={{
                            position: "absolute",
                            left: 4,
                            top: "10%",
                            bottom: "10%",
                            width: "1px",
                            background: "rgba(0,0,0,0.3)",
                          }} />
                        </div>

                        {/* 悬停提示 */}
                        {isHovered && (
                          <div style={{
                            position: "absolute",
                            bottom: -80,
                            left: "50%",
                            transform: "translateX(-50%)",
                            background: "rgba(44,24,16,0.95)",
                            border: "1px solid rgba(139,110,99,0.5)",
                            borderRadius: "4px",
                            padding: "0.5rem 0.75rem",
                            whiteSpace: "nowrap",
                            zIndex: 20,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                          }}>
                            <div style={{
                              fontFamily: "serif",
                              fontSize: "0.8rem",
                              color: "#d4a574",
                              marginBottom: "0.25rem",
                            }}>
                              {novel.title}
                            </div>
                            <div style={{
                              display: "flex",
                              gap: "0.75rem",
                              fontSize: "0.7rem",
                              color: "#8d6e63",
                              marginBottom: "0.5rem",
                            }}>
                              <span>{novel.genre || "未分类"}</span>
                              <span>{totalWords.toLocaleString()}字</span>
                              <span>{getStatusText(novel.status)}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({ id: novel.id, title: novel.title });
                              }}
                              style={{
                                width: "100%",
                                padding: "0.25rem 0.5rem",
                                background: "rgba(198,40,40,0.8)",
                                border: "1px solid rgba(198,40,40,0.5)",
                                borderRadius: "3px",
                                color: "#fff",
                                fontSize: "0.7rem",
                                cursor: "pointer",
                                fontFamily: "serif",
                              }}
                            >
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* 补齐空位 */}
                  {Array.from({ length: booksPerRow - row.length }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ flex: 1, minWidth: 0 }} />
                  ))}
                </div>

                {/* 层板 */}
                <div style={{
                  height: "12px",
                  background: "linear-gradient(180deg, #5d4037 0%, #4e342e 50%, #3e2723 100%)",
                  borderRadius: "0 0 4px 4px",
                  boxShadow: "0 4px 8px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.1)",
                  position: "relative",
                }}>
                  {/* 层板木纹 */}
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='10' viewBox='0 0 100 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 5 Q25 3 50 5 T100 5' fill='none' stroke='%23ffffff' stroke-opacity='0.05' stroke-width='1'/%3E%3C/svg%3E")`,
                    backgroundSize: "100px 10px",
                  }} />
                  {/* 层板前边缘 */}
                  <div style={{
                    position: "absolute",
                    bottom: -3,
                    left: 0,
                    right: 0,
                    height: "3px",
                    background: "linear-gradient(180deg, #3e2723, #2c1810)",
                    borderRadius: "0 0 2px 2px",
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
        }}>
          <div style={{
            background: "#2c1810",
            border: "1px solid #5d4037",
            borderRadius: "8px",
            padding: "2rem",
            maxWidth: "400px",
            width: "90%",
            textAlign: "center",
          }}>
            <h3 style={{
              fontFamily: "serif",
              fontSize: "1.2rem",
              color: "#d4a574",
              marginBottom: "1rem",
            }}>
              确认删除
            </h3>
            <p style={{
              color: "#8d6e63",
              marginBottom: "1.5rem",
              fontSize: "0.9rem",
            }}>
              确定要删除《{deleteConfirm.title}》吗？此操作不可撤销。
            </p>
            <div style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
            }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: "0.5rem 1.5rem",
                  background: "transparent",
                  border: "1px solid #5d4037",
                  borderRadius: "4px",
                  color: "#8d6e63",
                  cursor: "pointer",
                  fontFamily: "serif",
                }}
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                style={{
                  padding: "0.5rem 1.5rem",
                  background: "#c62828",
                  border: "none",
                  borderRadius: "4px",
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "serif",
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部装饰 */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "60px",
        background: "linear-gradient(180deg, transparent, rgba(44,24,16,0.8))",
        pointerEvents: "none",
        zIndex: 50,
      }} />
    </div>
  );
};

export default BookShelf;

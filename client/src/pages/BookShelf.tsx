// client/src/pages/BookShelf.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDefaultConfig } from "../hooks/useConfig";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Skeleton } from "../components/ui/Skeleton";
import "../styles/pages/bookshelf.css";

interface NovelListItem {
  id: string;
  title: string;
  genre: string | null;
  coverImage: string | null;
  status: string;
  chapters: { id: string; wordCount: number }[];
  updatedAt: string;
}

const BookShelf: React.FC = () => {
  const navigate = useNavigate();
  const [novels, setNovels] = useState<NovelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const { data: defaultConfig } = useDefaultConfig();

  useEffect(() => {
    loadNovels();
  }, []);

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
      setNovels(novels.filter((n) => n.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      drafting: { label: "进行中", cls: "badge-success" },
      completed: { label: "已完成", cls: "badge-warning" },
      paused: { label: "已暂停", cls: "badge-info" },
    };
    const s = map[status] || { label: status, cls: "" };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  if (loading) {
    return (
      <div className="bookshelf">
        <div className="bookshelf-header">
          <Skeleton width="120px" height="24px" />
          <Skeleton width="100px" height="36px" />
        </div>
        <Skeleton count={3} height="64px" />
      </div>
    );
  }

  return (
    <div className="bookshelf">
      {/* API Key 配置横幅 */}
      {!defaultConfig && (
        <div className="bookshelf-banner">
          <div className="bookshelf-banner-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="bookshelf-banner-text">
            <div className="bookshelf-banner-title">配置 AI 模型开始创作</div>
            <div className="bookshelf-banner-desc">添加你的 API Key，即可开始使用 AI 辅助创作</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate("/settings")}>
            立即配置
          </Button>
        </div>
      )}

      {/* 页面标题 */}
      <div className="bookshelf-header">
        <h1>我的作品</h1>
        <Button variant="primary" onClick={() => navigate("/create")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建作品
        </Button>
      </div>

      {/* 作品列表 */}
      {novels.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-disabled)" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p>还没有作品，点击「新建作品」开始创作</p>
        </div>
      ) : (
        <div className="bookshelf-list">
          {novels.map((novel) => {
            const totalWords = novel.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
            const chapterCount = novel.chapters.length;
            return (
              <div
                key={novel.id}
                className="bookshelf-item"
                onClick={() => navigate(`/novel/${novel.id}`)}
              >
                <div className="bookshelf-item-cover">
                  {novel.coverImage ? (
                    <img src={novel.coverImage} alt={novel.title} />
                  ) : (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                    }}>
                      {novel.title[0]}
                    </div>
                  )}
                </div>
                <div className="bookshelf-item-info">
                  <div className="bookshelf-item-title">{novel.title}</div>
                  <div className="bookshelf-item-summary">
                    {novel.genre || "未分类"} · {chapterCount} 章 · {totalWords.toLocaleString()} 字 · {getTimeAgo(novel.updatedAt)}
                  </div>
                </div>
                <div className="bookshelf-item-meta">
                  {getStatusBadge(novel.status)}
                  <div className="bookshelf-item-progress">
                    <div
                      className="bookshelf-item-progress-bar"
                      style={{ width: `${Math.min(100, (chapterCount / 10) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: novel.id, title: novel.title });
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "var(--space-1)",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除">
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          确定要删除《{deleteConfirm?.title}》吗？此操作不可撤销。
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button variant="primary" onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
};

export default BookShelf;

import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { translateChapterStatus, translateChapterSource } from "../../utils/translate";

const WritePanel: React.FC<{ novelId: string; activeChapterId?: string | null }> = ({ novelId, activeChapterId }) => {
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapters();
  }, [novelId]);

  // 当外部activeChapterId变化时，自动选择对应章节
  useEffect(() => {
    if (activeChapterId && chapters.length > 0) {
      const chapter = chapters.find(c => c.id === activeChapterId);
      if (chapter) {
        setActiveChapter(chapter);
      }
    }
  }, [activeChapterId, chapters]);

  const loadChapters = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ chapters: any[] }>(`/api/novels/${novelId}`);
      const nextChapters = data?.chapters || [];
      setChapters(nextChapters);
      if (activeChapter?.id) {
        const updatedActive = nextChapters.find((chapter) => chapter.id === activeChapter.id);
        if (updatedActive) setActiveChapter(updatedActive);
      }
    } catch (error) {
      console.error("加载章节失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChapter = async () => {
    try {
      const newChapter = await api.post<any>(`/api/novels/${novelId}/chapters`, {
        title: `第${chapters.length + 1}章`,
      });
      loadChapters();
      setActiveChapter(newChapter);
    } catch (error) {
      console.error("创建章节失败:", error);
    }
  };

  const handleSaveChapter = async () => {
    if (!activeChapter) return;
    try {
      await api.put(
        `/api/novels/${novelId}/chapters/${activeChapter.id}`,
        activeChapter
      );
      alert("保存成功");
    } catch (error) {
      console.error("保存章节失败:", error);
    }
  };

  const handleGenerate = async () => {
    if (!activeChapter) return;
    try {
      const response = await fetch(
        `/api/novels/${novelId}/chapters/${activeChapter.id}/generate`,
        { method: "POST" }
      );
      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        setActiveChapter((prev: any) => ({
          ...prev,
          content: (prev.content || "") + text,
          wordCount: ((prev.content || "") + text).replace(/\s/g, "").length,
        }));
      }
      const data = await api.get<{ chapters: any[] }>(`/api/novels/${novelId}`);
      const nextChapters = data?.chapters || [];
      setChapters(nextChapters);
      const updatedActive = nextChapters.find((chapter) => chapter.id === activeChapter.id);
      if (updatedActive) setActiveChapter(updatedActive);
    } catch (error) {
      console.error("生成失败:", error);
    }
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="write-panel">
      <div className="chapter-sidebar">
        <div className="chapter-header">
          <h3>章节列表</h3>
          <button className="btn-add" onClick={handleCreateChapter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => (
            <div
              key={chapter.id}
              className={`chapter-item ${activeChapter?.id === chapter.id ? "active" : ""}`}
              onClick={() => setActiveChapter(chapter)}
            >
              <span className="chapter-title">
                {chapter.title}
                <em style={{ marginLeft: "0.5rem", fontStyle: "normal", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {chapter.wordCount || 0}字
                </em>
              </span>
              <span className="chapter-status">
                {translateChapterStatus(chapter.status).icon} {translateChapterStatus(chapter.status).label}
                {" · "}
                {translateChapterSource(chapter.source || "manual").icon} {translateChapterSource(chapter.source || "manual").label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="write-content">
        {activeChapter ? (
          <>
            <div className="write-header">
              <input
                type="text"
                value={activeChapter.title}
                onChange={(e) =>
                  setActiveChapter({ ...activeChapter, title: e.target.value })
                }
              />
              <div className="write-actions">
                <span style={{ alignSelf: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {activeChapter.wordCount || 0}字 · 来源：{translateChapterSource(activeChapter.source || "manual").icon} {translateChapterSource(activeChapter.source || "manual").label}
                </span>
                <button className="btn-secondary" onClick={handleSaveChapter}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  保存
                </button>
                <button className="btn-primary" onClick={handleGenerate}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  AI生成
                </button>
              </div>
            </div>
            <textarea
              className="write-editor"
              value={activeChapter.content || ""}
              onChange={(e) =>
                setActiveChapter({ ...activeChapter, content: e.target.value })
              }
              placeholder="开始写作..."
            />
          </>
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <p>请选择章节或创建新章节</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WritePanel;

import { useEffect, useMemo, useState } from "react";
import "../styles/workbench.css";
import { api } from "../lib/api";
import CharacterCard from "../components/CharacterCard";
import WorldviewEditor from "../components/WorldviewEditor";
import KnowledgeHub from "../components/KnowledgeHub";
import VolumeEditor from "../components/VolumeEditor";
import MemoryPanel from "../components/MemoryPanel";
import ConsistencyPanel from "../components/ConsistencyPanel";
import StylePanel from "../components/StylePanel";

interface Chapter {
  id: string;
  novelId: string;
  order: number;
  title: string;
  content: string;
  summary?: string | null;
  wordCount: number;
  status: string;
  updatedAt: string;
}

interface NovelListItem {
  id: string;
  title: string;
  inspiration?: string | null;
  outline?: string | null;
  genre?: string | null;
  status: string;
  updatedAt: string;
  _count?: {
    chapters: number;
    characters: number;
    assets: number;
  };
}

interface NovelDetail extends NovelListItem {
  chapters: Chapter[];
}

interface BookAnalysisSection {
  id: string;
  analysisId: string;
  sectionKey: string;
  title: string;
  status: string;
  aiContent?: string | null;
  editedContent?: string | null;
  notes?: string | null;
  evidence: Array<{ label: string; excerpt: string; sourceLabel: string }>;
  frozen: boolean;
  sortOrder: number;
  updatedAt: string;
}

interface BookAnalysisDetail {
  id: string;
  title: string;
  sourceTitle?: string | null;
  sourceText: string;
  status: string;
  summary?: string | null;
  progress: number;
  currentItemLabel?: string | null;
  lastError?: string | null;
  publishedAssetId?: string | null;
  bindings?: Array<{
    id: string;
    novelId: string;
    analysisId: string;
    source: string;
    createdAt: string;
  }>;
  sections: BookAnalysisSection[];
  createdAt: string;
  updatedAt: string;
}

type RunState = "idle" | "loading" | "saving" | "generating" | "error";
type WorkspaceMode = "write" | "analysis" | "knowledge" | "characters" | "worldviews" | "volumes" | "memory" | "consistency" | "style";

function getWordCount(content: string): number {
  return content.replace(/\s/g, "").length;
}

function statusLabel(status?: string): string {
  switch (status) {
    case "drafted":
      return "已有草稿";
    case "planned":
      return "待写";
    case "drafting":
      return "创作中";
    default:
      return "未开始";
  }
}

function buildMemo(novel: NovelDetail | null, chapter: Chapter | null): string[] {
  if (!novel) {
    return [
      "新建作品后，系统会自动生成第一章。",
      "每个章节都可以保存目标、正文和生成草稿。",
      "后续会接入角色、世界观、伏笔与类型流程。",
      "当前版本优先保证小说主线闭环可用。",
    ];
  }

  return [
    `作品类型：${novel.genre || "未设置"}。`,
    `一句话灵感：${novel.inspiration || "还没有记录灵感。"}。`,
    `当前章节：${chapter ? `${chapter.title}，${statusLabel(chapter.status)}` : "还没有章节"}。`,
    `创作要求：生成时会参考作品灵感、本章目标和已有正文。`,
  ];
}

export default function Home() {
  const [novels, setNovels] = useState<NovelListItem[]>([]);
  const [activeNovel, setActiveNovel] = useState<NovelDetail | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("新书案");
  const [draftGenre, setDraftGenre] = useState("东方幻想");
  const [draftInspiration, setDraftInspiration] = useState("一个被旧誓言牵住的人，必须写完未竟之书。");
  const [chapterContent, setChapterContent] = useState("");
  const [chapterSummary, setChapterSummary] = useState("");
  const [state, setState] = useState<RunState>("loading");
  const [notice, setNotice] = useState("");
  const [bookAnalyses, setBookAnalyses] = useState<BookAnalysisDetail[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMode>("write");
  const [analysisTitle, setAnalysisTitle] = useState("样书拆解");
  const [analysisSourceTitle, setAnalysisSourceTitle] = useState("参考作品片段");
  const [analysisSourceText, setAnalysisSourceText] = useState(
    "把一段你想学习的小说正文、章节梗概或拆书材料粘贴到这里。系统会拆出总览、剧情结构、时间线、人物系统、世界观、主题、文风技法和商业卖点。",
  );

  const activeChapter = useMemo(
    () => activeNovel?.chapters.find((chapter) => chapter.id === activeChapterId) ?? null,
    [activeNovel, activeChapterId],
  );
  const activeAnalysis = useMemo(
    () => bookAnalyses.find((analysis) => analysis.id === activeAnalysisId) ?? bookAnalyses[0] ?? null,
    [bookAnalyses, activeAnalysisId],
  );
  const memo = useMemo(() => buildMemo(activeNovel, activeChapter), [activeNovel, activeChapter]);
  const totalChapters = activeNovel?.chapters.length ?? 0;
  const draftedChapters = activeNovel?.chapters.filter((chapter) => chapter.status === "drafted").length ?? 0;
  const progress = totalChapters > 0 ? Math.round((draftedChapters / totalChapters) * 100) : 0;

  async function loadNovels(selectId?: string) {
    setState("loading");
    const list = await api<NovelListItem[]>("/api/novels");
    setNovels(list);
    const nextId = selectId ?? activeNovel?.id ?? list[0]?.id;
    if (nextId) {
      await loadNovel(nextId);
      await loadBookAnalyses(undefined, nextId);
    } else {
      setActiveNovel(null);
      setActiveChapterId(null);
      setChapterContent("");
      setChapterSummary("");
      setBookAnalyses([]);
      setActiveAnalysisId(null);
    }
    setState("idle");
  }

  async function loadBookAnalyses(selectId?: string, novelId = activeNovel?.id) {
    if (!novelId) {
      setBookAnalyses([]);
      setActiveAnalysisId(null);
      return;
    }
    const list = await api<BookAnalysisDetail[]>(`/api/book-analysis?novelId=${encodeURIComponent(novelId)}`);
    setBookAnalyses(list);
    const nextId = selectId && list.some((analysis) => analysis.id === selectId)
      ? selectId
      : list[0]?.id ?? null;
    setActiveAnalysisId(nextId);
  }

  async function loadNovel(id: string) {
    const novel = await api<NovelDetail>(`/api/novels/${id}`);
    setActiveNovel(novel);
    const chapter = novel.chapters.find((item) => item.id === activeChapterId) ?? novel.chapters[0] ?? null;
    setActiveChapterId(chapter?.id ?? null);
    setChapterContent(chapter?.content ?? "");
    setChapterSummary(chapter?.summary ?? "");
  }

  useEffect(() => {
    loadNovels().catch((error) => {
      setState("error");
      setNotice(error instanceof Error ? error.message : "加载失败。");
    });
  }, []);

  async function createNovel() {
    setState("saving");
    try {
      const novel = await api<NovelDetail>("/api/novels", {
        method: "POST",
        body: JSON.stringify({
          title: draftTitle,
          genre: draftGenre,
          inspiration: draftInspiration,
        }),
      });
      setNotice("已创建作品，并自动生成第一章。");
      await loadNovels(novel.id);
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "创建作品失败。");
    }
  }

  async function createChapter() {
    if (!activeNovel) return;
    
    // 弹出输入框让用户输入标题
    const title = prompt("请输入章节标题：", `第${activeNovel.chapters.length + 1}章`);
    if (!title) return;
    
    setState("saving");
    try {
      const chapter = await api<Chapter>(`/api/novels/${activeNovel.id}/chapters`, {
        method: "POST",
        body: JSON.stringify({
          title,
          summary: "",
        }),
      });
      await loadNovel(activeNovel.id);
      setActiveChapterId(chapter.id);
      setNotice("已新增章节，可以开始写本章目标和正文。");
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "创建章节失败。");
    }
  }

  async function saveChapter(nextContent = chapterContent) {
    if (!activeNovel || !activeChapter) return;
    setState("saving");
    try {
      const saved = await api<Chapter>(`/api/novels/${activeNovel.id}/chapters/${activeChapter.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: activeChapter.title,
          summary: chapterSummary,
          content: nextContent,
          status: nextContent.trim() ? "drafted" : "planned",
        }),
      });
      setActiveNovel({
        ...activeNovel,
        chapters: activeNovel.chapters.map((chapter) => (
          chapter.id === saved.id ? saved : chapter
        )),
      });
      setChapterContent(saved.content);
      setChapterSummary(saved.summary ?? "");
      setNotice("已保存当前章节。");
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "保存章节失败。");
    }
  }

  async function generateChapter(mode: "append" | "replace" = "append") {
    if (!activeNovel || !activeChapter) return;
    
    // 如果是续写模式，检查是否有内容
    if (mode === "append" && !chapterContent.trim()) {
      setNotice("当前章节没有内容，请先输入内容或使用重新生成。");
      return;
    }

    setState("generating");
    setNotice(mode === "replace" ? "正在重新生成章节内容..." : "正在续写章节内容...");
    
    let nextContent = mode === "append" ? chapterContent : "";
    try {
      const response = await fetch(`/api/novels/${activeNovel.id}/chapters/${activeChapter.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "生成失败");
      }

      if (!response.body) {
        throw new Error("生成流不可用。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        if (mode === "append") {
          nextContent += chunk;
        } else {
          nextContent += chunk;
        }
        setChapterContent(nextContent);
      }

      await loadNovel(activeNovel.id);
      setChapterContent(nextContent);
      setNotice(mode === "replace" ? "草稿已重新生成并保存。" : "草稿已续写并保存。");
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "生成草稿失败。");
    }
  }

  async function createBookAnalysis() {
    if (!activeNovel) {
      setNotice("请先选择一本作品，再为这本作品创建拆书。");
      return;
    }
    setState("saving");
    try {
      const analysis = await api<BookAnalysisDetail>("/api/book-analysis", {
        method: "POST",
        body: JSON.stringify({
          title: analysisTitle,
          sourceTitle: analysisSourceTitle,
          sourceText: analysisSourceText,
          novelId: activeNovel.id,
        }),
      });
      setNotice("拆书已完成，结果已分区保存。");
      await loadBookAnalyses(analysis.id, activeNovel.id);
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "拆书失败。");
    }
  }

  async function rebuildBookAnalysis() {
    if (!activeAnalysis) return;
    setState("saving");
    try {
      const analysis = await api<BookAnalysisDetail>(`/api/book-analysis/${activeAnalysis.id}/rebuild`, {
        method: "POST",
      });
      setNotice("拆书已重新生成。");
      await loadBookAnalyses(analysis.id, activeNovel?.id);
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "重建拆书失败。");
    }
  }

  async function publishBookAnalysis() {
    if (!activeAnalysis) return;
    setState("saving");
    try {
      await api(`/api/book-analysis/${activeAnalysis.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ novelId: activeNovel?.id ?? null }),
      });
      setNotice(activeNovel ? "拆书结果已发布到当前作品知识库。" : "拆书结果已发布到知识库。");
      await Promise.all([
        loadBookAnalyses(activeAnalysis.id, activeNovel?.id),
        activeNovel ? loadNovel(activeNovel.id) : Promise.resolve(),
      ]);
      setState("idle");
    } catch (error) {
      setState("error");
      setNotice(error instanceof Error ? error.message : "发布到知识库失败。");
    }
  }

  function selectChapter(chapter: Chapter) {
    setActiveChapterId(chapter.id);
    setChapterContent(chapter.content);
    setChapterSummary(chapter.summary ?? "");
    setNotice(`已切换到第 ${chapter.order} 章：${chapter.title}`);
  }

  function scrollToProjectBox() {
    document.getElementById("project-setup")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setNotice("先在左侧填写小说名称、类型和一句话灵感，然后点击'创建作品和第一章'。");
  }

  const isBusy = state === "loading" || state === "saving" || state === "generating";

  return (
    <div className="writer-shell">
      <a className="skip-link" href="#main-workspace">跳到主工作区</a>
      <div className="writer-container">
        <nav className="top-nav">
          <div className="brand-lockup">
            <div className="brand-mark">梦</div>
            <div>
              <div className="brand-name">Dream Writer</div>
              <div className="brand-subtitle">AI 小说创作工作台</div>
            </div>
          </div>
          <div className="nav-links" aria-label="工作区导航">
            <button type="button" className={activeWorkspace === "write" ? "active" : ""} onClick={() => setActiveWorkspace("write")}>写作</button>
            <button type="button" className={activeWorkspace === "volumes" ? "active" : ""} onClick={() => setActiveWorkspace("volumes")}>卷纲</button>
            <button type="button" className={activeWorkspace === "analysis" ? "active" : ""} onClick={() => setActiveWorkspace("analysis")}>拆书</button>
            <button type="button" className={activeWorkspace === "characters" ? "active" : ""} onClick={() => setActiveWorkspace("characters")}>人物</button>
            <button type="button" className={activeWorkspace === "worldviews" ? "active" : ""} onClick={() => setActiveWorkspace("worldviews")}>世界观</button>
            <button type="button" className={activeWorkspace === "memory" ? "active" : ""} onClick={() => setActiveWorkspace("memory")}>记忆</button>
            <button type="button" className={activeWorkspace === "consistency" ? "active" : ""} onClick={() => setActiveWorkspace("consistency")}>校验</button>
            <button type="button" className={activeWorkspace === "style" ? "active" : ""} onClick={() => setActiveWorkspace("style")}>风格</button>
            <button type="button" className={activeWorkspace === "knowledge" ? "active" : ""} onClick={() => setActiveWorkspace("knowledge")}>知识库</button>
          </div>
          <button className="nav-action" type="button" onClick={scrollToProjectBox}>新建作品</button>
        </nav>

        <section className="workspace-hero">
          <div>
            <span>当前任务</span>
            <h1>
              {activeWorkspace === "write" ? "写好这一章。"
                : activeWorkspace === "volumes" ? "规划卷纲章纲。"
                : activeWorkspace === "analysis" ? "拆清一本书。"
                : activeWorkspace === "characters" ? "管理人物设定。"
                : activeWorkspace === "worldviews" ? "构建世界观。"
                : activeWorkspace === "memory" ? "管理结构化记忆。"
                : activeWorkspace === "consistency" ? "检查一致性问题。"
                : activeWorkspace === "style" ? "配置写作风格。"
                : "沉淀可复用记忆。"}
            </h1>
            <p>
              {activeWorkspace === "write"
                ? "先选作品和章节，再填写本章目标，最后保存或生成草稿。"
                : activeWorkspace === "volumes"
                  ? "分卷规划剧情，设计章纲，控制节奏和爽点。"
                  : activeWorkspace === "analysis"
                    ? "粘贴参考文本，生成结构、人物、世界观、文风和卖点分析。"
                    : activeWorkspace === "characters"
                      ? "创建和管理作品中的人物，记录角色设定和关系。"
                      : activeWorkspace === "memory"
                        ? "管理世界、角色、剧情、伏笔、爽点等结构化记忆。"
                        : activeWorkspace === "consistency"
                          ? "检查战力崩坏、人设崩坏、世界观冲突等一致性问题。"
                          : activeWorkspace === "style"
                            ? "配置叙事视角、节奏、语言风格，去 AI 味。"
                    : activeWorkspace === "worldviews"
                      ? "构建作品的世界观，包括规则、地理、势力等设定。"
                      : "查看作品资产，把拆书结果和设定沉淀为后续生成的上下文。"}
            </p>
          </div>
          <div className="task-metrics" aria-label="当前状态">
            <article>
              <span>作品</span>
              <strong>{activeNovel?.title || "未选择"}</strong>
            </article>
            <article>
              <span>章节</span>
              <strong>{totalChapters ? `${draftedChapters}/${totalChapters}` : "0/0"}</strong>
            </article>
            <article>
              <span>拆书</span>
              <strong>{bookAnalyses.length}</strong>
            </article>
          </div>
        </section>

        {notice && <p className={`notice notice-bar ${state === "error" ? "error" : ""}`}>{notice}</p>}

        <section className="studio-grid refined" id="main-workspace">
          <aside className="project-sidebar" id="project-setup">
            <div className="panel-heading">
              <span>作品</span>
              <strong>{novels.length}</strong>
            </div>
            <div className="new-project-box">
              <label>
                <span>小说名称</span>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
              </label>
              <label>
                <span>类型</span>
                <input value={draftGenre} onChange={(event) => setDraftGenre(event.target.value)} />
              </label>
              <label>
                <span>一句话灵感</span>
                <textarea value={draftInspiration} onChange={(event) => setDraftInspiration(event.target.value)} />
              </label>
              <button className="primary-button" type="button" onClick={createNovel} disabled={!draftTitle.trim() || state === "saving"}>
                创建作品和第一章
              </button>
            </div>
            <div className="project-list">
              {novels.map((novel) => {
                const count = novel._count?.chapters ?? 0;
                const itemProgress = count > 0 ? Math.max(12, Math.min(96, progress || 24)) : 0;
                return (
                  <button
                    key={novel.id}
                    type="button"
                    onClick={() => {
                      loadNovel(novel.id);
                      loadBookAnalyses(undefined, novel.id);
                      setActiveWorkspace("write");
                    }}
                    className={activeNovel?.id === novel.id ? "active" : ""}
                  >
                    <strong>{novel.title}</strong>
                    <span>{novel.genre || "未分类"} · {count} 章</span>
                    <i><b style={{ width: `${itemProgress}%` }} /></i>
                  </button>
                );
              })}
              {novels.length === 0 && <p className="empty-note">还没有作品。先创建一本，系统会自动生成第一章。</p>}
            </div>
          </aside>

          <main className="primary-workspace">
            {activeWorkspace === "write" && (
              <section className="editor-panel" id="writer-desk">
                <header className="section-header">
                  <div>
                    <h2>章节编辑台</h2>
                    <p>{activeNovel ? `${activeNovel.title} · ${activeChapter ? activeChapter.title : "未选择章节"}` : "创建作品后开始写正文"}</p>
                  </div>
                  <div className="desk-actions">
                    <button type="button" onClick={createChapter} disabled={!activeNovel || state === "saving"}>新增章节</button>
                    <button type="button" onClick={() => saveChapter()} disabled={!activeChapter || isBusy}>保存章节</button>
                    {chapterContent.trim() ? (
                      <>
                        <button type="button" onClick={() => generateChapter("append")} disabled={!activeChapter || state === "generating"}>
                          {state === "generating" ? "正在续写" : "AI续写"}
                        </button>
                        <button className="primary-button" type="button" onClick={() => generateChapter("replace")} disabled={!activeChapter || state === "generating"}>
                          {state === "generating" ? "正在生成" : "AI重新生成"}
                        </button>
                      </>
                    ) : (
                      <button className="primary-button" type="button" onClick={() => generateChapter("replace")} disabled={!activeChapter || state === "generating"}>
                        {state === "generating" ? "正在生成" : "AI生成"}
                      </button>
                    )}
                  </div>
                </header>
                {activeNovel ? (
                  <div className="editor-layout">
                    <div className="chapter-list" aria-label="章节列表">
                      {activeNovel.chapters.map((chapter) => (
                        <button
                          type="button"
                          key={chapter.id}
                          className={chapter.id === activeChapterId ? "active" : ""}
                          onClick={() => selectChapter(chapter)}
                        >
                          <span>第 {chapter.order} 章 · {statusLabel(chapter.status)}</span>
                          <strong>{chapter.title}</strong>
                          <small>{chapter.wordCount || getWordCount(chapter.content)} 字</small>
                        </button>
                      ))}
                    </div>
                    <div className="chapter-editor-area">
                      <label>
                        <span>本章目标</span>
                        <input
                          value={chapterSummary}
                          onChange={(event) => setChapterSummary(event.target.value)}
                          placeholder="例如：主角进入旧城，发现第一枚线索。"
                        />
                      </label>
                      <label className="body-field">
                        <span>章节正文</span>
                        <textarea
                          value={chapterContent}
                          onChange={(event) => setChapterContent(event.target.value)}
                          placeholder="在这里写正文。也可以先点击'生成草稿'。"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="empty-note">先在左侧创建或选择一本作品。</p>
                )}
              </section>
            )}

            {activeWorkspace === "analysis" && (
              <section className="book-analysis-panel" id="book-analysis-workbench">
                <header className="section-header">
                  <div>
                    <h2>当前作品拆书</h2>
                    <p>{activeNovel ? `只显示《${activeNovel.title}》绑定的拆书记录，完成后可发布到这本书的知识库。` : "先选择一本作品，再创建拆书记录。"}</p>
                  </div>
                  <div className="desk-actions">
                    <button type="button" onClick={rebuildBookAnalysis} disabled={!activeAnalysis || isBusy}>重建拆书</button>
                    <button className="primary-button" type="button" onClick={publishBookAnalysis} disabled={!activeNovel || !activeAnalysis || activeAnalysis.status !== "succeeded" || isBusy}>发布到本书知识库</button>
                  </div>
                </header>
                <div className="analysis-layout">
                  <div className="analysis-form">
                    <div className="flow-strip" aria-label="拆书流程">
                      <span>1 选择作品</span>
                      <span>2 粘贴样章</span>
                      <span>3 生成 8 区拆解</span>
                      <span>4 发布到本书知识库</span>
                    </div>
                    <label>
                      <span>拆书标题</span>
                      <input value={analysisTitle} onChange={(event) => setAnalysisTitle(event.target.value)} />
                    </label>
                    <label>
                      <span>来源标题</span>
                      <input value={analysisSourceTitle} onChange={(event) => setAnalysisSourceTitle(event.target.value)} />
                    </label>
                    <label>
                      <span>原文 / 参考片段</span>
                      <textarea value={analysisSourceText} onChange={(event) => setAnalysisSourceText(event.target.value)} />
                    </label>
                    <button className="primary-button" type="button" onClick={createBookAnalysis} disabled={!activeNovel || analysisSourceText.trim().length < 80 || isBusy}>
                      {state === "saving" ? "处理中" : "创建拆书"}
                    </button>
                    <div className="analysis-list">
                      {bookAnalyses.map((analysis) => (
                        <button
                          key={analysis.id}
                          type="button"
                          className={activeAnalysis?.id === analysis.id ? "active" : ""}
                          onClick={() => {
                            setActiveAnalysisId(analysis.id);
                            setNotice(`已打开拆书：${analysis.title}`);
                          }}
                        >
                          <strong>{analysis.title}</strong>
                          <span>{analysis.status} · {analysis.progress}% · 当前作品</span>
                        </button>
                      ))}
                      {bookAnalyses.length === 0 && (
                        <p className="empty-note">
                          {activeNovel ? "当前作品还没有拆书记录。粘贴参考文本后，系统会把结果绑定到这本书。" : "请先在左侧选择或创建一本作品。"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="analysis-result">
                    {activeAnalysis ? (
                      <>
                        <div className="analysis-summary">
                          <strong>{activeAnalysis.title}</strong>
                          <span>{activeAnalysis.sourceTitle || "未填写来源"} · {activeAnalysis.status} · {activeAnalysis.progress}%</span>
                          {activeAnalysis.publishedAssetId && <em>已发布</em>}
                        </div>
                        <div className="analysis-sections">
                          {activeAnalysis.sections.map((section) => (
                            <article key={section.id}>
                              <header>
                                <span>{section.sortOrder}</span>
                                <strong>{section.title}</strong>
                                <em>{section.status}</em>
                              </header>
                              <pre>{section.editedContent || section.aiContent || "暂无内容。"}</pre>
                            </article>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="empty-note">创建或选择一个拆书任务后，这里会展示分区结果。</p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeWorkspace === "characters" && activeNovel && (
              <CharacterCard novelId={activeNovel.id} onNotice={setNotice} />
            )}

            {activeWorkspace === "characters" && !activeNovel && (
              <section className="character-panel">
                <p className="empty-note">请先选择或创建一本作品。</p>
              </section>
            )}

            {activeWorkspace === "volumes" && activeNovel && (
              <VolumeEditor novelId={activeNovel.id} onNotice={setNotice} />
            )}

            {activeWorkspace === "volumes" && !activeNovel && (
              <section className="volume-editor-panel">
                <p className="empty-note">请先选择或创建一本作品。</p>
              </section>
            )}

            {activeWorkspace === "memory" && activeNovel && (
              <MemoryPanel novelId={activeNovel.id} onNotice={setNotice} />
            )}

            {activeWorkspace === "memory" && !activeNovel && (
              <section className="memory-panel">
                <p className="empty-note">请先选择或创建一本作品。</p>
              </section>
            )}

            {activeWorkspace === "consistency" && activeNovel && (
              <ConsistencyPanel
                novelId={activeNovel.id}
                chapters={activeNovel.chapters}
                onNotice={setNotice}
              />
            )}

            {activeWorkspace === "consistency" && !activeNovel && (
              <section className="consistency-panel">
                <p className="empty-note">请先选择或创建一本作品。</p>
              </section>
            )}

            {activeWorkspace === "style" && activeNovel && (
              <StylePanel novelId={activeNovel.id} onNotice={setNotice} />
            )}

            {activeWorkspace === "style" && !activeNovel && (
              <section className="style-panel">
                <p className="empty-note">请先选择或创建一本作品。</p>
              </section>
            )}

            {activeWorkspace === "worldviews" && (
              <WorldviewEditor onNotice={setNotice} />
            )}

            {activeWorkspace === "knowledge" && (
              <KnowledgeHub novelId={activeNovel?.id} onNotice={setNotice} />
            )}
          </main>

          <aside className="context-rail">
            <section className="today-panel">
              <h2>下一步</h2>
              <div>
                <span>
                  {activeWorkspace === "write" ? "写作建议"
                    : activeWorkspace === "volumes" ? "卷纲建议"
                    : activeWorkspace === "analysis" ? "拆书建议"
                    : activeWorkspace === "characters" ? "人物建议"
                    : activeWorkspace === "worldviews" ? "世界观建议"
                    : activeWorkspace === "memory" ? "记忆建议"
                    : activeWorkspace === "consistency" ? "校验建议"
                    : activeWorkspace === "style" ? "风格建议"
                    : "知识库建议"}
                </span>
                <strong>
                  {activeWorkspace === "write"
                    ? (activeChapter ? `补齐《${activeChapter.title}》目标，再续写正文` : "先创建作品和第一章")
                    : activeWorkspace === "volumes"
                      ? "先规划卷纲，再细化章纲，控制节奏和爽点"
                      : activeWorkspace === "analysis"
                        ? "粘贴 800 字以上参考文本，拆书质量会明显更稳"
                        : activeWorkspace === "characters"
                          ? "为当前作品创建人物卡，记录角色设定"
                          : activeWorkspace === "worldviews"
                            ? "构建世界观，为创作提供设定支撑"
                            : activeWorkspace === "memory"
                              ? "积累世界、角色、剧情等记忆，提升 AI 创作一致性"
                              : activeWorkspace === "consistency"
                                ? "选择章节进行一致性校验，发现并修复问题"
                                : activeWorkspace === "style"
                                  ? "配置写作风格，控制去 AI 味和叙事节奏"
                                  : "把已完成拆书发布到当前作品知识库"}
                </strong>
              </div>
              {activeWorkspace === "write" && (
                <div>
                  <span>风险</span>
                  <strong>{chapterSummary ? "本章目标已记录，生成前建议保存一次" : "目标为空会导致生成方向不稳定"}</strong>
                </div>
              )}
            </section>
            <section className="memory-card">
              <div className="memory-inner">
                <div className="memory-heading">
                  <div>
                    <span>当前作品</span>
                    <strong>{activeNovel?.title || "还没有选择作品"}</strong>
                  </div>
                  <em>{activeNovel?.genre || "未分类"}</em>
                </div>
                <div className="memory-block">
                  <div className="memory-title">本书记忆</div>
                  {memo.map((item) => <p key={item}>{item}</p>)}
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConfirmDialog } from "./ui/CommonComponents";
import { Modal } from "./ui/Modal";

interface ChapterOutline {
  id: string;
  volumeId: string;
  novelId: string;
  sortOrder: number;
  title: string;
  goal: string;
  conflict: string;
  emotion: string;
  hook: string;
  foreshadowing: string;
  payoff: string;
  pleasurePoint: string;
  status: string;
}

interface Volume {
  id: string;
  novelId: string;
  sortOrder: number;
  title: string;
  goal: string;
  conflict: string;
  emotion: string;
  newChars: string;
  mapName: string;
  endHook: string;
  status: string;
  chapterCount?: number;
  keyEvents?: string;
  turningPoints?: string;
  chapterOutlines: ChapterOutline[];
}

interface VolumeEditorProps {
  novelId: string;
  onNotice: (msg: string) => void;
}

export default function VolumeEditor({ novelId, onNotice }: VolumeEditorProps) {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activeVolumeId, setActiveVolumeId] = useState<string | null>(null);
  const [showVolumeForm, setShowVolumeForm] = useState(false);
  const [showChapterForm, setShowChapterForm] = useState(false);
  const [editingVolumeId, setEditingVolumeId] = useState<string | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [generatePrompt, setGeneratePrompt] = useState<{ type: "volume" | "chapter"; count: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<ChapterOutline | null>(null);
  const [showChapterDetail, setShowChapterDetail] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [volumeForm, setVolumeForm] = useState({
    title: "",
    goal: "",
    conflict: "",
    emotion: "",
    newChars: "",
    mapName: "",
    endHook: "",
    chapterCount: "",
    keyEvents: "",
    turningPoints: "",
  });

  const [chapterForm, setChapterForm] = useState({
    title: "",
    goal: "",
    conflict: "",
    emotion: "",
    hook: "",
    foreshadowing: "",
    payoff: "",
    pleasurePoint: "",
  });

  const activeVolume = volumes.find((v) => v.id === activeVolumeId);

  async function loadVolumes() {
    setLoading(true);
    try {
      const list = await api<Volume[]>(`/api/volumes/${novelId}`);
      setVolumes(list);
      if (!activeVolumeId && list.length > 0) {
        setActiveVolumeId(list[0].id);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载卷纲失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVolumes();
  }, [novelId]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = () => setShowExportMenu(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showExportMenu]);

  async function handleSaveVolume() {
    if (!volumeForm.title.trim()) {
      onNotice("卷名不能为空。");
      return;
    }
    try {
      if (editingVolumeId) {
        await api(`/api/volumes/${editingVolumeId}`, {
          method: "PUT",
          body: JSON.stringify(volumeForm),
        });
        onNotice("卷纲已更新。");
      } else {
        await api(`/api/volumes/${novelId}`, {
          method: "POST",
          body: JSON.stringify(volumeForm),
        });
        onNotice("卷纲已创建。");
      }
      resetVolumeForm();
      await loadVolumes();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存卷纲失败。");
    }
  }

  async function handleSaveChapter() {
    if (!activeVolumeId) {
      onNotice("请先选择一个卷。");
      return;
    }
    if (!chapterForm.title.trim()) {
      onNotice("章节名不能为空。");
      return;
    }
    try {
      if (editingChapterId) {
        await api(`/api/volumes/chapters/${editingChapterId}`, {
          method: "PUT",
          body: JSON.stringify(chapterForm),
        });
        onNotice("章纲已更新。");
      } else {
        await api(`/api/volumes/${activeVolumeId}/chapters`, {
          method: "POST",
          body: JSON.stringify(chapterForm),
        });
        onNotice("章纲已创建。");
      }
      resetChapterForm();
      await loadVolumes();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存章纲失败。");
    }
  }

  function requestDeleteVolume(id: string) {
    setConfirmAction({
      title: "删除卷",
      message: "确定删除此卷？所有章纲也会被删除。",
      onConfirm: () => doDeleteVolume(id),
    });
  }

  async function doDeleteVolume(id: string) {
    setConfirmAction(null);
    try {
      await api(`/api/volumes/${id}`, { method: "DELETE" });
      onNotice("卷纲已删除。");
      if (activeVolumeId === id) {
        setActiveVolumeId(null);
      }
      await loadVolumes();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除卷纲失败。");
    }
  }

  function requestDeleteChapter(id: string) {
    setConfirmAction({
      title: "删除章纲",
      message: "确定删除此章纲？此操作不可撤销。",
      onConfirm: () => doDeleteChapter(id),
    });
  }

  async function doDeleteChapter(id: string) {
    setConfirmAction(null);
    try {
      await api(`/api/volumes/chapters/${id}`, { method: "DELETE" });
      onNotice("章纲已删除。");
      await loadVolumes();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除章纲失败。");
    }
  }

  function handlePromptGenerate(type: "volume" | "chapter") {
    setGeneratePrompt({ type, count: type === "volume" ? "5" : "10" });
  }

  async function handleConfirmGenerate() {
    if (!generatePrompt) return;
    const count = parseInt(generatePrompt.count);
    if (isNaN(count) || count < 1) {
      onNotice("请输入有效的数量。");
      return;
    }
    setGeneratePrompt(null);

    if (generatePrompt.type === "volume") {
      await doGenerateVolumes(count);
    } else {
      await doGenerateChapters(count);
    }
  }

  async function doGenerateVolumes(volumeCount: number) {
    setGenerating(true);
    onNotice("正在生成卷纲，请稍候...");
    try {
      const result = await api<{ content: string }>("/api/ai/volume-outline", {
        method: "POST",
        body: JSON.stringify({ novelId, volumeCount }),
      });

      try {
        const volumesData = JSON.parse(result.content);
        if (Array.isArray(volumesData)) {
          for (const vol of volumesData) {
            await api(`/api/volumes/${novelId}`, {
              method: "POST",
              body: JSON.stringify(vol),
            });
          }
          onNotice(`已生成 ${volumesData.length} 个卷纲。`);
          await loadVolumes();
        }
      } catch {
        onNotice("AI 生成的内容无法自动解析，请手动创建卷纲。");
        console.log("AI 生成内容:", result.content);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "生成卷纲失败。");
    } finally {
      setGenerating(false);
    }
  }

  async function doGenerateChapters(chapterCount: number) {
    if (!activeVolumeId) {
      onNotice("请先选择一个卷。");
      return;
    }

    setGenerating(true);
    onNotice("正在生成章纲，请稍候...");
    try {
      const result = await api<{ content: string }>("/api/ai/chapter-outline", {
        method: "POST",
        body: JSON.stringify({ novelId, volumeId: activeVolumeId, chapterCount }),
      });

      try {
        const chaptersData = JSON.parse(result.content);
        if (Array.isArray(chaptersData)) {
          for (const chap of chaptersData) {
            await api(`/api/volumes/${activeVolumeId}/chapters`, {
              method: "POST",
              body: JSON.stringify(chap),
            });
          }
          onNotice(`已生成 ${chaptersData.length} 个章纲。`);
          await loadVolumes();
        }
      } catch {
        onNotice("AI 生成的内容无法自动解析，请手动创建章纲。");
        console.log("AI 生成内容:", result.content);
      }
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "生成章纲失败。");
    } finally {
      setGenerating(false);
    }
  }

  function handleEditVolume(vol: Volume) {
    setEditingVolumeId(vol.id);
    setVolumeForm({
      title: vol.title,
      goal: vol.goal,
      conflict: vol.conflict,
      emotion: vol.emotion,
      newChars: vol.newChars,
      mapName: vol.mapName,
      endHook: vol.endHook,
      chapterCount: vol.chapterCount?.toString() || "",
      keyEvents: vol.keyEvents || "",
      turningPoints: vol.turningPoints || "",
    });
    setShowVolumeForm(true);
  }

  function handleEditChapter(chap: ChapterOutline) {
    setEditingChapterId(chap.id);
    setChapterForm({
      title: chap.title,
      goal: chap.goal,
      conflict: chap.conflict,
      emotion: chap.emotion,
      hook: chap.hook,
      foreshadowing: chap.foreshadowing,
      payoff: chap.payoff,
      pleasurePoint: chap.pleasurePoint,
    });
    setShowChapterForm(true);
  }

  function resetVolumeForm() {
    setEditingVolumeId(null);
    setVolumeForm({ title: "", goal: "", conflict: "", emotion: "", newChars: "", mapName: "", endHook: "", chapterCount: "", keyEvents: "", turningPoints: "" });
    setShowVolumeForm(false);
  }

  function resetChapterForm() {
    setEditingChapterId(null);
    setChapterForm({ title: "", goal: "", conflict: "", emotion: "", hook: "", foreshadowing: "", payoff: "", pleasurePoint: "" });
    setShowChapterForm(false);
  }

  function truncate(text: string, max: number) {
    return text.length > max ? text.substring(0, max) + "..." : text;
  }

  function handleExport(type: "volumes" | "chapter-outlines") {
    setShowExportMenu(false);
    window.open(`/api/export/${novelId}/${type}`, "_blank");
  }

  const totalChapters = volumes.reduce((sum, v) => sum + v.chapterOutlines.length, 0);
  const isBusy = loading || generating;

  // 信息字段配置
  const volumeInfoFields = [
    { key: "goal", label: "目标", value: activeVolume?.goal },
    { key: "conflict", label: "冲突", value: activeVolume?.conflict },
    { key: "emotion", label: "情绪", value: activeVolume?.emotion },
    { key: "mapName", label: "地图", value: activeVolume?.mapName },
    { key: "endHook", label: "结尾钩子", value: activeVolume?.endHook },
    { key: "keyEvents", label: "关键事件", value: activeVolume?.keyEvents },
    { key: "turningPoints", label: "转折点", value: activeVolume?.turningPoints },
  ];

  const chapterDetailFields = [
    { key: "goal", label: "目标", value: selectedChapter?.goal },
    { key: "conflict", label: "冲突", value: selectedChapter?.conflict },
    { key: "emotion", label: "情绪", value: selectedChapter?.emotion },
    { key: "pleasurePoint", label: "爽点", value: selectedChapter?.pleasurePoint },
    { key: "hook", label: "钩子", value: selectedChapter?.hook },
    { key: "foreshadowing", label: "埋设伏笔", value: selectedChapter?.foreshadowing },
    { key: "payoff", label: "回收伏笔", value: selectedChapter?.payoff },
  ];

  return (
    <section className="volume-editor-panel">
      <header className="section-header">
        <div>
          <h2>卷纲 / 章纲编辑器</h2>
          <p>分卷规划剧情，每卷包含多个章纲，控制节奏和爽点。</p>
        </div>
        <div className="desk-actions">
          <button type="button" onClick={() => handlePromptGenerate("volume")} disabled={isBusy}>
            {generating ? "生成中..." : "AI 生成卷纲"}
          </button>
          <button type="button" onClick={() => handlePromptGenerate("chapter")} disabled={!activeVolumeId || isBusy}>
            {generating ? "生成中..." : "AI 生成章纲"}
          </button>
          <button type="button" onClick={() => { if (showVolumeForm) { resetVolumeForm(); } else { resetVolumeForm(); setShowVolumeForm(true); } }}>
            {showVolumeForm ? "收起" : "新建卷"}
          </button>
          <button type="button" onClick={() => { if (showChapterForm) { resetChapterForm(); } else { resetChapterForm(); setShowChapterForm(true); } }} disabled={!activeVolumeId}>
            {showChapterForm ? "收起" : "新建章"}
          </button>
          <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowExportMenu(!showExportMenu)} disabled={volumes.length === 0}>
              导出
            </button>
            {showExportMenu && (
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "0.25rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                zIndex: 10,
                minWidth: "120px",
              }}>
                <button
                  type="button"
                  onClick={() => handleExport("volumes")}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  卷纲导出
                </button>
                <button
                  type="button"
                  onClick={() => handleExport("chapter-outlines")}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  章纲导出
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 数量输入提示 */}
      {generatePrompt && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
        }}>
          <span style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
            {generatePrompt.type === "volume" ? "要生成几卷？" : "要生成几个章纲？"}
          </span>
          <input
            type="number"
            min={1}
            max={100}
            value={generatePrompt.count}
            onChange={(e) => setGeneratePrompt({ ...generatePrompt, count: e.target.value })}
            style={{
              width: "5rem",
              padding: "0.375rem 0.5rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              fontSize: "0.875rem",
            }}
          />
          <button
            type="button"
            onClick={handleConfirmGenerate}
            disabled={generating}
            style={{
              padding: "0.375rem 1rem",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            确定
          </button>
          <button
            type="button"
            onClick={() => setGeneratePrompt(null)}
            style={{
              padding: "0.375rem 1rem",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            取消
          </button>
        </div>
      )}

      {/* 统计信息 */}
      <div className="volume-stats">
        <article>
          <strong>{volumes.length}</strong>
          <span>卷</span>
        </article>
        <article>
          <strong>{totalChapters}</strong>
          <span>章纲</span>
        </article>
      </div>

      {/* 卷纲表单 */}
      {showVolumeForm && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
        }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>
            {editingVolumeId ? "编辑卷纲" : "新建卷纲"}
          </h3>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>卷名 *</span>
            <input
              value={volumeForm.title}
              onChange={(e) => setVolumeForm({ ...volumeForm, title: e.target.value })}
              placeholder="例如：第一卷 觉醒篇"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>本卷目标</span>
            <textarea
              value={volumeForm.goal}
              onChange={(e) => setVolumeForm({ ...volumeForm, goal: e.target.value })}
              placeholder="本卷要达成什么目标"
              rows={2}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
            />
          </label>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>主要冲突</span>
            <textarea
              value={volumeForm.conflict}
              onChange={(e) => setVolumeForm({ ...volumeForm, conflict: e.target.value })}
              placeholder="本卷的核心冲突"
              rows={2}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>情绪基调</span>
              <input
                value={volumeForm.emotion}
                onChange={(e) => setVolumeForm({ ...volumeForm, emotion: e.target.value })}
                placeholder="例如：压抑→爆发→爽"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>新地图</span>
              <input
                value={volumeForm.mapName}
                onChange={(e) => setVolumeForm({ ...volumeForm, mapName: e.target.value })}
                placeholder="本卷新出现的地点"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
          </div>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>结尾钩子</span>
            <textarea
              value={volumeForm.endHook}
              onChange={(e) => setVolumeForm({ ...volumeForm, endHook: e.target.value })}
              placeholder="本卷结尾的悬念"
              rows={2}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>预计章数</span>
              <input
                type="number"
                value={volumeForm.chapterCount}
                onChange={(e) => setVolumeForm({ ...volumeForm, chapterCount: e.target.value })}
                placeholder="本卷预计章数"
                min="1"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>关键事件</span>
              <input
                value={volumeForm.keyEvents}
                onChange={(e) => setVolumeForm({ ...volumeForm, keyEvents: e.target.value })}
                placeholder="关键事件列表"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>转折点</span>
              <input
                value={volumeForm.turningPoints}
                onChange={(e) => setVolumeForm({ ...volumeForm, turningPoints: e.target.value })}
                placeholder="重要转折点"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={handleSaveVolume}
              style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "var(--text-inverse)", border: "none", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
            >
              {editingVolumeId ? "更新" : "创建"}
            </button>
            <button
              type="button"
              onClick={resetVolumeForm}
              style={{ padding: "0.5rem 1.25rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 章纲表单 */}
      {showChapterForm && (
        <div style={{
          padding: "1rem",
          marginBottom: "1rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
        }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: "1rem", fontWeight: 600 }}>
            {editingChapterId ? "编辑章纲" : "新建章纲"}
          </h3>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>章节名 *</span>
            <input
              value={chapterForm.title}
              onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
              placeholder="例如：第1章 古玉奇缘"
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>章节目标</span>
              <textarea
                value={chapterForm.goal}
                onChange={(e) => setChapterForm({ ...chapterForm, goal: e.target.value })}
                placeholder="本章要推进什么"
                rows={2}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>冲突</span>
              <textarea
                value={chapterForm.conflict}
                onChange={(e) => setChapterForm({ ...chapterForm, conflict: e.target.value })}
                placeholder="本章的核心冲突"
                rows={2}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
              />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>情绪基调</span>
              <input
                value={chapterForm.emotion}
                onChange={(e) => setChapterForm({ ...chapterForm, emotion: e.target.value })}
                placeholder="例如：紧张、悲伤、爽"
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>爽点设计</span>
              <textarea
                value={chapterForm.pleasurePoint}
                onChange={(e) => setChapterForm({ ...chapterForm, pleasurePoint: e.target.value })}
                placeholder="本章的爽点是什么"
                rows={2}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
              />
            </label>
          </div>
          <label style={{ display: "block", marginBottom: "0.75rem" }}>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>章末钩子</span>
            <textarea
              value={chapterForm.hook}
              onChange={(e) => setChapterForm({ ...chapterForm, hook: e.target.value })}
              placeholder="让读者继续看的悬念"
              rows={2}
              style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>埋设伏笔</span>
              <textarea
                value={chapterForm.foreshadowing}
                onChange={(e) => setChapterForm({ ...chapterForm, foreshadowing: e.target.value })}
                placeholder="本章埋下的伏笔"
                rows={2}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
              />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>回收伏笔</span>
              <textarea
                value={chapterForm.payoff}
                onChange={(e) => setChapterForm({ ...chapterForm, payoff: e.target.value })}
                placeholder="本章回收的伏笔"
                rows={2}
                style={{ width: "100%", padding: "0.5rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "0.875rem", resize: "vertical" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={handleSaveChapter}
              style={{ padding: "0.5rem 1.25rem", background: "var(--accent)", color: "var(--text-inverse)", border: "none", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
            >
              {editingChapterId ? "更新" : "创建"}
            </button>
            <button
              type="button"
              onClick={resetChapterForm}
              style={{ padding: "0.5rem 1.25rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 主布局：左侧卷列表 + 右侧详情 */}
      <div style={{ display: "flex", gap: "1.5rem", minHeight: "50vh" }}>
        {/* 左侧：卷列表侧边栏 */}
        <div style={{
          width: "280px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "0.75rem",
            borderBottom: "1px solid var(--border-default)",
            fontWeight: 600,
            fontSize: "0.875rem",
            color: "var(--text-primary)",
          }}>
            卷列表 ({volumes.length})
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
            {loading ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1rem", textAlign: "center" }}>加载中...</p>
            ) : volumes.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1rem", textAlign: "center" }}>还没有卷纲</p>
            ) : (
              volumes.map((vol) => (
                <article
                  key={vol.id}
                  onClick={() => setActiveVolumeId(vol.id)}
                  style={{
                    padding: "0.75rem",
                    marginBottom: "0.5rem",
                    border: activeVolumeId === vol.id ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    background: activeVolumeId === vol.id ? "var(--accent-muted)" : "var(--bg-surface)",
                    cursor: "pointer",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{vol.title}</strong>
                    <span style={{
                      fontSize: "0.75rem",
                      padding: "0.125rem 0.5rem",
                      background: "var(--accent-muted)",
                      color: "var(--accent)",
                      borderRadius: "var(--radius-full)",
                    }}>
                      {vol.chapterOutlines.length} 章
                    </span>
                  </div>
                  {vol.goal && (
                    <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.25rem 0 0", lineHeight: 1.4 }}>
                      {truncate(vol.goal, 60)}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleEditVolume(vol); }}
                      style={{ fontSize: "0.75rem", padding: "0.125rem 0.5rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); requestDeleteVolume(vol.id); }}
                      style={{ fontSize: "0.75rem", padding: "0.125rem 0.5rem", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                    >
                      删除
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        {/* 右侧：卷详情 + 章纲列表 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!activeVolume ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
            }}>
              {volumes.length === 0 ? "点击「新建卷」开始规划" : "选择一个卷查看详情"}
            </div>
          ) : (
            <>
              {/* 卷详情面板 */}
              <div style={{
                padding: "1rem",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                marginBottom: "1rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>{activeVolume.title}</h3>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={() => handleEditVolume(activeVolume)}
                      style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDeleteVolume(activeVolume.id)}
                      style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem 1.5rem" }}>
                  {volumeInfoFields.filter((f) => f.value).map((f) => (
                    <div key={f.key} style={{ display: "flex", gap: "0.5rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                      <span style={{ color: "var(--accent)", fontWeight: 500, flexShrink: 0, minWidth: "3.5rem" }}>{f.label}</span>
                      <span style={{ color: "var(--text-primary)" }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 章纲列表标题 */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                  章纲列表 ({activeVolume.chapterOutlines.length})
                </h4>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => handlePromptGenerate("chapter")}
                    disabled={isBusy}
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.25rem 0.75rem",
                      background: "var(--accent)",
                      color: "var(--text-inverse)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    {generating ? "生成中..." : "AI 生成章纲"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { resetChapterForm(); setShowChapterForm(true); }}
                    style={{
                      fontSize: "0.8125rem",
                      padding: "0.25rem 0.75rem",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}
                  >
                    新建章
                  </button>
                </div>
              </div>

              {/* 章纲列表 */}
              {activeVolume.chapterOutlines.length === 0 ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "3rem 1.5rem",
                  color: "var(--text-muted)",
                  textAlign: "center",
                  border: "1px dashed var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                }}>
                  <p style={{ marginBottom: "1rem", fontSize: "0.9375rem" }}>本卷还没有章纲</p>
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button
                      type="button"
                      onClick={() => handlePromptGenerate("chapter")}
                      disabled={isBusy}
                      style={{
                        padding: "0.5rem 1.25rem",
                        background: "var(--accent)",
                        color: "var(--text-inverse)",
                        border: "none",
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      {generating ? "生成中..." : "AI 生成章纲"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { resetChapterForm(); setShowChapterForm(true); }}
                      style={{
                        padding: "0.5rem 1.25rem",
                        background: "var(--bg-elevated)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "0.875rem",
                        cursor: "pointer",
                      }}
                    >
                      手动新建
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {activeVolume.chapterOutlines.map((chap) => (
                    <article
                      key={chap.id}
                      onClick={() => { setSelectedChapter(chap); setShowChapterDetail(true); }}
                      style={{
                        padding: "0.75rem 1rem",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--bg-surface)",
                        cursor: "pointer",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "1.5rem",
                          height: "1.5rem",
                          background: "var(--accent-muted)",
                          color: "var(--accent)",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          {chap.sortOrder}
                        </span>
                        <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{chap.title}</strong>
                      </div>
                      {chap.goal && (
                        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
                          目标：{truncate(chap.goal, 80)}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 章纲详情 Modal */}
      {selectedChapter && (
        <Modal
          open={showChapterDetail}
          onClose={() => setShowChapterDetail(false)}
          title={selectedChapter.title}
          width="600px"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>第 {selectedChapter.sortOrder} 章</span>
            </div>
            {chapterDetailFields.filter((f) => f.value).map((f) => (
              <div key={f.key}>
                <strong style={{ color: "var(--accent)", fontSize: "0.8125rem", display: "block", marginBottom: "0.25rem" }}>{f.label}</strong>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{f.value}</p>
              </div>
            ))}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-default)" }}>
              <button
                type="button"
                onClick={() => { setShowChapterDetail(false); handleEditChapter(selectedChapter); }}
                style={{ padding: "0.5rem 1rem", background: "var(--accent)", color: "var(--text-inverse)", border: "none", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => { setShowChapterDetail(false); requestDeleteChapter(selectedChapter.id); }}
                style={{ padding: "0.5rem 1rem", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.875rem", cursor: "pointer" }}
              >
                删除
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmText="确认"
          cancelText="取消"
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
          variant="danger"
        />
      )}
    </section>
  );
}

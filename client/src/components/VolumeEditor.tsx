import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ConfirmDialog } from "./ui/CommonComponents";

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
      
      // 尝试解析并创建卷纲
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
      
      // 尝试解析并创建章纲
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

  const totalChapters = volumes.reduce((sum, v) => sum + v.chapterOutlines.length, 0);
  const isBusy = loading || generating;

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
          <button type="button" onClick={() => setShowVolumeForm(!showVolumeForm)}>
            {showVolumeForm ? "收起" : "新建卷"}
          </button>
          <button type="button" onClick={() => setShowChapterForm(!showChapterForm)} disabled={!activeVolumeId}>
            {showChapterForm ? "收起" : "新建章"}
          </button>
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
        <div className="volume-form">
          <h3>{editingVolumeId ? "编辑卷纲" : "新建卷纲"}</h3>
          <label>
            <span>卷名 *</span>
            <input
              value={volumeForm.title}
              onChange={(e) => setVolumeForm({ ...volumeForm, title: e.target.value })}
              placeholder="例如：第一卷 觉醒篇"
            />
          </label>
          <label>
            <span>本卷目标</span>
            <textarea
              value={volumeForm.goal}
              onChange={(e) => setVolumeForm({ ...volumeForm, goal: e.target.value })}
              placeholder="本卷要达成什么目标"
            />
          </label>
          <label>
            <span>主要冲突</span>
            <textarea
              value={volumeForm.conflict}
              onChange={(e) => setVolumeForm({ ...volumeForm, conflict: e.target.value })}
              placeholder="本卷的核心冲突"
            />
          </label>
          <label>
            <span>情绪基调</span>
            <input
              value={volumeForm.emotion}
              onChange={(e) => setVolumeForm({ ...volumeForm, emotion: e.target.value })}
              placeholder="例如：压抑→爆发→爽"
            />
          </label>
          <label>
            <span>新地图</span>
            <input
              value={volumeForm.mapName}
              onChange={(e) => setVolumeForm({ ...volumeForm, mapName: e.target.value })}
              placeholder="本卷新出现的地点"
            />
          </label>
          <label>
            <span>结尾钩子</span>
            <textarea
              value={volumeForm.endHook}
              onChange={(e) => setVolumeForm({ ...volumeForm, endHook: e.target.value })}
              placeholder="本卷结尾的悬念"
            />
          </label>
          <label>
            <span>预计章数</span>
            <input
              type="number"
              value={volumeForm.chapterCount}
              onChange={(e) => setVolumeForm({ ...volumeForm, chapterCount: e.target.value })}
              placeholder="本卷预计章数"
              min="1"
            />
          </label>
          <label>
            <span>关键事件</span>
            <textarea
              value={volumeForm.keyEvents}
              onChange={(e) => setVolumeForm({ ...volumeForm, keyEvents: e.target.value })}
              placeholder="本卷的关键事件列表"
            />
          </label>
          <label>
            <span>转折点</span>
            <textarea
              value={volumeForm.turningPoints}
              onChange={(e) => setVolumeForm({ ...volumeForm, turningPoints: e.target.value })}
              placeholder="本卷的重要转折点"
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" type="button" onClick={handleSaveVolume}>
              {editingVolumeId ? "更新" : "创建"}
            </button>
            <button type="button" onClick={resetVolumeForm}>取消</button>
          </div>
        </div>
      )}

      {/* 章纲表单 */}
      {showChapterForm && (
        <div className="chapter-form">
          <h3>{editingChapterId ? "编辑章纲" : "新建章纲"}</h3>
          <label>
            <span>章节名 *</span>
            <input
              value={chapterForm.title}
              onChange={(e) => setChapterForm({ ...chapterForm, title: e.target.value })}
              placeholder="例如：第1章 古玉奇缘"
            />
          </label>
          <label>
            <span>章节目标</span>
            <textarea
              value={chapterForm.goal}
              onChange={(e) => setChapterForm({ ...chapterForm, goal: e.target.value })}
              placeholder="本章要推进什么"
            />
          </label>
          <label>
            <span>冲突</span>
            <textarea
              value={chapterForm.conflict}
              onChange={(e) => setChapterForm({ ...chapterForm, conflict: e.target.value })}
              placeholder="本章的核心冲突"
            />
          </label>
          <label>
            <span>情绪基调</span>
            <input
              value={chapterForm.emotion}
              onChange={(e) => setChapterForm({ ...chapterForm, emotion: e.target.value })}
              placeholder="例如：紧张、悲伤、爽"
            />
          </label>
          <label>
            <span>爽点设计</span>
            <textarea
              value={chapterForm.pleasurePoint}
              onChange={(e) => setChapterForm({ ...chapterForm, pleasurePoint: e.target.value })}
              placeholder="本章的爽点是什么"
            />
          </label>
          <label>
            <span>章末钩子</span>
            <textarea
              value={chapterForm.hook}
              onChange={(e) => setChapterForm({ ...chapterForm, hook: e.target.value })}
              placeholder="让读者继续看的悬念"
            />
          </label>
          <label>
            <span>埋设伏笔</span>
            <textarea
              value={chapterForm.foreshadowing}
              onChange={(e) => setChapterForm({ ...chapterForm, foreshadowing: e.target.value })}
              placeholder="本章埋下的伏笔"
            />
          </label>
          <label>
            <span>回收伏笔</span>
            <textarea
              value={chapterForm.payoff}
              onChange={(e) => setChapterForm({ ...chapterForm, payoff: e.target.value })}
              placeholder="本章回收的伏笔"
            />
          </label>
          <div className="form-actions">
            <button className="primary-button" type="button" onClick={handleSaveChapter}>
              {editingChapterId ? "更新" : "创建"}
            </button>
            <button type="button" onClick={resetChapterForm}>取消</button>
          </div>
        </div>
      )}

      {/* 卷纲列表 */}
      <div className="volume-layout">
        <div className="volume-list">
          <h3>卷列表</h3>
          {loading ? (
            <p className="empty-note">加载中...</p>
          ) : volumes.length === 0 ? (
            <p className="empty-note">还没有卷纲。点击"新建卷"开始规划。</p>
          ) : (
            volumes.map((vol) => (
              <article
                key={vol.id}
                className={`volume-card ${activeVolumeId === vol.id ? "active" : ""}`}
                onClick={() => setActiveVolumeId(vol.id)}
              >
                <header>
                  <strong>{vol.title}</strong>
                  <span>{vol.chapterOutlines.length} 章</span>
                </header>
                {vol.goal && <p className="vol-goal">{vol.goal}</p>}
                {vol.mapName && <p className="vol-map">📍 {vol.mapName}</p>}
                {vol.chapterCount && <p className="vol-chapter-count">预计章数: {vol.chapterCount}</p>}
                {vol.keyEvents && <p className="vol-key-events" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>关键事件: {vol.keyEvents.substring(0, 50)}{vol.keyEvents.length > 50 ? "..." : ""}</p>}
                {vol.turningPoints && <p className="vol-turning-points" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>转折点: {vol.turningPoints.substring(0, 50)}{vol.turningPoints.length > 50 ? "..." : ""}</p>}
                <div className="card-actions">
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleEditVolume(vol); }}>编辑</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); requestDeleteVolume(vol.id); }}>删除</button>
                </div>
              </article>
            ))
          )}
        </div>

        {/* 章纲列表 */}
        <div className="chapter-list-panel">
          <h3>{activeVolume ? `${activeVolume.title} - 章纲` : "选择一个卷查看章纲"}</h3>
          {activeVolume && activeVolume.chapterOutlines.length === 0 && (
            <p className="empty-note">本卷还没有章纲。点击"新建章"添加。</p>
          )}
          {activeVolume && activeVolume.chapterOutlines.map((chap) => (
            <article key={chap.id} className="chapter-outline-card">
              <header>
                <span className="chapter-order">{chap.sortOrder}</span>
                <strong>{chap.title}</strong>
              </header>
              {chap.goal && <p className="chap-field"><span>目标：</span>{chap.goal}</p>}
              {chap.conflict && <p className="chap-field"><span>冲突：</span>{chap.conflict}</p>}
              {chap.emotion && <p className="chap-field"><span>情绪：</span>{chap.emotion}</p>}
              {chap.pleasurePoint && <p className="chap-field"><span>爽点：</span>{chap.pleasurePoint}</p>}
              {chap.hook && <p className="chap-field"><span>钩子：</span>{chap.hook}</p>}
              <div className="card-actions">
                <button type="button" onClick={() => handleEditChapter(chap)}>编辑</button>
                <button type="button" onClick={() => requestDeleteChapter(chap.id)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      </div>

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

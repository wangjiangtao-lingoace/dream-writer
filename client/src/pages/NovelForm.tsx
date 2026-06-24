import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";
import PipelineConfigModal, { PipelineConfig } from "../components/PipelineConfigModal";

interface CharacterCard {
  name: string;
  role: string;
  identity: string;
  motivation: string;
  appearance: string;
  background: string;
  personality: string;
  abilities: string;
  relationsText: string;
}

interface WorldviewData {
  name: string;
  summary: string;
  rules: string;
  powerSystem: string;
  geography: string;
  factions: string;
  history: string;
}

const STEPS = [
  { key: "basic", label: "基本信息" },
  { key: "characters", label: "人物卡片" },
  { key: "worldview", label: "世界观" },
  { key: "chapters", label: "已有章节" },
  { key: "config", label: "流水线配置" },
];

const emptyCharacter: CharacterCard = {
  name: "", role: "", identity: "", motivation: "",
  appearance: "", background: "", personality: "", abilities: "", relationsText: "",
};

const NovelForm: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  // Step 1: Basic info
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>("");

  // 7 层 Prompt 架构新增字段
  const [coreSellingPoint, setCoreSellingPoint] = useState("");
  const [corePayoffs, setCorePayoffs] = useState<string[]>([]);
  const [coreConflict, setCoreConflict] = useState("");
  const [readerExpectations, setReaderExpectations] = useState<string[]>([]);

  // 爽点和读者期待的临时输入
  const [payoffInput, setPayoffInput] = useState("");
  const [expectationInput, setExpectationInput] = useState("");

  // Step 2: Characters
  const [characters, setCharacters] = useState<CharacterCard[]>([{ ...emptyCharacter }]);

  // Step 3: Worldview
  const [worldview, setWorldview] = useState<WorldviewData>({
    name: "", summary: "", rules: "", powerSystem: "", geography: "", factions: "", history: "",
  });

  // Step 4: Existing chapters
  const [existingChapters, setExistingChapters] = useState("");
  const [continuationMode, setContinuationMode] = useState<"continue" | "rewrite">("continue");

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const addCharacter = () => setCharacters([...characters, { ...emptyCharacter }]);
  const removeCharacter = (idx: number) => {
    if (characters.length <= 1) return;
    setCharacters(characters.filter((_, i) => i !== idx));
  };
  const updateCharacter = (idx: number, field: keyof CharacterCard, value: string) => {
    const updated = [...characters];
    updated[idx] = { ...updated[idx], [field]: value };
    setCharacters(updated);
  };

  const canProceed = (): boolean => {
    if (step === 0) return title.trim().length > 0 && genre.length > 0;
    if (step === 1) return characters.some(c => c.name.trim().length > 0);
    if (step === 2) return worldview.summary.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) {
      if (step === 0) toast.error("请填写作品标题和类型");
      if (step === 1) toast.error("至少需要一个人物卡片");
      if (step === 2) toast.error("请填写世界观概述");
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = () => {
    setConfigModalOpen(true);
  };

  const handleConfigConfirm = async (config: PipelineConfig) => {
    setConfigModalOpen(false);
    setCreating(true);
    try {
      // 1. Create novel
      const novel = await api.post<{ id: string }>("/api/novels", {
        title, genre, synopsis,
        inspiration: existingChapters || undefined,
      });

      if (!novel?.id) throw new Error("创建作品失败");

      // 1.1 Update novel with 7-layer prompt fields
      await api.put(`/api/novels/${novel.id}`, {
        coreSellingPoint: coreSellingPoint || undefined,
        corePayoffs: corePayoffs.length > 0 ? JSON.stringify(corePayoffs) : undefined,
        coreConflict: coreConflict || undefined,
        readerExpectations: readerExpectations.length > 0 ? JSON.stringify(readerExpectations) : undefined,
      });

      // 2. Upload cover if provided
      if (coverFile) {
        const formDataUpload = new FormData();
        formDataUpload.append("cover", coverFile);
        await fetch(`/api/upload/cover?novelId=${novel.id}`, {
          method: "POST", body: formDataUpload,
        }).catch(() => {});
      }

      // 3. Batch create characters
      const validCharacters = characters.filter(c => c.name.trim());
      if (validCharacters.length > 0) {
        await api.post(`/api/characters/bulk/${novel.id}`, validCharacters);
      }

      // 4. Create worldview
      if (worldview.summary.trim()) {
        await api.post("/api/worldviews", { ...worldview, novelId: novel.id });
      }

      // 5. Create existing chapters if provided
      if (existingChapters.trim()) {
        const chapterParts = existingChapters.split(/(?=^第[一二三四五六七八九十百千\d]+[章回])/m).filter(s => s.trim());
        if (chapterParts.length > 0) {
          for (let i = 0; i < chapterParts.length; i++) {
            const part = chapterParts[i].trim();
            const titleMatch = part.match(/^(第[一二三四五六七八九十百千\d]+[章回]\s*.+?)[\n\r]/);
            const chTitle = titleMatch ? titleMatch[1].trim() : `第${i + 1}章`;
            const content = titleMatch ? part.slice(titleMatch[0].length).trim() : part;
            try {
              const ch = await api.post<{ id: string }>(`/api/novels/${novel.id}/chapters`, {
                title: chTitle, order: i + 1,
              });
              if (ch?.id && content) {
                await api.put(`/api/novels/${novel.id}/chapters/${ch.id}`, { content });
              }
            } catch {}
          }
        }
      }

      // 6. Start pipeline
      const hasExistingChapters = existingChapters.trim().length > 0;
      try {
        await api.post("/api/pipeline/start", {
          novelId: novel.id,
          config: {
            mode: "create",
            sourceType: hasExistingChapters ? "content" : "idea",
            inputMode: "structured",
            continuationMode: hasExistingChapters ? continuationMode : undefined,
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

      toast.success("作品创建成功");
      navigate(`/novel/${novel.id}`);
    } catch (error) {
      console.error("创建作品失败:", error);
      toast.error("创建作品失败，请重试");
    } finally {
      setCreating(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.75rem 1rem",
    background: "var(--bg-primary)", border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)", color: "var(--text-primary)",
    fontSize: "0.875rem", outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "0.875rem", fontWeight: 500,
    color: "var(--text-primary)", marginBottom: "0.5rem",
  };
  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border)", padding: "1.5rem", marginBottom: "1rem",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: "1rem",
        padding: "1rem 2rem", borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
      }}>
        <button onClick={() => navigate("/create")} style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.5rem 1rem", background: "transparent",
          color: "var(--text-secondary)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)", fontSize: "0.875rem", cursor: "pointer",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回
        </button>
        <h1 style={{ fontSize: "1.25rem", color: "var(--text-primary)" }}>创建新作品</h1>
      </header>

      {/* Step indicator */}
      <div style={{
        display: "flex", justifyContent: "center", gap: "0.5rem",
        padding: "1.5rem 2rem 0",
      }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
          }}>
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 600,
              background: i <= step ? "var(--accent)" : "var(--bg-elevated)",
              color: i <= step ? "#fff" : "var(--text-muted)",
            }}>{i + 1}</div>
            <span style={{
              fontSize: "0.8125rem", fontWeight: i === step ? 600 : 400,
              color: i === step ? "var(--text-primary)" : "var(--text-muted)",
            }}>{s.label}</span>
            {i < STEPS.length - 1 && (
              <div style={{ width: "32px", height: "1px", background: "var(--border)", margin: "0 0.25rem" }} />
            )}
          </div>
        ))}
      </div>

      {/* Content */}
      <main style={{ maxWidth: "800px", margin: "1.5rem auto", padding: "0 2rem 2rem" }}>

        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div style={cardStyle}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>作品标题 *</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="请输入作品标题" maxLength={50} style={inputStyle} />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>作品类型 *</label>
              <select value={genre} onChange={e => setGenre(e.target.value)} style={inputStyle}>
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
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>作品简介</label>
              <textarea value={synopsis} onChange={e => setSynopsis(e.target.value)}
                placeholder="简要描述你的故事背景和核心设定..." rows={4}
                style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div>
              <label style={labelStyle}>封面</label>
              <div onClick={() => document.getElementById("cover-input")?.click()} style={{
                width: "160px", height: "220px", borderRadius: "var(--radius-md)",
                border: "2px dashed var(--border)", background: "var(--bg-primary)",
                cursor: "pointer", overflow: "hidden", display: "grid", placeItems: "center",
              }}>
                {coverPreview ? (
                  <img src={coverPreview} alt="封面" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>点击上传</span>
                )}
              </div>
              <input id="cover-input" type="file" accept="image/*" onChange={handleCoverChange} style={{ display: "none" }} />
            </div>

            {/* 7 层 Prompt 架构新增字段 */}
            <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
              <h3 style={{ fontSize: "0.875rem", color: "var(--text-primary)", marginBottom: "1rem", fontWeight: 600 }}>
                核心卖点配置（决定 AI 能否抓住本书精髓）
              </h3>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>核心卖点</label>
                <textarea value={coreSellingPoint} onChange={e => setCoreSellingPoint(e.target.value)}
                  placeholder="例：老祖阴间打工，后代阳间享福" rows={2}
                  style={{ ...inputStyle, resize: "vertical" }} />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  一句话概括本书最大的吸引力
                </p>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>核心爽点</label>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input value={payoffInput} onChange={e => setPayoffInput(e.target.value)}
                    placeholder="输入爽点后回车添加" style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && payoffInput.trim()) {
                        e.preventDefault();
                        if (!corePayoffs.includes(payoffInput.trim())) {
                          setCorePayoffs([...corePayoffs, payoffInput.trim()]);
                        }
                        setPayoffInput("");
                      }
                    }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {corePayoffs.map((p, i) => (
                    <span key={i} style={{
                      padding: "0.25rem 0.75rem", fontSize: "0.75rem",
                      background: "var(--bg-secondary)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "0.25rem",
                    }}>
                      {p}
                      <button onClick={() => setCorePayoffs(corePayoffs.filter((_, idx) => idx !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  读者追更的核心动力（如：打脸、逆袭、升级、甜宠）
                </p>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>核心矛盾</label>
                <textarea value={coreConflict} onChange={e => setCoreConflict(e.target.value)}
                  placeholder="例：阴间资源不足，祖宗竞争激烈" rows={2}
                  style={{ ...inputStyle, resize: "vertical" }} />
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  推动剧情前进的核心冲突
                </p>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>读者期待</label>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <input value={expectationInput} onChange={e => setExpectationInput(e.target.value)}
                    placeholder="输入读者期待后回车添加" style={{ ...inputStyle, flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && expectationInput.trim()) {
                        e.preventDefault();
                        if (!readerExpectations.includes(expectationInput.trim())) {
                          setReaderExpectations([...readerExpectations, expectationInput.trim()]);
                        }
                        setExpectationInput("");
                      }
                    }} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {readerExpectations.map((exp, i) => (
                    <span key={i} style={{
                      padding: "0.25rem 0.75rem", fontSize: "0.75rem",
                      background: "var(--bg-secondary)", border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", gap: "0.25rem",
                    }}>
                      {exp}
                      <button onClick={() => setReaderExpectations(readerExpectations.filter((_, idx) => idx !== i))}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                  读者打开这本书想看什么（如：看老祖爆金币、看主角捡好处）
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Characters */}
        {step === 1 && (
          <div>
            {characters.map((char, idx) => (
              <div key={idx} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", margin: 0 }}>
                    人物 {idx + 1}
                  </h3>
                  {characters.length > 1 && (
                    <button onClick={() => removeCharacter(idx)} style={{
                      padding: "0.25rem 0.75rem", fontSize: "0.75rem",
                      background: "transparent", color: "var(--text-muted)",
                      border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                    }}>删除</button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={labelStyle}>姓名 *</label>
                    <input value={char.name} onChange={e => updateCharacter(idx, "name", e.target.value)}
                      placeholder="人物姓名" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>角色定位</label>
                    <input value={char.role} onChange={e => updateCharacter(idx, "role", e.target.value)}
                      placeholder="主角/配角/反派等" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>身份</label>
                    <input value={char.identity} onChange={e => updateCharacter(idx, "identity", e.target.value)}
                      placeholder="身份描述" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>动机/目标</label>
                    <input value={char.motivation} onChange={e => updateCharacter(idx, "motivation", e.target.value)}
                      placeholder="核心动机" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={labelStyle}>性格特点</label>
                  <textarea value={char.personality} onChange={e => updateCharacter(idx, "personality", e.target.value)}
                    placeholder="性格特征描述..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={labelStyle}>外貌特征</label>
                  <textarea value={char.appearance} onChange={e => updateCharacter(idx, "appearance", e.target.value)}
                    placeholder="外貌描述..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={labelStyle}>背景故事</label>
                  <textarea value={char.background} onChange={e => updateCharacter(idx, "background", e.target.value)}
                    placeholder="人物背景..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ marginTop: "1rem" }}>
                  <label style={labelStyle}>人物关系</label>
                  <textarea value={char.relationsText} onChange={e => updateCharacter(idx, "relationsText", e.target.value)}
                    placeholder="与其他人物的关系..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>
            ))}
            <button onClick={addCharacter} style={{
              width: "100%", padding: "0.75rem", fontSize: "0.875rem",
              background: "transparent", color: "var(--accent)",
              border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)",
              cursor: "pointer",
            }}>+ 添加人物</button>
          </div>
        )}

        {/* Step 2: Worldview */}
        {step === 2 && (
          <div style={cardStyle}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>世界观名称</label>
              <input value={worldview.name} onChange={e => setWorldview({ ...worldview, name: e.target.value })}
                placeholder="如：九州大陆、赛博朋克2077等" style={inputStyle} />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>世界概述 *</label>
              <textarea value={worldview.summary} onChange={e => setWorldview({ ...worldview, summary: e.target.value })}
                placeholder="描述这个世界的基本面貌..." rows={4} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>世界规则</label>
              <textarea value={worldview.rules} onChange={e => setWorldview({ ...worldview, rules: e.target.value })}
                placeholder="这个世界的运行规则..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <div>
                <label style={labelStyle}>力量体系</label>
                <textarea value={worldview.powerSystem} onChange={e => setWorldview({ ...worldview, powerSystem: e.target.value })}
                  placeholder="修炼/力量等级体系..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div>
                <label style={labelStyle}>地理环境</label>
                <textarea value={worldview.geography} onChange={e => setWorldview({ ...worldview, geography: e.target.value })}
                  placeholder="主要地理环境..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={labelStyle}>势力分布</label>
                <textarea value={worldview.factions} onChange={e => setWorldview({ ...worldview, factions: e.target.value })}
                  placeholder="主要势力/组织..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
              <div>
                <label style={labelStyle}>历史背景</label>
                <textarea value={worldview.history} onChange={e => setWorldview({ ...worldview, history: e.target.value })}
                  placeholder="世界历史背景..." rows={3} style={{ ...inputStyle, resize: "vertical" }} />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Existing Chapters */}
        {step === 3 && (
          <div style={cardStyle}>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={labelStyle}>已有章节内容（选填）</label>
              <textarea value={existingChapters} onChange={e => setExistingChapters(e.target.value)}
                placeholder={"粘贴已有章节内容...\n\n支持格式：\n第一章 标题\n正文内容...\n\n第二章 标题\n正文内容..."}
                rows={15} style={{ ...inputStyle, resize: "vertical", minHeight: "300px" }} />
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
                如有已写好的章节，可在此粘入。系统会分析你的写作风格，后续生成的章节将匹配你的文风。
              </p>
            </div>
            {existingChapters.trim() && (
              <div>
                <label style={labelStyle}>已有章节处理方式</label>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <label style={{
                    flex: 1, padding: "1rem", borderRadius: "var(--radius-md)",
                    border: `2px solid ${continuationMode === "continue" ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer", background: continuationMode === "continue" ? "var(--accent-muted)" : "transparent",
                  }}>
                    <input type="radio" name="continuationMode" value="continue"
                      checked={continuationMode === "continue"} onChange={() => setContinuationMode("continue")}
                      style={{ display: "none" }} />
                    <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--text-primary)" }}>续写</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      保留已有章节原文，从最后一章继续写下去
                    </div>
                  </label>
                  <label style={{
                    flex: 1, padding: "1rem", borderRadius: "var(--radius-md)",
                    border: `2px solid ${continuationMode === "rewrite" ? "var(--accent)" : "var(--border)"}`,
                    cursor: "pointer", background: continuationMode === "rewrite" ? "var(--accent-muted)" : "transparent",
                  }}>
                    <input type="radio" name="continuationMode" value="rewrite"
                      checked={continuationMode === "rewrite"} onChange={() => setContinuationMode("rewrite")}
                      style={{ display: "none" }} />
                    <div style={{ fontWeight: 600, marginBottom: "0.25rem", color: "var(--text-primary)" }}>重写</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      分析你的风格后，用 AI 重新生成所有章节
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Config (just a summary + submit button) */}
        {step === 4 && (
          <div style={cardStyle}>
            <h3 style={{ fontSize: "1rem", color: "var(--text-primary)", marginBottom: "1rem" }}>确认创建信息</h3>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 2 }}>
              <div><strong>标题：</strong>{title}</div>
              <div><strong>类型：</strong>{genre}</div>
              {synopsis && <div><strong>简介：</strong>{synopsis.slice(0, 100)}{synopsis.length > 100 ? "..." : ""}</div>}
              <div><strong>人物：</strong>{characters.filter(c => c.name.trim()).map(c => c.name).join("、")}</div>
              <div><strong>世界观：</strong>{worldview.name || "未命名"} — {worldview.summary.slice(0, 60)}...</div>
              {existingChapters.trim() && (
                <div><strong>已有章节：</strong>已填入，处理方式：{continuationMode === "continue" ? "续写" : "重写"}</div>
              )}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1rem" }}>
              点击"开始创作"后，将打开流水线配置面板，确认后 AI 将基于你的人物和世界观生成详细大纲。
            </p>
          </div>
        )}

        {/* Navigation buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem" }}>
          {step > 0 ? (
            <button onClick={handleBack} style={{
              padding: "0.75rem 1.5rem", fontSize: "0.875rem",
              background: "transparent", color: "var(--text-secondary)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
              cursor: "pointer",
            }}>上一步</button>
          ) : <div />}
          {step < STEPS.length - 1 ? (
            <button onClick={handleNext} style={{
              padding: "0.75rem 2rem", fontSize: "0.875rem",
              background: canProceed() ? "var(--accent)" : "var(--text-muted)",
              color: "#fff", border: "none", borderRadius: "var(--radius-md)",
              cursor: canProceed() ? "pointer" : "not-allowed",
            }}>下一步</button>
          ) : (
            <button onClick={handleSubmit} disabled={creating} style={{
              padding: "0.75rem 2rem", fontSize: "0.875rem",
              background: creating ? "var(--text-muted)" : "var(--accent)",
              color: "#fff", border: "none", borderRadius: "var(--radius-md)",
              cursor: creating ? "not-allowed" : "pointer",
            }}>
              {creating ? "创建中..." : "开始创作"}
            </button>
          )}
        </div>
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

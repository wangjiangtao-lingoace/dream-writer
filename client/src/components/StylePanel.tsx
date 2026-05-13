import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface StyleProfile {
  id: string;
  novelId: string;
  name: string;
  description: string;
  narrativePov: string;
  tense: string;
  pacing: string;
  sentenceLength: string;
  vocabulary: string;
  dialogueRatio: string;
  emotionIntensity: string;
  humorLevel: string;
  avoidAIWords: boolean;
  useShortSentences: boolean;
  useDialogue: boolean;
  useSensoryDetail: boolean;
  customRules: string[];
  isDefault: boolean;
}

interface StylePanelProps {
  novelId: string;
  onNotice: (msg: string) => void;
}

export default function StylePanel({ novelId, onNotice }: StylePanelProps) {
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showExtractForm, setShowExtractForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testContent, setTestContent] = useState("");
  const [testResult, setTestResult] = useState("");
  const [extractText, setExtractText] = useState("");
  const [extractedStyle, setExtractedStyle] = useState<Partial<StyleProfile> | null>(null);

  const [form, setForm] = useState({
    name: "默认风格",
    description: "",
    narrativePov: "third_person",
    tense: "past",
    pacing: "balanced",
    sentenceLength: "mixed",
    vocabulary: "modern",
    dialogueRatio: "balanced",
    emotionIntensity: "medium",
    humorLevel: "low",
    avoidAIWords: true,
    useShortSentences: true,
    useDialogue: true,
    useSensoryDetail: true,
    customRules: [] as string[],
    isDefault: true,
  });

  async function loadProfiles() {
    setLoading(true);
    try {
      const list = await api<StyleProfile[]>(`/api/styles/${novelId}`);
      setProfiles(list);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "加载风格配置失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, [novelId]);

  async function handleSave() {
    if (!form.name.trim()) {
      onNotice("风格名称不能为空。");
      return;
    }
    try {
      if (editingId) {
        await api(`/api/styles/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(form),
        });
        onNotice("风格配置已更新。");
      } else {
        await api(`/api/styles/${novelId}`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        onNotice("风格配置已创建。");
      }
      resetForm();
      await loadProfiles();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存风格配置失败。");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此风格配置？")) return;
    try {
      await api(`/api/styles/${id}`, { method: "DELETE" });
      onNotice("风格配置已删除。");
      await loadProfiles();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除风格配置失败。");
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await api(`/api/styles/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isDefault: true }),
      });
      onNotice("已设为默认风格。");
      await loadProfiles();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "设置默认风格失败。");
    }
  }

  async function handleTestRemoveAISmell() {
    if (!testContent.trim()) {
      onNotice("请输入要测试的内容。");
      return;
    }
    try {
      const result = await api<{ content: string }>(`/api/styles/${novelId}/remove-ai-smell`, {
        method: "POST",
        body: JSON.stringify({ content: testContent }),
      });
      setTestResult(result.content);
      onNotice("去 AI 味处理完成。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "处理失败。");
    }
  }

  async function handleExtractStyle() {
    if (!extractText.trim()) {
      onNotice("请输入要学习风格的文本。");
      return;
    }
    if (extractText.trim().length < 100) {
      onNotice("文本长度不足，请输入至少100字的文本。");
      return;
    }
    try {
      setExtracting(true);
      const result = await api<Partial<StyleProfile>>("/api/ai/extract-style", {
        method: "POST",
        body: JSON.stringify({ text: extractText, novelId }),
      });
      setExtractedStyle(result);
      onNotice("风格学习完成，请查看提取结果。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "风格学习失败。");
    } finally {
      setExtracting(false);
    }
  }

  function handleApplyExtractedStyle() {
    if (!extractedStyle) return;
    setForm({
      name: extractedStyle.name || "从文本学习的风格",
      description: extractedStyle.description || "",
      narrativePov: extractedStyle.narrativePov || "third_person",
      tense: extractedStyle.tense || "past",
      pacing: extractedStyle.pacing || "balanced",
      sentenceLength: extractedStyle.sentenceLength || "mixed",
      vocabulary: extractedStyle.vocabulary || "modern",
      dialogueRatio: extractedStyle.dialogueRatio || "balanced",
      emotionIntensity: extractedStyle.emotionIntensity || "medium",
      humorLevel: extractedStyle.humorLevel || "low",
      avoidAIWords: extractedStyle.avoidAIWords ?? true,
      useShortSentences: extractedStyle.useShortSentences ?? true,
      useDialogue: extractedStyle.useDialogue ?? true,
      useSensoryDetail: extractedStyle.useSensoryDetail ?? true,
      customRules: extractedStyle.customRules || [],
      isDefault: false,
    });
    setShowForm(true);
    setShowExtractForm(false);
    setExtractedStyle(null);
    onNotice("已将提取的风格应用到表单，请检查并保存。");
  }

  function handleEdit(profile: StyleProfile) {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      description: profile.description,
      narrativePov: profile.narrativePov,
      tense: profile.tense,
      pacing: profile.pacing,
      sentenceLength: profile.sentenceLength,
      vocabulary: profile.vocabulary,
      dialogueRatio: profile.dialogueRatio,
      emotionIntensity: profile.emotionIntensity,
      humorLevel: profile.humorLevel,
      avoidAIWords: profile.avoidAIWords,
      useShortSentences: profile.useShortSentences,
      useDialogue: profile.useDialogue,
      useSensoryDetail: profile.useSensoryDetail,
      customRules: profile.customRules,
      isDefault: profile.isDefault,
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      name: "默认风格",
      description: "",
      narrativePov: "third_person",
      tense: "past",
      pacing: "balanced",
      sentenceLength: "mixed",
      vocabulary: "modern",
      dialogueRatio: "balanced",
      emotionIntensity: "medium",
      humorLevel: "low",
      avoidAIWords: true,
      useShortSentences: true,
      useDialogue: true,
      useSensoryDetail: true,
      customRules: [],
      isDefault: true,
    });
    setShowForm(false);
  }

  const povLabel = (v: string) => {
    switch (v) {
      case "first_person": return "第一人称";
      case "third_person": return "第三人称";
      case "mixed": return "混合视角";
      default: return v;
    }
  };

  const pacingLabel = (v: string) => {
    switch (v) {
      case "slow": return "慢节奏";
      case "balanced": return "适中";
      case "fast": return "快节奏";
      default: return v;
    }
  };

  return (
    <section className="style-panel">
      <header className="section-header">
        <div>
          <h2>风格控制</h2>
          <p>配置写作风格，控制叙事视角、节奏、语言等。</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="primary-button"
            type="button"
            onClick={() => { setShowExtractForm(!showExtractForm); setShowForm(false); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: extracting ? "var(--border)" : "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              cursor: extracting ? "not-allowed" : "pointer",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {extracting ? "学习中..." : "从文本学习风格"}
          </button>
          <button className="primary-button" type="button" onClick={() => { setShowForm(!showForm); setShowExtractForm(false); }}>
            {showForm ? "收起" : "新建风格"}
          </button>
        </div>
      </header>

      {/* 从文本学习风格 */}
      {showExtractForm && (
        <div className="style-form" style={{ marginBottom: "1rem" }}>
          <h3>从文本学习风格</h3>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            粘贴一段您喜欢的文本，AI将自动分析其写作风格特征。
          </p>
          <label>
            <span>参考文本 *</span>
            <textarea
              value={extractText}
              onChange={(e) => setExtractText(e.target.value)}
              placeholder="请粘贴至少100字的参考文本..."
              rows={6}
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                lineHeight: 1.6,
                resize: "vertical",
              }}
            />
          </label>
          <div className="form-actions" style={{ marginTop: "0.75rem" }}>
            <button
              className="primary-button"
              type="button"
              onClick={handleExtractStyle}
              disabled={extracting || extractText.trim().length < 100}
              style={{
                padding: "0.5rem 1rem",
                background: extracting || extractText.trim().length < 100 ? "var(--border)" : "var(--accent)",
                color: "var(--text-inverse)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                cursor: extracting || extractText.trim().length < 100 ? "not-allowed" : "pointer",
              }}
            >
              {extracting ? "分析中..." : "开始分析"}
            </button>
            <button type="button" onClick={() => { setShowExtractForm(false); setExtractedStyle(null); }}>取消</button>
          </div>

          {/* 提取结果 */}
          {extractedStyle && (
            <div style={{
              marginTop: "1rem",
              padding: "1rem",
              background: "rgba(139,69,19,0.05)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}>
              <h4 style={{ fontSize: "0.9375rem", marginBottom: "0.75rem" }}>提取的风格特征</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
                {extractedStyle.name && <div><strong>风格名称：</strong>{extractedStyle.name}</div>}
                {extractedStyle.narrativePov && <div><strong>叙事视角：</strong>{extractedStyle.narrativePov}</div>}
                {extractedStyle.tense && <div><strong>时态：</strong>{extractedStyle.tense}</div>}
                {extractedStyle.pacing && <div><strong>节奏：</strong>{extractedStyle.pacing}</div>}
                {extractedStyle.sentenceLength && <div><strong>句子长度：</strong>{extractedStyle.sentenceLength}</div>}
                {extractedStyle.vocabulary && <div><strong>词汇风格：</strong>{extractedStyle.vocabulary}</div>}
                {extractedStyle.dialogueRatio && <div><strong>对话比例：</strong>{extractedStyle.dialogueRatio}</div>}
                {extractedStyle.emotionIntensity && <div><strong>情感强度：</strong>{extractedStyle.emotionIntensity}</div>}
                {extractedStyle.humorLevel && <div><strong>幽默程度：</strong>{extractedStyle.humorLevel}</div>}
              </div>
              {extractedStyle.description && (
                <div style={{ marginTop: "0.75rem" }}>
                  <strong>描述：</strong>
                  <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)" }}>{extractedStyle.description}</p>
                </div>
              )}
              {extractedStyle.customRules && extractedStyle.customRules.length > 0 && (
                <div style={{ marginTop: "0.75rem" }}>
                  <strong>自定义规则：</strong>
                  <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                    {extractedStyle.customRules.map((rule, i) => <li key={i}>{rule}</li>)}
                  </ul>
                </div>
              )}
              <button
                className="primary-button"
                type="button"
                onClick={handleApplyExtractedStyle}
                style={{
                  marginTop: "1rem",
                  padding: "0.5rem 1rem",
                  background: "var(--accent)",
                  color: "var(--text-inverse)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                应用此风格
              </button>
            </div>
          )}
        </div>
      )}

      {/* 风格表单 */}
      {showForm && (
        <div className="style-form">
          <h3>{editingId ? "编辑风格" : "新建风格"}</h3>
          
          <div className="form-row">
            <label>
              <span>风格名称 *</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：都市爽文风格"
              />
            </label>
            <label>
              <span>描述</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="风格描述"
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>叙事视角</span>
              <select value={form.narrativePov} onChange={(e) => setForm({ ...form, narrativePov: e.target.value })}>
                <option value="first_person">第一人称</option>
                <option value="third_person">第三人称</option>
                <option value="mixed">混合视角</option>
              </select>
            </label>
            <label>
              <span>时态</span>
              <select value={form.tense} onChange={(e) => setForm({ ...form, tense: e.target.value })}>
                <option value="past">过去时</option>
                <option value="present">现在时</option>
              </select>
            </label>
            <label>
              <span>节奏</span>
              <select value={form.pacing} onChange={(e) => setForm({ ...form, pacing: e.target.value })}>
                <option value="slow">慢节奏</option>
                <option value="balanced">适中</option>
                <option value="fast">快节奏</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>句子长度</span>
              <select value={form.sentenceLength} onChange={(e) => setForm({ ...form, sentenceLength: e.target.value })}>
                <option value="short">短句为主</option>
                <option value="medium">中等</option>
                <option value="long">长句为主</option>
                <option value="mixed">混合</option>
              </select>
            </label>
            <label>
              <span>词汇风格</span>
              <select value={form.vocabulary} onChange={(e) => setForm({ ...form, vocabulary: e.target.value })}>
                <option value="modern">现代白话</option>
                <option value="classical">古典文雅</option>
                <option value="mixed">混合</option>
              </select>
            </label>
            <label>
              <span>对话比例</span>
              <select value={form.dialogueRatio} onChange={(e) => setForm({ ...form, dialogueRatio: e.target.value })}>
                <option value="low">少对话</option>
                <option value="balanced">适中</option>
                <option value="high">多对话</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label>
              <span>情感强度</span>
              <select value={form.emotionIntensity} onChange={(e) => setForm({ ...form, emotionIntensity: e.target.value })}>
                <option value="low">克制内敛</option>
                <option value="medium">适中</option>
                <option value="high">强烈饱满</option>
              </select>
            </label>
            <label>
              <span>幽默程度</span>
              <select value={form.humorLevel} onChange={(e) => setForm({ ...form, humorLevel: e.target.value })}>
                <option value="none">严肃</option>
                <option value="low">偶尔轻松</option>
                <option value="medium">适度幽默</option>
                <option value="high">多幽默</option>
              </select>
            </label>
          </div>

          <div className="form-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={form.avoidAIWords}
                onChange={(e) => setForm({ ...form, avoidAIWords: e.target.checked })}
              />
              <span>避免 AI 味词汇</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.useShortSentences}
                onChange={(e) => setForm({ ...form, useShortSentences: e.target.checked })}
              />
              <span>多用短句</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.useDialogue}
                onChange={(e) => setForm({ ...form, useDialogue: e.target.checked })}
              />
              <span>多用对话</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.useSensoryDetail}
                onChange={(e) => setForm({ ...form, useSensoryDetail: e.target.checked })}
              />
              <span>感官描写</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              <span>设为默认</span>
            </label>
          </div>

          <div className="form-actions">
            <button className="primary-button" type="button" onClick={handleSave}>
              {editingId ? "更新" : "创建"}
            </button>
            <button type="button" onClick={resetForm}>取消</button>
          </div>
        </div>
      )}

      {/* 风格列表 */}
      <div className="style-list">
        {loading ? (
          <p className="empty-note">加载中...</p>
        ) : profiles.length === 0 ? (
          <p className="empty-note">还没有风格配置。点击"新建风格"创建。</p>
        ) : (
          profiles.map((profile) => (
            <article key={profile.id} className={`style-card ${profile.isDefault ? "default" : ""}`}>
              <header>
                <strong>{profile.name}</strong>
                {profile.isDefault && <em>默认</em>}
              </header>
              {profile.description && <p className="style-desc">{profile.description}</p>}
              <div className="style-tags">
                <span>{povLabel(profile.narrativePov)}</span>
                <span>{pacingLabel(profile.pacing)}</span>
                <span>{profile.sentenceLength === "short" ? "短句" : profile.sentenceLength === "long" ? "长句" : "混合"}</span>
              </div>
              <div className="card-actions">
                {!profile.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(profile.id)}>设为默认</button>
                )}
                <button type="button" onClick={() => handleEdit(profile)}>编辑</button>
                <button type="button" onClick={() => handleDelete(profile.id)}>删除</button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* 去 AI 味测试 */}
      <div className="ai-smell-test">
        <h3>去 AI 味测试</h3>
        <p>输入一段文字，测试去 AI 味效果。</p>
        <textarea
          value={testContent}
          onChange={(e) => setTestContent(e.target.value)}
          placeholder="输入要测试的内容..."
          rows={4}
        />
        <button type="button" onClick={handleTestRemoveAISmell}>测试去 AI 味</button>
        {testResult && (
          <div className="test-result">
            <h4>处理结果：</h4>
            <pre>{testResult}</pre>
          </div>
        )}
      </div>
    </section>
  );
}

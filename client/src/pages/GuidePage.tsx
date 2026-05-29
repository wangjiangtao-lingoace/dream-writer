import React, { useState } from "react";

interface GuideSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  steps: { label: string; detail: string }[];
  tips?: string[];
}

const sections: GuideSection[] = [
  {
    id: "standalone",
    title: "独立创作",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    description: "从零开始，仅凭一个创意就能生成完整小说框架。也支持粘贴已有的大纲、人物、世界观等丰富内容，AI 会智能识别并保留你的原创内容。",
    steps: [
      { label: "1. 填写创意", detail: "在「创建新作品」中输入标题、类型和创作灵感。灵感可以是：\n• 一小段脑洞创意（AI 会扩展生成全部内容）\n• 完整的大纲、人物设定、世界观、风格描述（AI 会拆解入库，保留你的原创内容）\n• 以上两者之间的任意详细程度" },
      { label: "2. 智能分析", detail: "系统自动分析你的输入，识别其中已包含哪些内容类型（大纲、人物、世界观、风格、卷结构）。分析结果会在创作流程页面展示。" },
      { label: "3. 拆解入库", detail: "对于你已提供的内容，AI 会将其结构化拆解并写入对应的资产表（人物卡、世界观、风格配置等）。你的原创内容会被最大程度保留，不会被改写或压缩。" },
      { label: "4. 审核大纲", detail: "在创作流程页面查看大纲内容。如果不满意，可以：\n• 点击「重新生成」并输入修改意见\n• 点击「编辑」直接修改 JSON 内容\n• 反复调整直到满意后点击「确认」" },
      { label: "5. 生成资产", detail: "确认大纲后，系统只生成你缺失的资产。已有资产（从你的输入中拆解的）会被跳过，不会被覆盖。完成后再次暂停，你可以逐项审核和修改。" },
      { label: "6. 生成章节", detail: "确认资产后，系统自动生成前 1-3 章草稿。完成后可以进入「继续创作」模式逐章扩写。" },
    ],
    tips: [
      "输入越详细，AI 生成质量越高，且不会覆盖你的原创内容",
      "每个步骤都支持「重新生成 + 修改意见」，AI 会参考你的意见重新生成",
      "每个步骤都支持「编辑」，可以直接修改 JSON 后保存",
      "已有资产在生成阶段会被自动跳过，节省 token 和时间",
    ],
  },
  {
    id: "imitation",
    title: "拆书仿写",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
    description: "基于已有书籍进行拆解分析，学习其写作手法后仿写创作。适合想要学习网文套路、快速产出的用户。",
    steps: [
      { label: "1. 输入书名", detail: "在「创建新作品」中选择「分析并创建」模式，输入参考书籍的名称。系统会联网查询书籍信息。" },
      { label: "2. 自动拆书", detail: "系统自动完成 8 个维度的拆解分析：开篇套路、人物塑造、情节节奏、爽点分布、钩子设计、世界观构建、风格特征、读者心理。" },
      { label: "3. 生成仿写方案", detail: "基于拆书结果，系统生成仿写蓝图（含创作方向、章节模板、样章草稿），帮你掌握原书的写作精髓。" },
      { label: "4. 资产落库", detail: "拆书结果和仿写方案自动沉淀到知识库，生成人物卡、世界观、风格配置等创作资产。" },
      { label: "5. 自动创作", detail: "点击「自动生成 1-3 章」，系统基于仿写方案和资产自动生成样章草稿。完成后可继续扩写。" },
    ],
    tips: [
      "一键流程：点击「一键拆书并创作」可自动完成从拆书到生成样章的全部步骤",
      "拆书结果支持手动编辑，你可以调整每个分区的分析内容",
      "仿写方案支持「应用到创作流程」，一键启动自动创作",
    ],
  },
];

const GuidePage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string>(sections[0].id);

  const current = sections.find((s) => s.id === activeSection) || sections[0];

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>功能引导</h1>
        <p style={{ margin: "var(--space-2) 0 0", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Dream Writer 提供两种创作模式，选择适合你的方式开始创作。
        </p>
      </div>

      {/* 模式切换 */}
      <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            style={{
              flex: 1,
              display: "flex", alignItems: "center", gap: "var(--space-2)",
              padding: "var(--space-3) var(--space-4)",
              background: activeSection === section.id ? "var(--accent-muted)" : "var(--bg-surface)",
              border: `1px solid ${activeSection === section.id ? "var(--accent)" : "var(--border-default)"}`,
              borderRadius: "var(--radius-md)",
              color: activeSection === section.id ? "var(--accent)" : "var(--text-primary)",
              fontSize: "0.9375rem", fontWeight: 600, cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            {section.icon}
            {section.title}
          </button>
        ))}
      </div>

      {/* 描述 */}
      <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "var(--space-5)" }}>
        {current.description}
      </p>

      {/* 步骤 */}
      <div style={{ display: "grid", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        {current.steps.map((step, index) => (
          <div
            key={index}
            style={{
              display: "flex", gap: "var(--space-4)",
              padding: "var(--space-4)",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div style={{
              flexShrink: 0, width: "2rem", height: "2rem",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--accent-muted)", color: "var(--accent)",
              borderRadius: "50%", fontSize: "0.8125rem", fontWeight: 700,
            }}>
              {index + 1}
            </div>
            <div>
              <strong style={{ display: "block", fontSize: "0.9375rem", color: "var(--text-primary)", marginBottom: "var(--space-1)" }}>
                {step.label}
              </strong>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                {step.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 提示 */}
      {current.tips && current.tips.length > 0 && (
        <div style={{
          padding: "var(--space-4)",
          background: "var(--accent-muted)",
          border: "1px solid rgba(79,124,255,0.25)",
          borderRadius: "var(--radius-md)",
        }}>
          <strong style={{ display: "block", fontSize: "0.875rem", color: "var(--accent)", marginBottom: "var(--space-2)" }}>
            使用技巧
          </strong>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-2)" }}>
            {current.tips.map((tip, index) => (
              <li key={index} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.6, display: "flex", gap: "var(--space-2)" }}>
                <span style={{ color: "var(--accent)", flexShrink: 0 }}>-</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default GuidePage;

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export interface PipelineConfig {
  autoContinue: boolean;
  autoDraftChapters: number;
  volumeCount: number;
  chaptersPerVolume: number;
  targetWordCount: number;
  overwriteExistingChapters: boolean;
}

interface PipelineConfigModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: PipelineConfig) => void;
  mode: "create" | "imitation";
  defaults?: Partial<PipelineConfig>;
}

interface PresetOption {
  label: string;
  description: string;
  volumeCount: number;
  chaptersPerVolume: number;
  targetWordCount: number;
}

const CREATE_PRESETS: PresetOption[] = [
  { label: "短篇", description: "1卷 10章 2000字/章", volumeCount: 1, chaptersPerVolume: 10, targetWordCount: 2000 },
  { label: "中篇", description: "3卷 30章 2500字/章", volumeCount: 3, chaptersPerVolume: 30, targetWordCount: 2500 },
  { label: "长篇", description: "5卷 30章 2500字/章", volumeCount: 5, chaptersPerVolume: 30, targetWordCount: 2500 },
  { label: "史诗", description: "10卷 30章 2500字/章", volumeCount: 10, chaptersPerVolume: 30, targetWordCount: 2500 },
];

const IMITATION_PRESETS: PresetOption[] = [
  { label: "短篇", description: "1卷 3章", volumeCount: 1, chaptersPerVolume: 3, targetWordCount: 2000 },
  { label: "中篇", description: "3卷 10章", volumeCount: 3, chaptersPerVolume: 10, targetWordCount: 2500 },
  { label: "长篇", description: "5卷 30章", volumeCount: 5, chaptersPerVolume: 30, targetWordCount: 2500 },
];

const DEFAULT_CONFIG: PipelineConfig = {
  autoContinue: true,
  autoDraftChapters: 3,
  volumeCount: 3,
  chaptersPerVolume: 30,
  targetWordCount: 2500,
  overwriteExistingChapters: false,
};

const PipelineConfigModal: React.FC<PipelineConfigModalProps> = ({
  open,
  onClose,
  onConfirm,
  mode,
  defaults,
}) => {
  const presets = mode === "imitation" ? IMITATION_PRESETS : CREATE_PRESETS;

  const findMatchingPreset = useCallback(
    (config: PipelineConfig): string | null => {
      for (const p of presets) {
        if (
          p.volumeCount === config.volumeCount &&
          p.chaptersPerVolume === config.chaptersPerVolume &&
          p.targetWordCount === config.targetWordCount
        ) {
          return p.label;
        }
      }
      return null;
    },
    [presets]
  );

  const mergedDefaults: PipelineConfig = { ...DEFAULT_CONFIG, ...defaults };
  const initialPreset = findMatchingPreset(mergedDefaults);

  const [selectedPreset, setSelectedPreset] = useState<string | null>(initialPreset);
  const [autoContinue, setAutoContinue] = useState(mergedDefaults.autoContinue);
  const [autoDraftChapters, setAutoDraftChapters] = useState(mergedDefaults.autoDraftChapters);
  const [volumeCount, setVolumeCount] = useState(mergedDefaults.volumeCount);
  const [chaptersPerVolume, setChaptersPerVolume] = useState(mergedDefaults.chaptersPerVolume);
  const [targetWordCount, setTargetWordCount] = useState(mergedDefaults.targetWordCount);
  const [overwriteExistingChapters, setOverwriteExistingChapters] = useState(mergedDefaults.overwriteExistingChapters);

  // Reset state when modal opens with new defaults
  useEffect(() => {
    if (open) {
      const m: PipelineConfig = { ...DEFAULT_CONFIG, ...defaults };
      const p = findMatchingPreset(m);
      setSelectedPreset(p);
      setAutoContinue(m.autoContinue);
      setAutoDraftChapters(m.autoDraftChapters);
      setVolumeCount(m.volumeCount);
      setChaptersPerVolume(m.chaptersPerVolume);
      setTargetWordCount(m.targetWordCount);
      setOverwriteExistingChapters(m.overwriteExistingChapters);
    }
  }, [open, defaults, findMatchingPreset]);

  const handlePresetSelect = (preset: PresetOption) => {
    setSelectedPreset(preset.label);
    setVolumeCount(preset.volumeCount);
    setChaptersPerVolume(preset.chaptersPerVolume);
    setTargetWordCount(preset.targetWordCount);
  };

  const handleCustomSelect = () => {
    setSelectedPreset(null);
  };

  const handleConfirm = () => {
    onConfirm({
      autoContinue,
      autoDraftChapters,
      volumeCount,
      chaptersPerVolume,
      targetWordCount,
      overwriteExistingChapters,
    });
  };

  const isCustom = selectedPreset === null;
  const confirmLabel = mode === "create" ? "开始创作" : "开始仿写";

  if (!open) return null;

  // --- Styles ---

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.5)",
    backdropFilter: "blur(4px)",
    animation: "pcm-fade-in 0.2s ease-out",
  };

  const modalStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: "560px",
    maxHeight: "85vh",
    overflowY: "auto",
    background: "var(--bg-card, var(--bg-elevated, #1a1a2e))",
    border: "1px solid var(--border, var(--border-default, #2a2a4a))",
    borderRadius: "var(--radius-lg, 12px)",
    boxShadow: "0 24px 48px rgba(0,0,0,0.3)",
    animation: "pcm-scale-in 0.2s ease-out",
    margin: "var(--space-4, 1rem)",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-4, 1rem) var(--space-6, 1.5rem)",
    borderBottom: "1px solid var(--border, var(--border-default, #2a2a4a))",
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "var(--text-primary, #e8e8f0)",
  };

  const closeBtnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2rem",
    height: "2rem",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm, 4px)",
    color: "var(--text-muted, #888)",
    cursor: "pointer",
    fontSize: "1.25rem",
    lineHeight: 1,
  };

  const bodyStyle: React.CSSProperties = {
    padding: "var(--space-6, 1.5rem)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-6, 1.5rem)",
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--text-primary, #e8e8f0)",
    marginBottom: "var(--space-2, 0.5rem)",
  };

  const sectionDescStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    color: "var(--text-muted, #888)",
    marginTop: "var(--space-1, 0.25rem)",
  };

  const btnSmallStyle: React.CSSProperties = {
    padding: "0.375rem 0.75rem",
    background: "transparent",
    color: "var(--text-secondary, #aaa)",
    border: "1px solid var(--border, var(--border-default, #2a2a4a))",
    borderRadius: "var(--radius-sm, 4px)",
    fontSize: "0.75rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnSmallStyle,
    background: "var(--accent, #6366f1)",
    color: "var(--text-inverse, #fff)",
    borderColor: "var(--accent, #6366f1)",
    fontSize: "0.875rem",
    padding: "0.5rem 1.25rem",
    fontWeight: 500,
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--space-3, 0.75rem)",
    padding: "var(--space-4, 1rem) var(--space-6, 1.5rem)",
    borderTop: "1px solid var(--border, var(--border-default, #2a2a4a))",
  };

  const toggleTrackStyle = (active: boolean): React.CSSProperties => ({
    position: "relative",
    width: "2.5rem",
    height: "1.25rem",
    borderRadius: "var(--radius-full, 9999px)",
    background: active ? "var(--accent, #6366f1)" : "var(--border, var(--border-default, #2a2a4a))",
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s",
    flexShrink: 0,
  });

  const toggleThumbStyle = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "2px",
    left: active ? "calc(100% - 1.125rem)" : "2px",
    width: "1rem",
    height: "1rem",
    borderRadius: "50%",
    background: "#fff",
    transition: "left 0.15s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  });

  const presetCardStyle = (active: boolean): React.CSSProperties => ({
    flex: "1 1 0",
    minWidth: 0,
    padding: "var(--space-3, 0.75rem)",
    border: `1px solid ${active ? "var(--accent, #6366f1)" : "var(--border, var(--border-default, #2a2a4a))"}`,
    borderRadius: "var(--radius-md, 8px)",
    background: active ? "rgba(99, 102, 241, 0.08)" : "transparent",
    cursor: "pointer",
    textAlign: "center",
    transition: "border-color 0.15s, background 0.15s",
  });

  const presetLabelStyle = (active: boolean): React.CSSProperties => ({
    fontSize: "0.875rem",
    fontWeight: 600,
    color: active ? "var(--accent, #6366f1)" : "var(--text-primary, #e8e8f0)",
    marginBottom: "2px",
  });

  const presetDescStyle: React.CSSProperties = {
    fontSize: "0.6875rem",
    color: "var(--text-muted, #888)",
  };

  const numberInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.375rem 0.625rem",
    border: "1px solid var(--border, var(--border-default, #2a2a4a))",
    borderRadius: "var(--radius-sm, 4px)",
    background: "var(--bg-primary, var(--bg-surface, #111))",
    color: "var(--text-primary, #e8e8f0)",
    fontSize: "0.8125rem",
    outline: "none",
  };

  const inputRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "var(--space-3, 0.75rem)",
  };

  const inputGroupStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1, 0.25rem)",
  };

  const inputLabelStyle: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "var(--text-secondary, #aaa)",
  };

  const toggleRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "var(--space-4, 1rem)",
  };

  // --- Render ---

  const modalContent = (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Inject keyframe animations */}
        <style>{`
          @keyframes pcm-fade-in { from { opacity: 0; } to { opacity: 1; } }
          @keyframes pcm-scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        `}</style>

        {/* Header */}
        <div style={headerStyle}>
          <h2 style={titleStyle}>
            {mode === "create" ? "创作配置" : "仿写配置"}
          </h2>
          <button style={closeBtnStyle} onClick={onClose} aria-label="关闭">
            &times;
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Auto Continue Toggle */}
          <div>
            <div style={toggleRowStyle}>
              <div>
                <div style={sectionLabelStyle}>自动推进</div>
                <div style={sectionDescStyle}>
                  {autoContinue
                    ? "AI 自动完成所有阶段，完成后通知您审核"
                    : "每个阶段暂停等待您确认后继续"}
                </div>
              </div>
              <button
                type="button"
                style={toggleTrackStyle(autoContinue)}
                onClick={() => setAutoContinue(!autoContinue)}
                aria-pressed={autoContinue}
                role="switch"
              >
                <span style={toggleThumbStyle(autoContinue)} />
              </button>
            </div>
          </div>

          {/* Scale Presets */}
          <div>
            <div style={sectionLabelStyle}>创作规模</div>
            <div style={{ display: "flex", gap: "var(--space-2, 0.5rem)", flexWrap: "wrap", marginTop: "var(--space-2, 0.5rem)" }}>
              {presets.map((p) => (
                <div
                  key={p.label}
                  style={presetCardStyle(selectedPreset === p.label)}
                  onClick={() => handlePresetSelect(p)}
                >
                  <div style={presetLabelStyle(selectedPreset === p.label)}>{p.label}</div>
                  <div style={presetDescStyle}>{p.description}</div>
                </div>
              ))}
              <div
                style={presetCardStyle(isCustom)}
                onClick={handleCustomSelect}
              >
                <div style={presetLabelStyle(isCustom)}>自定义</div>
                <div style={presetDescStyle}>自定义参数</div>
              </div>
            </div>
          </div>

          {/* Custom Fields */}
          {isCustom && (
            <div style={inputRowStyle}>
              <div style={inputGroupStyle}>
                <label style={inputLabelStyle}>卷数</label>
                <input
                  type="number"
                  value={volumeCount}
                  min={1}
                  max={10}
                  onChange={(e) => setVolumeCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                  style={numberInputStyle}
                />
              </div>
              <div style={inputGroupStyle}>
                <label style={inputLabelStyle}>每卷章数</label>
                <input
                  type="number"
                  value={chaptersPerVolume}
                  min={5}
                  max={30}
                  onChange={(e) => setChaptersPerVolume(Math.max(5, Math.min(30, Number(e.target.value) || 5)))}
                  style={numberInputStyle}
                />
              </div>
              <div style={inputGroupStyle}>
                <label style={inputLabelStyle}>目标字数/章</label>
                <input
                  type="number"
                  value={targetWordCount}
                  min={500}
                  max={8000}
                  step={100}
                  onChange={(e) => setTargetWordCount(Math.max(500, Math.min(8000, Number(e.target.value) || 500)))}
                  style={numberInputStyle}
                />
              </div>
            </div>
          )}

          {/* Auto Draft Chapters */}
          <div>
            <div style={sectionLabelStyle}>自动草稿章数</div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3, 0.75rem)", marginTop: "var(--space-2, 0.5rem)" }}>
              <input
                type="number"
                value={autoDraftChapters}
                min={1}
                max={10}
                onChange={(e) => setAutoDraftChapters(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                style={{ ...numberInputStyle, width: "6rem" }}
              />
              <span style={sectionDescStyle}>Pipeline 完成后自动生成的章节数</span>
            </div>
          </div>

          {/* Overwrite Toggle */}
          <div>
            <div style={toggleRowStyle}>
              <div>
                <div style={sectionLabelStyle}>覆盖已有章节</div>
                <div style={sectionDescStyle}>重新生成已有正文的章节</div>
              </div>
              <button
                type="button"
                style={toggleTrackStyle(overwriteExistingChapters)}
                onClick={() => setOverwriteExistingChapters(!overwriteExistingChapters)}
                aria-pressed={overwriteExistingChapters}
                role="switch"
              >
                <span style={toggleThumbStyle(overwriteExistingChapters)} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button style={btnSmallStyle} onClick={onClose}>
            取消
          </button>
          <button style={btnPrimaryStyle} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PipelineConfigModal;

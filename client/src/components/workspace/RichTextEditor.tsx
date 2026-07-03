import React, { useMemo, useCallback, useRef, useEffect, useState } from "react";
import {
  Plate,
  PlateContent,
  PlateContainer,
  createPlateEditor,
  createPlatePlugin,
  ParagraphPlugin,
  PlateLeaf,
  useEditorRef,
} from "platejs/react";
import type { Value } from "platejs";
import { serializeToText, deserializeFromText } from "../../utils/plateSerializer";

// 自定义叶子渲染器 - 伏笔标记
const ForeshadowLeaf = (props: any) => (
  <PlateLeaf {...props} asChild>
    <span style={{
      background: "rgba(234,179,8,0.15)",
      borderRadius: "3px",
      padding: "0 2px",
      borderBottom: "2px solid #f59e0b",
    }}>
      {props.children}
    </span>
  </PlateLeaf>
);

// 自定义叶子渲染器 - 角色引用
const CharacterRefLeaf = (props: any) => (
  <PlateLeaf {...props} asChild>
    <span style={{
      background: "var(--accent-muted)",
      borderRadius: "3px",
      padding: "0 2px",
      color: "var(--accent)",
    }}>
      {props.children}
    </span>
  </PlateLeaf>
);

// 伏笔标记插件
const ForeshadowPlugin = createPlatePlugin({
  key: "foreshadow",
  node: { isLeaf: true },
  render: { node: ForeshadowLeaf },
});

// 角色引用插件
const CharacterRefPlugin = createPlatePlugin({
  key: "characterRef",
  node: { isLeaf: true },
  render: { node: CharacterRefLeaf },
});

// 标题插件
const HeadingPlugin = createPlatePlugin({
  key: "heading",
  node: {
    isElement: true,
    type: "h1",
  },
});

interface RichTextEditorProps {
  content: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onToolbarAction?: (action: string) => void;
  aiProcessing?: string | null;
}

// 工具栏按钮组件
const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}> = ({ label, onClick, active, disabled, title }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => {
      e.preventDefault();
      if (!disabled) onClick();
    }}
    style={{
      border: "1px solid var(--border-default)",
      background: active ? "var(--accent-muted)" : "var(--bg-surface)",
      borderRadius: "8px",
      padding: "0.4375rem 0.625rem",
      fontSize: "0.75rem",
      color: active ? "var(--accent)" : "var(--text-secondary)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      transition: "all 0.15s",
    }}
  >
    {label}
  </button>
);

// 工具栏分隔线
const ToolbarDivider = () => (
  <div style={{
    width: "1px",
    background: "var(--border-subtle)",
    margin: "0.25rem 0.125rem",
  }} />
);

// 查找替换面板
const FindReplacePanel: React.FC<{
  onClose: () => void;
  getContent: () => string;
  onReplace: (oldText: string, newText: string, replaceAll: boolean) => void;
}> = ({ onClose, getContent, onReplace }) => {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!findText) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }
    const content = getContent();
    const flags = caseSensitive ? "g" : "gi";
    try {
      const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      const matches = content.match(regex);
      setMatchCount(matches?.length || 0);
      setCurrentMatch(matches && matches.length > 0 ? 1 : 0);
    } catch {
      setMatchCount(0);
    }
  }, [findText, caseSensitive, getContent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
        background: "var(--bg-surface, #fff)",
        border: "1px solid var(--border-default)",
        borderRadius: "12px",
        padding: "0.75rem",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: "280px",
      }}
    >
      {/* 查找行 */}
      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
        <input
          ref={findInputRef}
          type="text"
          value={findText}
          onChange={(e) => setFindText(e.target.value)}
          placeholder="查找..."
          style={{
            flex: 1,
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "0.375rem 0.5rem",
            fontSize: "0.8125rem",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => setCaseSensitive(!caseSensitive)}
          title="区分大小写"
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "0.375rem 0.5rem",
            fontSize: "0.75rem",
            background: caseSensitive ? "var(--accent-muted)" : "var(--bg-surface)",
            color: caseSensitive ? "var(--accent)" : "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Aa
        </button>
        <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", minWidth: "3rem", textAlign: "center" }}>
          {matchCount > 0 ? `${currentMatch}/${matchCount}` : findText ? "无匹配" : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="关闭 (Esc)"
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            fontSize: "1rem",
            padding: "0 0.25rem",
          }}
        >
          ×
        </button>
      </div>

      {/* 替换行 */}
      <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
        <input
          type="text"
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          placeholder="替换为..."
          style={{
            flex: 1,
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "0.375rem 0.5rem",
            fontSize: "0.8125rem",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => findText && onReplace(findText, replaceText, false)}
          disabled={!findText || matchCount === 0}
          title="替换当前"
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "0.375rem 0.5rem",
            fontSize: "0.6875rem",
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            cursor: findText && matchCount > 0 ? "pointer" : "not-allowed",
            opacity: findText && matchCount > 0 ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          替换
        </button>
        <button
          type="button"
          onClick={() => findText && onReplace(findText, replaceText, true)}
          disabled={!findText || matchCount === 0}
          title="全部替换"
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            padding: "0.375rem 0.5rem",
            fontSize: "0.6875rem",
            background: "var(--bg-surface)",
            color: "var(--text-secondary)",
            cursor: findText && matchCount > 0 ? "pointer" : "not-allowed",
            opacity: findText && matchCount > 0 ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          全部
        </button>
      </div>
    </div>
  );
};

// 编辑器内容区组件（必须在 Plate 内部使用）
const EditorContent: React.FC<{
  placeholder?: string;
  onToolbarAction?: (action: string) => void;
  aiProcessing?: string | null;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  getContent?: () => string;
  onReplace?: (oldText: string, newText: string, replaceAll: boolean) => void;
}> = ({ placeholder, onToolbarAction, aiProcessing, isFullscreen, onToggleFullscreen, getContent, onReplace }) => {
  const editor = useEditorRef();
  const [showFindReplace, setShowFindReplace] = useState(false);

  const toggleBold = useCallback(() => {
    if (!editor) return;
    editor.tf.toggleMark("bold");
  }, [editor]);

  const toggleHeading = useCallback(() => {
    if (!editor) return;
    editor.tf.toggleBlock("h1");
  }, [editor]);

  const toggleForeshadow = useCallback(() => {
    if (!editor) return;
    editor.tf.toggleMark("foreshadow");
  }, [editor]);

  const toggleCharacterRef = useCallback(() => {
    if (!editor) return;
    editor.tf.toggleMark("characterRef");
  }, [editor]);

  const handleUndo = useCallback(() => {
    if (!editor) return;
    try { editor.undo(); } catch { /* ignore */ }
  }, [editor]);

  const handleRedo = useCallback(() => {
    if (!editor) return;
    try { editor.redo(); } catch { /* ignore */ }
  }, [editor]);

  // 全局快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplace((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        onToggleFullscreen?.();
      }
      if (e.key === "Escape" && showFindReplace) {
        setShowFindReplace(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showFindReplace, onToggleFullscreen]);

  return (
    <>
      {/* 工具栏 */}
      <div style={{
        display: "flex",
        gap: "0.5rem",
        flexWrap: "wrap",
        padding: "0 0 1rem",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: "1.5rem",
        alignItems: "center",
      }}>
        <ToolbarButton label="撤销" onClick={handleUndo} title="撤销 (Ctrl+Z)" />
        <ToolbarButton label="重做" onClick={handleRedo} title="重做 (Ctrl+Shift+Z)" />
        <ToolbarDivider />
        <ToolbarButton label="粗体" onClick={toggleBold} title="粗体 (Ctrl+B)" />
        <ToolbarButton label="标题" onClick={toggleHeading} />
        <ToolbarButton label="伏笔标记" onClick={toggleForeshadow} />
        <ToolbarButton label="角色引用" onClick={toggleCharacterRef} />
        <ToolbarDivider />
        <ToolbarButton label="去AI味" onClick={() => onToolbarAction?.("deai")} disabled={!!aiProcessing} title="去除AI写作痕迹" />
        <ToolbarButton label="增强压迫" onClick={() => onToolbarAction?.("enhance")} disabled={!!aiProcessing} title="增强紧张感和压迫氛围" />
        <ToolbarButton label="续写" onClick={() => onToolbarAction?.("continue")} disabled={!!aiProcessing} title="从当前章节末尾续写" />
        <ToolbarDivider />
        <ToolbarButton label="查找" onClick={() => setShowFindReplace(!showFindReplace)} active={showFindReplace} title="查找替换 (Ctrl+F)" />
        <ToolbarButton label={isFullscreen ? "退出全屏" : "全屏"} onClick={() => onToggleFullscreen?.()} title="全屏模式 (Ctrl+Shift+F)" />
      </div>

      {/* 查找替换面板 */}
      {showFindReplace && getContent && onReplace && (
        <FindReplacePanel
          onClose={() => setShowFindReplace(false)}
          getContent={getContent}
          onReplace={onReplace}
        />
      )}

      {/* 编辑区 */}
      <PlateContent
        placeholder={placeholder || "开始写作..."}
        style={{
          fontSize: isFullscreen ? "1.25rem" : "1.125rem",
          lineHeight: 2.05,
          color: "var(--text-primary)",
          outline: "none",
          minHeight: isFullscreen ? "70vh" : "60vh",
        }}
      />
    </>
  );
};

// 全屏遮罩组件
const FullscreenOverlay: React.FC<{
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ visible, onClose, children }) => {
  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "3vh",
        overflow: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={{
        width: "100%",
        maxWidth: "800px",
        margin: "0 1rem",
      }}>
        {children}
      </div>
    </div>
  );
};

// 主编辑器组件
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder,
  onToolbarAction,
  aiProcessing,
}) => {
  const lastContentRef = useRef(content);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const editor = useMemo(() => {
    return createPlateEditor({
      plugins: [
        ParagraphPlugin,
        HeadingPlugin,
        ForeshadowPlugin,
        CharacterRefPlugin,
      ],
      value: deserializeFromText(content),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const newValue = deserializeFromText(content);
    editor.tf.setValue(newValue);
    lastContentRef.current = content;
  }, [content, editor]);

  const handleChange = useCallback(({ value }: { editor: any; value: Value }) => {
    const text = serializeToText(value);
    if (text !== lastContentRef.current) {
      lastContentRef.current = text;
      onChange(text);
    }
  }, [onChange]);

  const getContent = useCallback(() => lastContentRef.current, []);

  const handleReplace = useCallback((oldText: string, newText: string, replaceAll: boolean) => {
    const current = lastContentRef.current;
    if (!current) return;

    let result: string;
    if (replaceAll) {
      const flags = "gi";
      const regex = new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
      result = current.replace(regex, newText);
    } else {
      result = current.replace(oldText, newText);
    }

    onChange(result);
  }, [onChange]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  // ESC 退出全屏
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isFullscreen]);

  const editorElement = (
    <Plate editor={editor} onChange={handleChange}>
      <PlateContainer style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: isFullscreen ? "16px" : "24px",
        padding: "2rem 3rem",
        boxShadow: isFullscreen ? "0 24px 64px rgba(0,0,0,0.2)" : "0 14px 36px rgba(17,24,39,0.04)",
        position: "relative",
      }}>
        <EditorContent
          placeholder={placeholder}
          onToolbarAction={onToolbarAction}
          aiProcessing={aiProcessing}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          getContent={getContent}
          onReplace={handleReplace}
        />
      </PlateContainer>
    </Plate>
  );

  if (isFullscreen) {
    return (
      <FullscreenOverlay visible={isFullscreen} onClose={toggleFullscreen}>
        {editorElement}
      </FullscreenOverlay>
    );
  }

  return editorElement;
};

export default RichTextEditor;

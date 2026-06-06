import React, { useMemo, useCallback, useRef, useEffect } from "react";
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
      background: "rgba(79,124,255,0.1)",
      borderRadius: "3px",
      padding: "0 2px",
      color: "#4f7cff",
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
}

// 工具栏按钮组件
const ToolbarButton: React.FC<{
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ label, onClick, active }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    style={{
      border: "1px solid var(--border-default)",
      background: active ? "var(--accent-muted)" : "var(--bg-surface)",
      borderRadius: "8px",
      padding: "0.4375rem 0.625rem",
      fontSize: "0.75rem",
      color: active ? "var(--accent)" : "var(--text-secondary)",
      cursor: "pointer",
      transition: "all 0.15s",
    }}
  >
    {label}
  </button>
);

// 编辑器内容区组件（必须在 Plate 内部使用）
const EditorContent: React.FC<{
  placeholder?: string;
  onToolbarAction?: (action: string) => void;
}> = ({ placeholder, onToolbarAction }) => {
  const editor = useEditorRef();

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
      }}>
        <ToolbarButton label="粗体" onClick={toggleBold} />
        <ToolbarButton label="标题" onClick={toggleHeading} />
        <ToolbarButton label="伏笔标记" onClick={toggleForeshadow} />
        <ToolbarButton label="角色引用" onClick={toggleCharacterRef} />
        <ToolbarButton label="去AI味" onClick={() => onToolbarAction?.("deai")} />
        <ToolbarButton label="增强压迫" onClick={() => onToolbarAction?.("tension")} />
      </div>

      {/* 编辑区 */}
      <PlateContent
        placeholder={placeholder || "开始写作..."}
        style={{
          fontFamily: "var(--font-serif, 'LXGW WenKai', 'Songti SC', 'Noto Serif CJK SC', serif)",
          fontSize: "1.125rem",
          lineHeight: 2.05,
          color: "var(--text-primary)",
          outline: "none",
          minHeight: "60vh",
        }}
      />
    </>
  );
};

// 主编辑器组件
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder,
  onToolbarAction,
}) => {
  const lastContentRef = useRef(content);

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

  return (
    <Plate editor={editor} onChange={handleChange}>
      <PlateContainer style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "24px",
        padding: "2rem 3rem",
        boxShadow: "0 14px 36px rgba(17,24,39,0.04)",
      }}>
        <EditorContent placeholder={placeholder} onToolbarAction={onToolbarAction} />
      </PlateContainer>
    </Plate>
  );
};

export default RichTextEditor;

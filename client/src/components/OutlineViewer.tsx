import React, { useState } from "react";
import SmartJsonViewer from "./SmartJsonViewer";

// 大纲字段翻译映射
const OUTLINE_KEY_MAP: Record<string, string> = {
  'title': '标题',
  'summary': '摘要',
  'chapters': '章节',
  'plot': '情节',
  'conflict': '冲突',
  'resolution': '结局',
  'theme': '主题',
  'setting': '背景',
  'characters': '人物',
  'timeline': '时间线',
  'foreshadow': '伏笔',
  'climax': '高潮',
};

interface OutlineViewerProps {
  content: string;
  onEdit?: () => void;
}

export const OutlineViewer: React.FC<OutlineViewerProps> = ({
  content,
  onEdit,
}) => {
  const [viewMode, setViewMode] = useState<"structured" | "raw">("structured");

  if (!content || content.trim() === "") {
    return (
      <div className="outline-empty">
        <p>暂无大纲，请点击编辑按钮添加。</p>
        {onEdit && (
          <button
            className="btn-primary"
            onClick={onEdit}
            style={{
              padding: "0.5rem 1rem",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            编辑大纲
          </button>
        )}
      </div>
    );
  }

  // 尝试解析JSON
  let parsedContent: any = null;
  let isJson = false;

  try {
    parsedContent = JSON.parse(content);
    isJson = true;
  } catch {
    // 不是JSON，使用原始文本
    isJson = false;
  }

  return (
    <div className="outline-viewer">
      <div className="outline-header">
        <div className="outline-tabs">
          <button
            className={`tab ${viewMode === "structured" ? "active" : ""}`}
            onClick={() => setViewMode("structured")}
            style={{
              padding: "0.375rem 0.75rem",
              background: viewMode === "structured" ? "var(--accent)" : "transparent",
              color: viewMode === "structured" ? "var(--text-inverse)" : "var(--text-secondary)",
              border: viewMode === "structured" ? "none" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            结构化视图
          </button>
          <button
            className={`tab ${viewMode === "raw" ? "active" : ""}`}
            onClick={() => setViewMode("raw")}
            style={{
              padding: "0.375rem 0.75rem",
              background: viewMode === "raw" ? "var(--accent)" : "transparent",
              color: viewMode === "raw" ? "var(--text-inverse)" : "var(--text-secondary)",
              border: viewMode === "raw" ? "none" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.8125rem",
            }}
          >
            原始视图
          </button>
        </div>
        {onEdit && (
          <button
            className="btn-edit"
            onClick={onEdit}
            style={{
              padding: "0.375rem 0.75rem",
              background: "transparent",
              color: "var(--accent)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            编辑
          </button>
        )}
      </div>

      <div className="outline-content">
        {viewMode === "structured" && isJson ? (
          <SmartJsonViewer
            data={parsedContent}
            labelMap={OUTLINE_KEY_MAP}
            maxDepth={3}
          />
        ) : (
          <div
            className="outline-raw"
            style={{
              padding: "1rem",
              background: "var(--bg-base)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-default)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.7,
              color: "var(--text-primary)",
            }}
          >
            {content}
          </div>
        )}
      </div>
    </div>
  );
};

export default OutlineViewer;

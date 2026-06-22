import React from 'react';

interface WorkspaceHeaderProps {
  novelTitle: string;
  onBack: () => void;
  onSave: () => void;
  onPipeline: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  novelTitle,
  onBack,
  onSave,
  onPipeline,
}) => {
  return (
    <header className="workspace-header" style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.75rem 1.5rem",
      borderBottom: "1px solid var(--border-default)",
      background: "var(--bg-surface)",
    }}>
      <div className="header-left" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button className="btn-back" onClick={onBack} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 1rem",
          background: "transparent",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          fontSize: "0.875rem",
          transition: "all var(--transition-fast)",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回书架
        </button>
        <div style={{ width: "1px", height: "24px", background: "var(--border-default)" }} />
        <h1 style={{
          fontSize: "1.25rem",
          color: "var(--text-primary)",
          letterSpacing: "0.05em",
          margin: 0,
        }}>《{novelTitle}》</h1>
      </div>
      <div className="header-actions" style={{ display: "flex", gap: "0.5rem" }}>
        <button className="btn-pipeline" onClick={onPipeline} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.5rem 1rem",
          background: "transparent",
          color: "var(--text-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.8125rem",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          流程
        </button>
        <button className="btn-save" onClick={onSave} style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          padding: "0.5rem 1rem",
          background: "var(--accent)",
          color: "var(--text-inverse)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          fontSize: "0.8125rem",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          保存
        </button>
      </div>
    </header>
  );
};

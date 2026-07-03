import React from "react";

interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange }) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-1)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 var(--space-4)",
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${tab.key === activeKey ? "var(--accent)" : "transparent"}`,
            color: tab.key === activeKey ? "var(--accent)" : "var(--text-muted)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all var(--transition-fast)",
            marginBottom: "-1px",
          }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
};

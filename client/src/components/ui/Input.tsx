import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {label && (
          <label
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`input ${error ? "input-error" : ""} ${className}`}
          {...props}
        />
        {error && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--error)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

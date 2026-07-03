import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  loading = false,
  children,
  disabled,
  className = "",
  ...props
}) => {
  const classes = [
    "btn",
    `btn-${variant === "danger" ? "secondary" : variant}`,
    size !== "md" && `btn-${size}`,
    loading && "btn-loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <span
          className="btn-spinner"
          style={{
            width: "1em",
            height: "1em",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "white",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
};

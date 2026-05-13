import React from "react";

interface CardProps {
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  className = "",
  onClick,
}) => {
  const classes = [
    "card",
    hoverable && "card-hoverable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      {children}
    </div>
  );
};

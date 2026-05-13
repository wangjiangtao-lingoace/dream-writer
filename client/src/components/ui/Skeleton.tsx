import React from "react";

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "12px",
  borderRadius = "var(--radius-sm)",
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ width, height, borderRadius, marginBottom: i < count - 1 ? "var(--space-2)" : 0 }}
        />
      ))}
    </>
  );
};

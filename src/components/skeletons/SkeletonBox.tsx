/**
 * SkeletonBox — Base building block for all skeleton loaders.
 * Uses the existing Tailwind `animate-shimmer` class from index.css.
 */

interface SkeletonBoxProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

/**
 * A single shimmer block. All other skeleton components compose from this.
 */
export function SkeletonBox({
  width = "100%",
  height = 16,
  borderRadius = "4px",
  className = "",
}: SkeletonBoxProps) {
  const style: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    borderRadius,
    flexShrink: 0,
  };

  return (
    <div
      className={`animate-shimmer ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

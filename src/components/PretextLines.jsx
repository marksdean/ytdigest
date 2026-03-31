"use client";

import {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  useId,
} from "react";
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

/**
 * Renders paragraph text using Pretext line layout (prepareWithSegments + layoutWithLines).
 * Font string must match CSS on this block. Width comes from the container (ResizeObserver).
 *
 * @see https://github.com/chenglou/pretext
 */
export function PretextLines({
  text,
  font,
  lineHeightPx,
  className = "",
  style,
  maxLines,
  whiteSpace,
  as: Tag = "div",
  id,
  /** When set, skip container measurement (for inline labels where width is ambiguous). */
  fixedWidth,
  "aria-label": ariaLabel,
  "aria-hidden": ariaHidden,
}) {
  const ref = useRef(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const autoId = useId();
  const rootId = id ?? autoId;
  const width = fixedWidth != null ? fixedWidth : measuredWidth;

  const prepared = useMemo(() => {
    const t = text == null ? "" : String(text);
    if (!t) return null;
    try {
      return prepareWithSegments(
        t,
        font,
        whiteSpace === "pre-wrap" ? { whiteSpace: "pre-wrap" } : undefined
      );
    } catch {
      return null;
    }
  }, [text, font, whiteSpace]);

  useLayoutEffect(() => {
    if (fixedWidth != null) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.offsetWidth;
      if (w > 0) setMeasuredWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixedWidth]);

  const layout = useMemo(() => {
    if (!prepared || width <= 0) return null;
    try {
      return layoutWithLines(prepared, width, lineHeightPx);
    } catch {
      return null;
    }
  }, [prepared, width, lineHeightPx]);

  const lines = layout?.lines ?? [];
  const shown = maxLines != null ? lines.slice(0, maxLines) : lines;
  const fallback = text == null ? "" : String(text);

  if (!prepared) {
    return (
      <Tag
        ref={ref}
        id={rootId}
        className={className}
        style={style}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
      >
        {fallback}
      </Tag>
    );
  }

  if (width <= 0 || !layout) {
    return (
      <Tag
        ref={ref}
        id={rootId}
        className={className}
        style={{
          ...style,
          font,
          width: fixedWidth != null ? fixedWidth : "100%",
          minWidth: fixedWidth != null ? fixedWidth : 0,
          display: style?.display ?? (fixedWidth != null ? "inline-block" : undefined),
        }}
        aria-label={ariaLabel}
        aria-hidden={ariaHidden}
      >
        {fallback}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      id={rootId}
      className={className}
      style={{
        ...style,
        font,
        width: fixedWidth != null ? fixedWidth : "100%",
        minWidth: fixedWidth != null ? fixedWidth : 0,
        color: "inherit",
      }}
      aria-label={ariaLabel}
      aria-hidden={ariaHidden}
    >
      {shown.map((line, i) => (
        <span
          key={i}
          className="pretext-line"
          style={{
            display: "block",
            lineHeight: `${lineHeightPx}px`,
            minHeight: lineHeightPx,
            overflow: "hidden",
            whiteSpace: "pre",
          }}
        >
          {line.text}
        </span>
      ))}
    </Tag>
  );
}

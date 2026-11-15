import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type FoldProps = {
  /** What the folded text is about, in sentence case: "About the 90% intervals". */
  summary: string;
  children: ReactNode;
  className?: string;
};

/** Secondary detail kept one click away: a native <details>, so it opens with a keyboard and without script. */
export function Fold({ summary, children, className }: FoldProps) {
  return (
    <details className={cx("fold", className)}>
      <summary className="fold-summary">{summary}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

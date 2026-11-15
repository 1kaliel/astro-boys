import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";

type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  /** Source, period and unit. Every chart card must state them. */
  caption?: ReactNode;
  actions?: ReactNode;
};

export function Card({ title, caption, actions, children, className, ...rest }: CardProps) {
  return (
    <section className={cx("card", className)} {...rest}>
      {(title || actions) && (
        <header className="card-header">
          {title && <h2 className="card-title">{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
      {caption && <p className="card-caption">{caption}</p>}
    </section>
  );
}

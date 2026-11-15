import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export function Button({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx("button", className)} {...props} />;
}


import * as React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" };

export function Button({ className = "", variant = "default", ...props }: Props) {
  const base = "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm transition";
  const styles = variant === "outline"
    ? "border bg-white hover:bg-slate-50"
    : "bg-slate-900 text-white hover:bg-slate-800";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

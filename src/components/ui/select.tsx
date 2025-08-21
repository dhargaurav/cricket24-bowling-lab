
import * as React from "react";

type SelectRootProps = {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
};
export function Select({ value, onValueChange, children }: SelectRootProps) {
  let items: { value: string; label: React.ReactNode }[] = [];
  React.Children.forEach(children as any, (child: any) => {
    if (child?.type?.displayName === "SelectContent") {
      React.Children.forEach(child.props.children, (opt: any) => {
        if (opt?.type?.displayName === "SelectItem") {
          items.push({ value: String(opt.props.value), label: opt.props.children });
        }
      });
    }
  });
  return (
    <select className="rounded-md border px-3 py-2 text-sm" value={value} onChange={e => onValueChange(e.target.value)}>
      {items.map((it) => <option key={it.value} value={it.value}>{it.label}</option>)}
    </select>
  );
}
export function SelectTrigger({ className = "", children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`hidden ${className}`}>{children}</div>;
}
SelectTrigger.displayName = "SelectTrigger";

export function SelectValue({ placeholder }: { placeholder?: string }) {
  return <span className="hidden">{placeholder}</span>;
}
SelectValue.displayName = "SelectValue";

export function SelectContent({ className = "", children }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={`hidden ${className}`}>{children}</div>;
}
SelectContent.displayName = "SelectContent";

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <div data-value={value} className="hidden">{children}</div>;
}
SelectItem.displayName = "SelectItem";

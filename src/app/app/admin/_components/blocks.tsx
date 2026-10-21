// Presentational admin building blocks (no hooks): usable from server and client components.
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, cx, inputClass } from "@/components/ui";

/** Card whose table scrolls horizontally inside it on narrow screens. */
export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cx("overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}
export const th = "px-4 py-3 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap text-muted uppercase";
export const td = "border-t border-line px-4 py-3.5 align-middle";

export function Section({ title, description, children, actions, className }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <Card className={cx("p-5 sm:p-7", className)}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const styles = { error: "border-[#f1c4bf] bg-[#fef3f2] text-[#912018]", success: "border-[#2e9e5b]/30 bg-[#2e9e5b]/8 text-[#1f6f40]", info: "border-royal/20 bg-royal/5 text-ink" };
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", styles[tone])}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const compactInput = cx(inputClass, "h-10 rounded-lg px-3 text-sm");

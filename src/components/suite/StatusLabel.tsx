import type { SuiteStatus } from "@/config/brand";

export function StatusLabel({
  status,
  label,
  className,
}: {
  status: SuiteStatus;
  label: string;
  className?: string;
}) {
  return (
    <span
      data-status={status}
      className={
        "text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground " + (className ?? "")
      }
    >
      {label}
    </span>
  );
}
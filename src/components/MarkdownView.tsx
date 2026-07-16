import { useMemo } from "react";
import { markdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export default function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const html = useMemo(() => markdown.render(source), [source]);
  return (
    <div className={cn("markdown-output", className)} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

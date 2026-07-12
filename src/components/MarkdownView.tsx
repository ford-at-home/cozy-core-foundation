import { useMemo } from "react";
import { markdown } from "@/lib/markdown";

export default function MarkdownView({ source }: { source: string }) {
  const html = useMemo(() => markdown.render(source), [source]);
  return <div className="markdown-output" dangerouslySetInnerHTML={{ __html: html }} />;
}

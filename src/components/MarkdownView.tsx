import { useMemo } from "react";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

export default function MarkdownView({ source }: { source: string }) {
  const html = useMemo(() => md.render(source), [source]);
  return <div className="markdown-output" dangerouslySetInnerHTML={{ __html: html }} />;
}

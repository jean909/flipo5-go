'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ShareMarkdownBody({ text }: { text: string }) {
  return (
    <article className="text-sm text-theme-fg leading-relaxed rounded-xl border border-theme-border bg-theme-bg-subtle p-4 [&_a]:text-theme-accent [&_pre]:overflow-x-auto [&_pre]:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </article>
  );
}

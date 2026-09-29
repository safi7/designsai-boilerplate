'use client';

import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  // Model output is untrusted: links open safely in a new tab and never
  // carry the opener or referrer. Raw HTML is not rendered at all
  // (react-markdown escapes it unless rehype-raw is added).
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
};

/** `javascript:`/`data:` URLs from model output are neutralised. */
function safeUrl(url: string): string {
  return /^(https?:|mailto:|#|\/)/i.test(url) ? url : '';
}

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

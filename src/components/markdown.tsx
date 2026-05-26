"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

type Props = {
  content: string;
};

export function Markdown({ content }: Props) {
  return (
    <div className="markdown-body space-y-2 text-sm leading-7 text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          h1: ({ children }) => <h1 className="mt-3 text-lg font-semibold tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 text-base font-semibold tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 text-sm font-semibold tracking-tight text-foreground/90">{children}</h3>,
          h4: ({ children }) => <h4 className="mt-2 text-sm font-semibold text-foreground/80">{children}</h4>,
          p: ({ children }) => <p className="leading-7">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
          ul: ({ children }) => <ul className="my-1 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-7">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-300 pl-3 italic text-foreground/80 dark:border-emerald-700">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block whitespace-pre-wrap rounded-md bg-muted px-3 py-2 font-mono text-[12.5px] leading-6" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12.5px]" {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-[12.5px] leading-6">{children}</pre>,
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b bg-muted/60 text-left">{children}</thead>,
          th: ({ children }) => <th className="px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

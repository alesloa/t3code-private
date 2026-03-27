import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  contents: string;
}

export const MarkdownPreview = memo(function MarkdownPreview({ contents }: MarkdownPreviewProps) {
  return (
    <div className="size-full overflow-y-auto p-6">
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{contents}</ReactMarkdown>
      </div>
    </div>
  );
});

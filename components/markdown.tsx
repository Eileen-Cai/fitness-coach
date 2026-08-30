import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

/**
 * Coach replies come back as GitHub-flavoured markdown and sometimes lean on
 * inline HTML (`<br>` inside table cells, mostly). rehype-raw parses it;
 * rehype-sanitize then strips anything unsafe against GitHub's schema.
 * Rendered inside .prose-log so the styling stays in the one serif voice.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-log">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={{
          a: (props) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

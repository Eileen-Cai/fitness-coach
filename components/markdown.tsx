import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Coach replies come back as markdown (lists, tables, bold). Render them
 *  inside .prose-log so the styling stays in the training-log voice. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-log">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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

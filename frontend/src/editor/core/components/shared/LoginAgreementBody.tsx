import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Separate module so the markdown renderer stays in its own chunk: the modal
// shell renders without it and only the disclaimer text needs it.

const markdownComponents: Components = {
  // Strip react-markdown's `node` prop so it isn't spread onto the DOM element.
  a({ node, ...props }) {
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

export default function LoginAgreementBody({ content }: { content: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </Markdown>
  );
}

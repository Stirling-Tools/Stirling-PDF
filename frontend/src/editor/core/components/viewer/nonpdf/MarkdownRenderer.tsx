import React, {
  Component,
  Suspense,
  lazy,
  useState,
  type ComponentType,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@editor/ui/Button";

type MarkdownRendererImplComponent = ComponentType<{ content: string }>;

// Set once the chunk has loaded, so a block mounted after that renders markdown in
// its first commit instead of committing the raw text and swapping it out.
let loadedMarkdownRendererImpl: MarkdownRendererImplComponent | undefined;

// react-markdown + remark-gfm + micromark are ~120 KB gz and only needed when a
// markdown document is open (viewer) or a chat message arrives, so the heavy
// module is its own chunk while callers keep the synchronous signature.
const loadMarkdownRendererImpl = () =>
  import("@editor/components/viewer/nonpdf/MarkdownRendererImpl").then(
    (module) => {
      loadedMarkdownRendererImpl = module.default;
      return module;
    },
  );

/**
 * Starts loading the renderer, so markdown rendered later appears without the
 * raw-text stand-in.
 * */
export function preloadMarkdownRenderer(): void {
  if (loadedMarkdownRendererImpl) return;
  loadMarkdownRendererImpl().catch(() => undefined);
}

function rawMarkdown(content: string): React.ReactNode {
  return <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>;
}

/** Keeps a failed chunk local: the raw text stays visible instead of the app
 * boundary replacing the whole view. */
class MarkdownBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function MarkdownBlock({ content }: { content: string }) {
  const { t } = useTranslation();
  // Held here, not in the rendered chunk: a component that suspends on its
  // first render loses its state, so a lazy built inside it would be recreated
  // on every retry and suspend forever. React also caches a lazy's rejected
  // import, so the retry below swaps in a fresh one.
  const [MarkdownRendererImpl, setMarkdownRendererImpl] =
    useState<MarkdownRendererImplComponent>(
      () => loadedMarkdownRendererImpl ?? lazy(loadMarkdownRendererImpl),
    );
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div style={{ whiteSpace: "pre-wrap" }}>
        {content}
        <div style={{ marginTop: "var(--mantine-spacing-sm)" }}>
          <Button
            variant="secondary"
            onClick={() => {
              setMarkdownRendererImpl(lazy(loadMarkdownRendererImpl));
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {t("errorBoundary.tryAgain", "Try Again")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <MarkdownBoundary key={attempt} onError={() => setFailed(true)}>
      <Suspense fallback={rawMarkdown(content)}>
        <MarkdownRendererImpl content={content} />
      </Suspense>
    </MarkdownBoundary>
  );
}

/** Renders markdown; while the chunk loads the raw text shows, and if the chunk
 * fails the raw text stays with a retry control. */
export function renderMarkdown(content: string): React.ReactNode[] {
  return [<MarkdownBlock key="md" content={content} />];
}

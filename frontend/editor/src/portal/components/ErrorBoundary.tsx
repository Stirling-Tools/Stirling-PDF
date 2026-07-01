import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState } from "@shared/components";

/**
 * Default fallback for {@link ErrorBoundary}. Split into a function component so
 * it can read translations via the `useTranslation` hook, which the class-based
 * boundary cannot call directly.
 */
function DefaultErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t("errorBoundary.title")}
      description={t("errorBoundary.description")}
      actions={<Button onClick={onRetry}>{t("errorBoundary.retry")}</Button>}
    />
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback; receives a reset fn to retry the subtree. */
  fallback?: (reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains render/runtime crashes to its subtree so one failing view can never
 * white-screen the whole portal. The app shell + navigation live OUTSIDE this
 * boundary and stay interactive, so the user can always navigate away; the
 * boundary is keyed by route in App, so moving to another view clears the error.
 *
 * This is what makes running against a real backend (mocks off) safe: a page
 * that gets an unexpected/!missing response degrades to a contained error card
 * instead of taking the app down.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log for debugging; the UI itself stays contained by the fallback.
    console.error("Portal view crashed:", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.reset);
    return (
      <div style={{ padding: "2rem" }}>
        <DefaultErrorFallback onRetry={this.reset} />
      </div>
    );
  }
}

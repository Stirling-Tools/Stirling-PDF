import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mantine/core";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@app/auth";
import apiClient from "@app/services/apiClient";
import { Button } from "@app/ui/Button";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { FreeTierBalanceSummary } from "@app/components/account-link/FreeTierBalanceSummary";
import type { FreeTierBalance } from "@app/components/account-link/FreeTierBalanceSummary";
import {
  acknowledgeAccountLinkPrompt,
  clearBlockIfAllowanceRemains,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

// Lazy: the linking UI drags in the account-link context tree and the Supabase
// SDK, neither of which the notice needs until a prompt actually opens.
const loadEditorLinkModal = () =>
  import("@app/components/account-link/EditorLinkModal").then((module) => ({
    default: module.EditorLinkModal,
  }));

/**
 * Keeps a failed modal import local. The app-level boundary would otherwise
 * remount everything with the prompt already acknowledged, stranding the user
 * with no way back to linking in this tab.
 */
class LinkModalBoundary extends Component<
  { children: ReactNode; onError: () => void },
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

interface Props {
  /** Hosts without a Processor route open the connected server's billing page externally. */
  onShowOptions?: () => void;
  onManagePipeline?: (pipelineId?: string) => void;
  /** Native hosts fetch the connected server's ledger through their own HTTP client. */
  balance?: FreeTierBalance;
}

/** File failures share one explanatory linking prompt per tab session. */
export function AccountLinkNotice({
  onShowOptions,
  onManagePipeline,
  balance,
}: Props = {}) {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const { pathname } = useLocation();
  const { exhausted, promptPending, context } = useAccountLinkBlock();
  const [open, setOpen] = useState(false);
  // Held here, not in a rendered child: a component that suspends on its first
  // render loses its state, so a lazy built inside it would be recreated on
  // every retry and suspend forever. React also caches a lazy's rejected
  // import, so a retry must swap in a fresh one.
  const [EditorLinkModal, setEditorLinkModal] = useState(() =>
    lazy(loadEditorLinkModal),
  );
  const [linkAttempt, setLinkAttempt] = useState(0);
  const [linkFailed, setLinkFailed] = useState(false);
  const hasLinkDialog =
    !onShowOptions &&
    (pathname === PORTAL_BASENAME ||
      pathname.startsWith(`${PORTAL_BASENAME}/`) ||
      pathname === "/settings/billing" ||
      pathname === "/settings/account-link");
  const readsBalance =
    !onShowOptions && !hasLinkDialog && isAdmin && !loading && exhausted;
  const ledger = useQuery({
    queryKey: ["accountLink", "editorFreeTier"],
    queryFn: async ({ signal }) => {
      const { data } = await apiClient.get<FreeTierBalance>(
        "/api/v1/account-link/free-tier",
        { suppressErrorToast: true, skipAuthRedirect: true },
      );
      clearBlockIfAllowanceRemains(data, signal);
      return data;
    },
    enabled: readsBalance,
    // This only runs while a block is up, so anything cached when one appears was
    // read before it; the first read has to be fresh or it lifts the block on an
    // older answer than the one that raised it.
    staleTime: 0,
    retry: false,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!exhausted || hasLinkDialog) setOpen(false);
  }, [exhausted, hasLinkDialog]);

  useEffect(() => {
    if (hasLinkDialog || loading || !promptPending) return;
    acknowledgeAccountLinkPrompt();
    setOpen(true);
  }, [hasLinkDialog, loading, promptPending]);

  if (!open || !exhausted || hasLinkDialog) return null;

  if (linkFailed) {
    return (
      <Stack align="center" gap="sm" p="md">
        <Text size="sm" c="dimmed">
          {t(
            "portal.accountLink.notice.loadFailed",
            "The account linking dialog could not be loaded.",
          )}
        </Text>
        <Button
          variant="secondary"
          onClick={() => {
            setEditorLinkModal(lazy(loadEditorLinkModal));
            setLinkFailed(false);
            setLinkAttempt((n) => n + 1);
          }}
        >
          {t("errorBoundary.tryAgain", "Try Again")}
        </Button>
      </Stack>
    );
  }

  return (
    <LinkModalBoundary key={linkAttempt} onError={() => setLinkFailed(true)}>
      <Suspense fallback={null}>
        <EditorLinkModal
          open
          failureContext={context}
          onClose={() => setOpen(false)}
          onStart={onShowOptions}
          onManagePipeline={onManagePipeline}
          summary={
            <FreeTierBalanceSummary
              balance={
                onShowOptions
                  ? balance
                  : ledger.isSuccess
                    ? ledger.data
                    : undefined
              }
            />
          }
        />
      </Suspense>
    </LinkModalBoundary>
  );
}

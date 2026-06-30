import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Box,
  Button,
  Divider,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import apiClient from "@app/services/apiClient";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useAuth } from "@app/auth/UseSession";
import { Z_INDEX_SIGN_IN_MODAL } from "@app/styles/zIndex";

const ACCEPTED_STORAGE_KEY = "loginAgreementAccepted";

interface DisclaimerResponse {
  enabled: boolean;
  showInAnonymousMode: boolean;
  content: string;
  format: string;
}

function readJwt(): string | null {
  try {
    return localStorage.getItem("stirling_jwt");
  } catch {
    return null;
  }
}

// A value that changes on each fresh login so the agreement re-shows per login, but stays
// stable across page refreshes within the same logged-in tab session.
// Opaque, non-reversible digest so we never persist any token material. Only
// needs to change when the input changes (to re-trigger the disclaimer).
function digest(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function getLoginNonce(loginEnabled: boolean, userId?: string): string {
  if (!loginEnabled) return "anon";
  const jwt = readJwt();
  if (jwt) return `jwt:${digest(jwt)}`;
  if (userId) return `user:${userId}`;
  return "session";
}

const markdownComponents: Components = {
  // Strip react-markdown's `node` prop so it isn't spread onto the DOM element.
  a({ node, ...props }) {
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

/**
 * Blocking login agreement / disclaimer shown once per login (and once per app session in
 * anonymous mode). Text is fetched live for the user's current language; admins manage it via
 * customFiles/disclaimer/<locale>.md.
 */
export default function LoginAgreementModal() {
  const { t, i18n } = useTranslation();
  const { config } = useAppConfig();
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  const [opened, setOpened] = useState(false);
  const [content, setContent] = useState("");
  const nonceRef = useRef("anon");

  useEffect(() => {
    if (!config) return;
    // Never gate the login/auth screens themselves. pathname is a dep (not window.location) so
    // the gate re-runs when the SPA navigates from /login to / after an interactive login -
    // AppLayout stays mounted across that route change, so nothing else would re-trigger it.
    if (pathname.startsWith("/login")) return;

    const loginEnabled = config.enableLogin !== false;
    let cancelled = false;

    (async () => {
      try {
        const resp = await apiClient.get<DisclaimerResponse>(
          "/api/v1/config/login-disclaimer",
          {
            params: { lang: i18n.language },
            suppressErrorToast: true,
            skipAuthRedirect: true,
          },
        );
        const data = resp.data;
        if (cancelled || !data?.enabled) return;
        if (!loginEnabled && !data.showInAnonymousMode) return;
        if (!data.content || !data.content.trim()) return;

        const nonce = getLoginNonce(loginEnabled, user?.id);
        nonceRef.current = nonce;

        let accepted: string | null = null;
        try {
          accepted = sessionStorage.getItem(ACCEPTED_STORAGE_KEY);
        } catch {
          accepted = null;
        }
        if (accepted === nonce) return;

        setContent(data.content);
        setOpened(true);
      } catch {
        // On fetch error (unreachable/unauthorized) fail OPEN: don't block app usage on a
        // disclaimer we couldn't load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, i18n.language, user?.id, pathname]);

  const handleAccept = () => {
    try {
      sessionStorage.setItem(ACCEPTED_STORAGE_KEY, nonceRef.current);
    } catch {
      /* ignore storage errors */
    }
    setOpened(false);
  };

  const handleDecline = async () => {
    const loginEnabled = config?.enableLogin !== false;
    if (loginEnabled) {
      setOpened(false);
      try {
        await signOut();
      } catch {
        /* ignore */
      }
      window.location.assign("/login");
    } else {
      // Anonymous / desktop: best-effort close the window; if that is a no-op (web),
      // reload so the agreement re-blocks until accepted.
      window.close();
      window.location.reload();
    }
  };

  if (!opened) return null;

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      title={t("loginAgreementTitle", "Login Agreement")}
      centered
      size="lg"
      radius="md"
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      zIndex={Z_INDEX_SIGN_IN_MODAL}
    >
      <Stack>
        <ScrollArea.Autosize mah="50vh" type="auto">
          <Box px="xs">
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content}
            </Markdown>
          </Box>
        </ScrollArea.Autosize>
        <Divider />
        <Group justify="space-between" gap="sm" align="center" wrap="wrap">
          <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0 }}>
            {t(
              "loginAgreementProvider",
              "This notice is provided by your administrator, not Stirling PDF Inc.",
            )}
          </Text>
          <Group gap="sm" wrap="nowrap">
            <Button variant="default" onClick={handleDecline}>
              {t("loginAgreementDecline", "Decline")}
            </Button>
            <Button onClick={handleAccept}>
              {t("loginAgreementAccept", "Accept")}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}

import { useTranslation } from "@app/hooks/useTranslation";
import ErrorMessage from "@app/auth/ui/ErrorMessage";
import { Button } from "@app/ui/Button";
import "@app/auth/ui/auth.css";
import "@app/routes/PairDevice.css";

/** Shape of GET /api/v1/pair/lookup. All display-only, and all instance-supplied. */
export interface PendingPairing {
  userCode: string;
  name: string | null;
  version: string | null;
  address: string | null;
  requestedAt: string | null;
  expiresAt: string | null;
}

export type PairPhase = "entry" | "confirm" | "done" | "declined";

export interface PairDeviceViewProps {
  phase: PairPhase;
  code: string;
  pending: PendingPairing | null;
  busy: boolean;
  error: string | null;
  onCodeChange: (value: string) => void;
  onSubmitCode: () => void;
  onDecide: (approve: boolean) => void;
}

/**
 * Presentation for the pairing approval page. Pure, so every step is reachable
 * from props and the whole flow is covered by Storybook and the a11y scan without
 * a session or a live pairing. {@link PairDevice} supplies the data.
 */
export function PairDeviceView({
  phase,
  code,
  pending,
  busy,
  error,
  onCodeChange,
  onSubmitCode,
  onDecide,
}: PairDeviceViewProps) {
  const { t } = useTranslation();

  return (
    <div className="pair-device">
      {phase === "entry" && (
        <>
          <h1 className="pair-device__title">
            {t("pair.entry.title", "Enter your pairing code")}
          </h1>
          <p className="pair-device__sub">
            {t(
              "pair.entry.sub",
              "From the screen on the server you are connecting.",
            )}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitCode();
            }}
          >
            <label className="pair-device__label" htmlFor="pair-code">
              {t("pair.entry.label", "Pairing code")}
            </label>
            <input
              id="pair-code"
              className="pair-device__input"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="WXYZ-4821"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby={error ? "pair-error" : undefined}
            />
            {error && (
              <div id="pair-error">
                <ErrorMessage error={error} />
              </div>
            )}
            <Button
              type="submit"
              variant="primary"
              disabled={busy || code.trim().length === 0}
            >
              {t("pair.entry.submit", "Continue")}
            </Button>
          </form>
        </>
      )}

      {phase === "confirm" && pending && (
        <>
          <h1 className="pair-device__title">
            {t("pair.confirm.title", "Pair this server?")}
          </h1>
          <p className="pair-device__sub">
            {t(
              "pair.confirm.sub",
              "Check these details match the server you are connecting. If they do not, decline.",
            )}
          </p>
          <dl className="pair-device__facts">
            <dt>{t("pair.confirm.name", "Name")}</dt>
            <dd>{pending.name ?? t("pair.confirm.unnamed", "Not set")}</dd>
            <dt>{t("pair.confirm.address", "Address")}</dt>
            <dd>{pending.address ?? t("pair.confirm.unknown", "Unknown")}</dd>
            <dt>{t("pair.confirm.version", "Version")}</dt>
            <dd>{pending.version ?? t("pair.confirm.unknown", "Unknown")}</dd>
            <dt>{t("pair.confirm.code", "Code")}</dt>
            <dd>{pending.userCode}</dd>
          </dl>
          {error && <ErrorMessage error={error} />}
          <div className="pair-device__actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => onDecide(false)}
            >
              {t("pair.confirm.decline", "Decline")}
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => onDecide(true)}
            >
              {t("pair.confirm.approve", "Pair server")}
            </Button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <h1 className="pair-device__title">
            {t("pair.done.title", "Server paired")}
          </h1>
          <p className="pair-device__sub">
            {t(
              "pair.done.sub",
              "You can close this page. The server picks up the connection within a few seconds.",
            )}
          </p>
        </>
      )}

      {phase === "declined" && (
        <>
          <h1 className="pair-device__title">
            {t("pair.declined.title", "Pairing declined")}
          </h1>
          <p className="pair-device__sub">
            {t(
              "pair.declined.sub",
              "Nothing was connected. If you did not expect this code, someone may have sent it to you by mistake.",
            )}
          </p>
        </>
      )}
    </div>
  );
}

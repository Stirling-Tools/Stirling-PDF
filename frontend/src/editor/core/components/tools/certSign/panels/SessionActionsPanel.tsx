import { useState } from "react";
import { Stack, Text, Group } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { Modal } from "@app/ui/Modal";
import { StatusBadge } from "@app/ui/StatusBadge";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import type { SessionDetail } from "@app/types/signingSession";
import "@app/components/shared/signing/signingDetail.css";

interface SessionActionsPanelProps {
  session: SessionDetail;
  onFinalize: () => void;
  onLoadSignedPdf: () => void;
  finalizing: boolean;
  loadingPdf: boolean;
  disabled?: boolean;
}

export const SessionActionsPanel: React.FC<SessionActionsPanelProps> = ({
  session,
  onFinalize,
  onLoadSignedPdf,
  finalizing,
  loadingPdf,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const included = session.participants.filter((p) => p.status === "SIGNED");
  const excluded = session.participants.filter((p) => p.status !== "SIGNED");
  const allSigned = included.length > 0 && excluded.length === 0;

  return (
    <div className="signing-detail__section">
      <h3>
        {session.finalized
          ? t("signingDetail.finalDocument", "Signed document")
          : t("signingDetail.finalizeTitle", "Finalize document")}
      </h3>
      <p className="signing-detail__hint">
        {session.finalized
          ? t(
              "signingDetail.finalReady",
              "Your signed PDF is ready to open in the workbench.",
            )
          : included.length === 0
            ? t(
                "certSign.collab.finalize.requiresSignature",
                "At least one participant must sign before you can finalize.",
              )
            : allSigned
              ? t(
                  "signingDetail.allSigned",
                  "Everyone has signed. Review the document, then finalize.",
                )
              : t(
                  "signingDetail.earlyHint",
                  "You can finalize now with the signatures received, or wait for the remaining participants.",
                )}
      </p>
      {session.finalized ? (
        <Button
          leftSection={<Icon name="folder-open" size={18} />}
          fullWidth
          onClick={onLoadSignedPdf}
          loading={loadingPdf}
        >
          {t(
            "certSign.collab.sessionDetail.loadSignedPdf",
            "Load Signed PDF into Active Files",
          )}
        </Button>
      ) : (
        <>
          <Button
            leftSection={<Icon name="circle-check" size={18} />}
            fullWidth
            onClick={() => setConfirming(true)}
            disabled={included.length === 0 || disabled}
            loading={finalizing}
          >
            {allSigned
              ? t(
                  "certSign.collab.finalize.button",
                  "Finalize and Load Signed PDF",
                )
              : t(
                  "certSign.collab.finalize.early",
                  "Finalize with Current Signatures",
                )}
          </Button>
          <Modal
            open={confirming}
            onClose={() => setConfirming(false)}
            title={t(
              "certSign.collab.finalize.confirmTitle",
              "Finalize this signing session?",
            )}
            subtitle={session.documentName}
            footer={
              <Group justify="flex-end">
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel", "Cancel")}
                </Button>
                <Button
                  disabled={included.length === 0 || disabled || finalizing}
                  onClick={() => {
                    setConfirming(false);
                    onFinalize();
                  }}
                >
                  {t(
                    "certSign.collab.finalize.confirmAction",
                    "Confirm and finalize",
                  )}
                </Button>
              </Group>
            }
          >
            <Stack gap="lg">
              <Text size="sm">
                {t(
                  "certSign.collab.finalize.confirmDescription",
                  "Finalizing closes this session. No more signatures can be submitted.",
                )}
              </Text>
              <section className="signing-finalize__group">
                <StatusBadge tone="success">
                  {t(
                    "certSign.collab.finalize.included",
                    "Signatures included",
                  )}{" "}
                  · {included.length}
                </StatusBadge>
                <ul className="signing-finalize__list">
                  {included.map((p) => (
                    <li key={p.id}>
                      <Icon
                        name="circle-check"
                        size={16}
                        style={{ color: "var(--c-success)" }}
                      />
                      <span>{p.name || p.email}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {excluded.length > 0 && (
                <section className="signing-finalize__group">
                  <Text size="sm" fw={600}>
                    {t(
                      "certSign.collab.finalize.excluded",
                      "Participants whose signatures will not be included",
                    )}
                  </Text>
                  <ul className="signing-finalize__list">
                    {excluded.map((p) => (
                      <li key={p.id}>
                        <Icon
                          name={p.status === "DECLINED" ? "circle-x" : "clock"}
                          size={16}
                          style={{ color: "var(--c-text-muted)" }}
                        />
                        <span>
                          {p.name || p.email} —{" "}
                          {p.status === "DECLINED"
                            ? t("certSign.declined", "Declined")
                            : t("certSign.pending", "Pending")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </Stack>
          </Modal>
        </>
      )}
    </div>
  );
};

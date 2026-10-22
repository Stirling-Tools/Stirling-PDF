import { Trans, useTranslation } from "react-i18next";
import type { OwnershipTransferFlow } from "@app/components/shared/ownership/useOwnershipTransfer";
import { Checkbox, Tooltip } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

/** Shows the scope before consent, or the remaining local step after cloud ownership commits. */
export function OwnershipTransferReview({
  flow,
}: {
  flow: OwnershipTransferFlow;
}) {
  const { t } = useTranslation();
  const {
    status,
    editing,
    needsMember,
    partial,
    ownerAccount,
    local,
    accepted,
    setAccepted,
  } = flow;
  return (
    <>
      {status && !editing && !needsMember && (
        <>
          {partial ? (
            <div className="ownership-flow__notice" role="status">
              {t(
                "ownership.partialError",
                "Cloud ownership has transferred. Finish the server transfer to keep both owners aligned.",
              )}
            </div>
          ) : (
            <>
              <div className="ownership-flow__summary">
                {status.cloud && (
                  <>
                    <p>
                      <Trans
                        t={t}
                        i18nKey="ownership.cloudScopeStyled"
                        defaults="<user>{{name}}</user> will manage {{team}}, its members and billing."
                        values={{
                          name: ownerAccount,
                          team: status.cloud.teamName,
                        }}
                        components={{
                          user: <strong className="ownership-flow__username" />,
                        }}
                      />
                    </p>
                    <div className="ownership-flow__detail">
                      <span>
                        {t(
                          "ownership.billingUnchanged",
                          "Subscription and billing stay in place",
                        )}
                      </span>
                      <Tooltip
                        multiline
                        w={300}
                        zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                        events={{ hover: true, focus: true, touch: true }}
                        label={t(
                          "ownership.billing",
                          "The subscription, wallet, payment method and existing licenses stay in place. Billing contact details do not change automatically.",
                        )}
                      >
                        <ActionIcon
                          variant="quiet"
                          size="sm"
                          aria-label={t(
                            "ownership.billingDetails",
                            "Billing details",
                          )}
                        >
                          <Icon name="info" size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </div>
                    {status.cloud.linkedInstances > 1 && (
                      <div className="ownership-flow__detail">
                        <span>
                          {t(
                            "ownership.linkedServerCount",
                            "{{count}} linked servers",
                            { count: status.cloud.linkedInstances },
                          )}
                        </span>
                        <Tooltip
                          multiline
                          w={300}
                          zIndex={Z_INDEX_OVER_CONFIG_MODAL + 2}
                          events={{
                            hover: true,
                            focus: true,
                            touch: true,
                          }}
                          label={t(
                            "ownership.instances",
                            "This team has {{count}} linked servers. Their cloud billing stays with this team; other servers' local owners do not change.",
                            { count: status.cloud.linkedInstances },
                          )}
                        >
                          <ActionIcon
                            variant="quiet"
                            size="sm"
                            aria-label={t(
                              "ownership.serverDetails",
                              "Linked server details",
                            )}
                          >
                            <Icon name="info" size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </div>
                    )}
                    <p className="ownership-flow__muted">
                      {t(
                        "ownership.yourCloudAccess",
                        "You'll become a team member and lose owner access.",
                      )}
                    </p>
                  </>
                )}
                {local && (
                  <p>
                    {t(
                      "ownership.localScope",
                      "They will own this server and manage billing and cloud connections. You keep administrator access, but lose access to those settings.",
                    )}
                  </p>
                )}
              </div>
              <Checkbox
                checked={accepted}
                onChange={(event) => setAccepted(event.currentTarget.checked)}
                label={t(
                  "ownership.confirm",
                  "I understand the access and ownership changes.",
                )}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

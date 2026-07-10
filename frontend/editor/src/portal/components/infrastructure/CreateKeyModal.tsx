import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  CodeBlock,
  FormField,
  Input,
  Modal,
  RadioGroup,
  type RadioOption,
} from "@app/ui";
import {
  createApiKey,
  type ApiKeyScope,
  type CreatedApiKey,
} from "@portal/api/infrastructure";
import { errorMessage } from "@portal/api/http";

export function CreateKeyModal({
  open,
  onClose,
  canCreateTeamKeys,
  teamName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Whether the caller (a team leader / admin) may mint team-scoped keys. */
  canCreateTeamKeys: boolean;
  /** Team those keys would belong to, for the option descriptions. */
  teamName: string | null;
  /** Called after a successful create so the tab can refresh its list. */
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("personal");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setScope("personal");
    setCreated(null);
    setSubmitting(false);
    setError(null);
  }

  function close() {
    onClose();
    // Defer reset so the modal doesn't flash empty during its close transition.
    setTimeout(reset, 200);
  }

  async function createKey() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await createApiKey({ name: name.trim(), scope });
      setCreated(result);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const teamLabel = teamName ?? t("portal.infrastructure.createKey.yourTeam");
  const scopeOptions: RadioOption<ApiKeyScope>[] = [
    {
      value: "personal",
      label: t("portal.infrastructure.createKey.scopePersonal"),
      description: t("portal.infrastructure.createKey.scopePersonalHelp"),
    },
    {
      value: "team-members",
      label: t("portal.infrastructure.createKey.scopeTeamMembers"),
      description: t("portal.infrastructure.createKey.scopeTeamMembersHelp", {
        team: teamLabel,
      }),
      disabled: !canCreateTeamKeys,
    },
    {
      value: "team-lead",
      label: t("portal.infrastructure.createKey.scopeTeamLead"),
      description: t("portal.infrastructure.createKey.scopeTeamLeadHelp", {
        team: teamLabel,
      }),
      disabled: !canCreateTeamKeys,
    },
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      width="md"
      title={
        created
          ? t("portal.infrastructure.createKey.titleCreated")
          : t("portal.infrastructure.createKey.title")
      }
      subtitle={
        created
          ? t("portal.infrastructure.createKey.subtitleCreated")
          : t("portal.infrastructure.createKey.subtitle")
      }
      footer={
        created ? (
          <Button variant="primary" accent="premium" onClick={close}>
            {t("portal.infrastructure.createKey.done")}
          </Button>
        ) : (
          <div className="portal-infra__modal-actions">
            <Button variant="tertiary" onClick={close}>
              {t("portal.infrastructure.createKey.cancel")}
            </Button>
            <Button
              variant="primary"
              accent="premium"
              disabled={name.trim() === "" || submitting}
              onClick={createKey}
            >
              {t("portal.infrastructure.createKey.createKey")}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="portal-infra__stack">
          <CodeBlock
            code={created.secret}
            lang="bash"
            caption={t("portal.infrastructure.createKey.secretKeyCaption")}
          />
          <Banner
            tone="warning"
            description={t("portal.infrastructure.createKey.secretWarning")}
          />
        </div>
      ) : (
        <div className="portal-infra__form">
          {error && <Banner tone="danger" description={error} />}

          <FormField
            label={t("portal.infrastructure.createKey.keyNameLabel")}
            required
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t(
                "portal.infrastructure.createKey.keyNamePlaceholder",
              )}
            />
          </FormField>

          <FormField label={t("portal.infrastructure.createKey.scopeLabel")}>
            <div className="portal-infra__stack">
              <RadioGroup<ApiKeyScope>
                name="apiKeyScope"
                value={scope}
                onChange={setScope}
                options={scopeOptions}
              />
              {!canCreateTeamKeys && (
                <p className="portal-infra__muted">
                  {t("portal.infrastructure.createKey.teamScopeLeaderOnly")}
                </p>
              )}
            </div>
          </FormField>
        </div>
      )}
    </Modal>
  );
}

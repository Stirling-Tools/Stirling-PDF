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
  type ApiKeyAccess,
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
  const [access, setAccess] = useState<ApiKeyAccess>("full");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A shared (team) key can only ever be processing-only; full access is never sharable.
  const isTeamScope = scope !== "personal";
  const effectiveAccess: ApiKeyAccess = isTeamScope ? "processing" : access;

  function changeScope(next: ApiKeyScope) {
    setScope(next);
    if (next !== "personal") {
      setAccess("processing");
    }
  }

  function reset() {
    setName("");
    setScope("personal");
    setAccess("full");
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
      const result = await createApiKey({
        name: name.trim(),
        scope,
        access: effectiveAccess,
      });
      setCreated(result);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  const teamLabel = teamName ?? t("portal.infrastructure.createKey.yourTeam");
  const accessOptions: RadioOption<ApiKeyAccess>[] = [
    {
      value: "full",
      label: t("portal.infrastructure.createKey.accessFull"),
      description: t("portal.infrastructure.createKey.accessFullHelp"),
      disabled: isTeamScope,
    },
    {
      value: "processing",
      label: t("portal.infrastructure.createKey.accessProcessing"),
      description: t("portal.infrastructure.createKey.accessProcessingHelp"),
    },
  ];
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
          <Button variant="primary" onClick={close}>
            {t("portal.infrastructure.createKey.done")}
          </Button>
        ) : (
          <div className="portal-infra__modal-actions">
            <Button variant="tertiary" onClick={close}>
              {t("portal.infrastructure.createKey.cancel")}
            </Button>
            <Button
              variant="primary"
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
                onChange={changeScope}
                options={scopeOptions}
              />
              {!canCreateTeamKeys && (
                <p className="portal-infra__muted">
                  {t("portal.infrastructure.createKey.teamScopeLeaderOnly")}
                </p>
              )}
            </div>
          </FormField>

          <FormField label={t("portal.infrastructure.createKey.accessLabel")}>
            <div className="portal-infra__stack">
              <RadioGroup<ApiKeyAccess>
                name="apiKeyAccess"
                value={effectiveAccess}
                onChange={setAccess}
                options={accessOptions}
              />
              {isTeamScope && (
                <p className="portal-infra__muted">
                  {t("portal.infrastructure.createKey.accessTeamNote")}
                </p>
              )}
            </div>
          </FormField>
        </div>
      )}
    </Modal>
  );
}

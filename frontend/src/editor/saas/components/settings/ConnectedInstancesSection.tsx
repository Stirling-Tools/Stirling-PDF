import { useId, useState } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import apiClient from "@app/services/apiClient";
import type { LinkedInstanceRow } from "@app/types/linkedInstance";
import { Banner, Button, EmptyState, Input, Modal, Skeleton } from "@app/ui";
import { ConnectedInstanceRow } from "@app/components/settings/ConnectedInstanceRow";
import { AccountConnectionLayout } from "@app/components/settings/AccountConnectionLayout";

const BASE = "/api/v1/account-link/instances";

function InstanceList({ userId, teamId }: { userId: string; teamId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const queryKey = ["connected-instances", userId, teamId];
  const [selected, setSelected] = useState<LinkedInstanceRow | null>(null);
  const [removedName, setRemovedName] = useState<string | null>(null);
  const [editing, setEditing] = useState<LinkedInstanceRow | null>(null);
  const [name, setName] = useState("");
  const nameFormId = useId();
  const instances = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const response = await apiClient.get<LinkedInstanceRow[]>(BASE, {
        signal,
        suppressErrorToast: true,
      });
      return response.data;
    },
    retry: false,
  });
  const removal = useMutation({
    mutationFn: async (instance: LinkedInstanceRow) => {
      await apiClient.post(`${BASE}/${instance.instanceId}/revoke`, undefined, {
        suppressErrorToast: true,
      });
    },
    onSuccess: async (_, instance) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<LinkedInstanceRow[]>(queryKey, (rows) =>
        rows?.map((row) =>
          row.instanceId === instance.instanceId
            ? { ...row, revoked: true }
            : row,
        ),
      );
      setSelected(null);
      setRemovedName(
        instance.name ??
          t("portal.accountLink.instances.unnamed", "Unnamed instance"),
      );
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const rename = useMutation({
    mutationFn: async ({
      instance,
      name,
    }: {
      instance: LinkedInstanceRow;
      name: string | null;
    }) => {
      await apiClient.patch(
        `${BASE}/${instance.instanceId}`,
        { name },
        { suppressErrorToast: true },
      );
    },
    onSuccess: async (_, { instance, name }) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<LinkedInstanceRow[]>(queryKey, (rows) =>
        rows?.map((row) =>
          row.instanceId === instance.instanceId ? { ...row, name } : row,
        ),
      );
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const connected =
    instances.data?.filter((instance) => !instance.revoked) ?? [];
  const forbidden =
    isAxiosError(instances.error) && instances.error.response?.status === 403;
  const removalForbidden =
    isAxiosError(removal.error) && removal.error.response?.status === 403;
  const renameForbidden =
    isAxiosError(rename.error) && rename.error.response?.status === 403;
  const closeRename = () => {
    if (rename.isPending) return;
    setEditing(null);
    rename.reset();
  };

  const close = () => {
    if (removal.isPending) return;
    setSelected(null);
    removal.reset();
  };

  return (
    <>
      {removedName && (
        <Banner tone="success">
          {t(
            "settings.connectedInstances.removedSuccess",
            "{{name}} has been disconnected from your team.",
            { name: removedName },
          )}
        </Banner>
      )}
      {instances.isPending ? (
        <div
          role="status"
          aria-label={t(
            "settings.connectedInstances.loading",
            "Loading connected instances",
          )}
        >
          <Skeleton height="8rem" />
        </div>
      ) : instances.isError ? (
        <Banner
          tone="danger"
          title={t(
            "settings.connectedInstances.loadError",
            "Couldn’t load connected instances",
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void instances.refetch()}
              loading={instances.isFetching}
            >
              {t("settings.connectedInstances.retry", "Try again")}
            </Button>
          }
        >
          {forbidden
            ? t(
                "settings.connectedInstances.ownerOnly",
                "Only the team owner can manage connected instances.",
              )
            : t(
                "settings.connectedInstances.loadErrorBody",
                "Your connections could not be checked. Try again.",
              )}
        </Banner>
      ) : (
        <>
          {connected.length === 0 ? (
            <EmptyState
              size="compact"
              title={t(
                "settings.connectedInstances.empty",
                "No connected instances",
              )}
              description={t(
                "settings.connectedInstances.connectHelp",
                "To connect a server, open Settings → Account connection on your self-hosted instance and follow the connection steps.",
              )}
            />
          ) : (
            <ul className="account-connection__list">
              {connected.map((instance) => (
                <ConnectedInstanceRow
                  key={instance.instanceId}
                  instance={instance}
                  busy={removal.isPending || rename.isPending}
                  onRemove={() => {
                    removal.reset();
                    setSelected(instance);
                  }}
                  onRename={() => {
                    rename.reset();
                    setEditing(instance);
                    setName(instance.name ?? "");
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <Modal
        open={selected !== null}
        onClose={close}
        width="sm"
        title={t(
          "settings.connectedInstances.confirmTitle",
          "Remove {{name}}?",
          {
            name:
              selected?.name ??
              t("portal.accountLink.instances.unnamed", "Unnamed instance"),
          },
        )}
        disableBackdropClose={removal.isPending}
        disableEscapeClose={removal.isPending}
        footer={
          <div className="account-connection__actions">
            <Button
              variant="secondary"
              onClick={close}
              disabled={removal.isPending}
              data-autofocus
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              loading={removal.isPending}
              onClick={() => {
                if (selected && !removal.isPending) removal.mutate(selected);
              }}
            >
              {t("settings.connectedInstances.remove", "Remove connection")}
            </Button>
          </div>
        }
      >
        <p>
          {t(
            "settings.connectedInstances.confirmBody",
            "This revokes the instance’s access to your team in Stirling Cloud. It does not delete local files or remove usage already recorded. To connect again, follow the original connection steps on the instance.",
          )}
        </p>
        {removal.isError && (
          <Banner tone="danger">
            {removalForbidden
              ? t(
                  "settings.connectedInstances.ownerOnly",
                  "Only the team owner can manage connected instances.",
                )
              : t(
                  "settings.connectedInstances.removeError",
                  "Couldn’t remove the connection. Try again.",
                )}
          </Banner>
        )}
      </Modal>
      <Modal
        open={editing !== null}
        onClose={closeRename}
        width="sm"
        title={t("settings.connectedInstances.editName", "Edit name")}
        disableBackdropClose={rename.isPending}
        disableEscapeClose={rename.isPending}
        footer={
          <div className="account-connection__actions">
            <Button
              variant="secondary"
              onClick={closeRename}
              disabled={rename.isPending}
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              type="submit"
              form={nameFormId}
              loading={rename.isPending}
              disabled={name.trim() === (editing?.name ?? "")}
            >
              {t("settings.connectedInstances.saveName", "Save name")}
            </Button>
          </div>
        }
      >
        <form
          id={nameFormId}
          onSubmit={(event) => {
            event.preventDefault();
            if (editing && !rename.isPending)
              rename.mutate({ instance: editing, name: name.trim() || null });
          }}
          className="account-connection__name-form"
        >
          <label htmlFor={`${nameFormId}-input`}>
            {t(
              "settings.connectedInstances.displayName",
              "Display name (optional)",
            )}
          </label>
          <Input
            id={`${nameFormId}-input`}
            value={name}
            maxLength={255}
            onChange={(event) => setName(event.target.value)}
            disabled={rename.isPending}
            data-autofocus
          />
        </form>
        {rename.isError && (
          <Banner tone="danger">
            {renameForbidden
              ? t(
                  "settings.connectedInstances.ownerOnly",
                  "Only the team owner can manage connected instances.",
                )
              : t(
                  "settings.connectedInstances.renameError",
                  "Couldn’t save the name. Try again.",
                )}
          </Banner>
        )}
      </Modal>
    </>
  );
}

/** Owner-only cloud management; no access to a linked self-hosted server is required. */
export default function ConnectedInstancesSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentTeam, isTeamLeader, loading } = useSaaSTeam();

  return (
    <AccountConnectionLayout
      title={t("settings.connectedInstances.title", "Connected instances")}
      description={t(
        "settings.connectedInstances.subtitle",
        "Manage the self-hosted servers connected to your team.",
      )}
    >
      {loading ? (
        <Skeleton height="8rem" />
      ) : !user || !isTeamLeader || !currentTeam ? (
        <EmptyState
          size="compact"
          title={t(
            "settings.connectedInstances.ownerOnly",
            "Only the team owner can manage connected instances.",
          )}
        />
      ) : (
        <>
          <section className="account-connection__team">
            <span className="account-connection__eyebrow">
              {t("settings.connectedInstances.yourTeam", "Your team")}
            </span>
            <h2>{currentTeam.name}</h2>
            <p>
              {t(
                "settings.connectedInstances.teamNote",
                "These instances share your team’s processing allowance.",
              )}
            </p>
          </section>
          <section
            className="account-connection__body"
            aria-label={t(
              "settings.connectedInstances.title",
              "Connected instances",
            )}
          >
            <InstanceList
              key={`${user.id}:${currentTeam.teamId}`}
              userId={user.id}
              teamId={currentTeam.teamId}
            />
          </section>
        </>
      )}
    </AccountConnectionLayout>
  );
}

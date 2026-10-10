import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Group, Loader, Paper, Stack, Text } from "@mantine/core";
import { column, DataTable, type DataTableColumn } from "@app/ui";
import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import frontendLicenses from "../../../../../assets/3rdPartyLicenses.json"; // oxlint-disable-line no-restricted-imports -- asset lives outside @app alias root

interface Dependency {
  moduleName?: string;
  moduleUrl?: string;
  moduleVersion?: string;
  moduleLicense?: string;
  moduleLicenseUrl?: string;
}

interface LicensesResponse {
  dependencies?: Dependency[];
}

interface LicensesSectionBodyProps {
  dependencies: Dependency[];
}

const getModuleUrl = (dependency: Dependency) =>
  dependency.moduleUrl || dependency.moduleLicenseUrl;

function LicensesSectionBody({ dependencies }: LicensesSectionBodyProps) {
  const { t } = useTranslation();
  const sortedDependencies = useMemo(
    () =>
      [...dependencies].sort((a, b) =>
        (a.moduleName || "").localeCompare(b.moduleName || ""),
      ),
    [dependencies],
  );

  const getDependencyKey = (dependency: Dependency) =>
    [
      dependency.moduleName ?? "module",
      dependency.moduleVersion ?? "version",
      dependency.moduleUrl ?? "url",
    ].join(":");

  const columns = useMemo<DataTableColumn<Dependency>[]>(
    () => [
      column.text({
        key: "module",
        header: t("settings.licenses.module", "Module"),
        get: (d) => d.moduleName || "-",
        sortable: true,
      }),
      column.muted({
        key: "version",
        header: t("settings.licenses.version", "Version"),
        get: (d) => d.moduleVersion,
        placeholder: "-",
        sortable: true,
      }),
      column.text({
        key: "license",
        header: t("settings.licenses.license", "License"),
        get: (d) => d.moduleLicense || "-",
        sortable: true,
      }),
      column.links({
        key: "links",
        get: (d) => {
          const linksList: { label: string; href: string }[] = [];
          const moduleUrl = getModuleUrl(d);
          if (moduleUrl) {
            linksList.push({
              label: t("settings.licenses.project", "Project"),
              href: moduleUrl,
            });
          }
          if (d.moduleLicenseUrl && d.moduleLicenseUrl !== moduleUrl) {
            linksList.push({
              label: t("settings.licenses.license", "License"),
              href: d.moduleLicenseUrl,
            });
          }
          return linksList;
        },
      }),
    ],
    [t],
  );

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Text fw={600} size="sm">
                {t("settings.licenses.listTitle", "Bundled dependencies")}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(
                  "settings.licenses.listDescription",
                  "The list is shown directly in the UI from the release bundle or backend endpoint.",
                )}
              </Text>
            </div>
          </Group>

          <DataTable
            columns={columns}
            rows={sortedDependencies}
            rowKey={getDependencyKey}
            empty={t("settings.licenses.empty", "No dependencies found.")}
            defaultSort={{ key: "module", direction: "asc" }}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

export function BackendThirdPartyLicensesSection() {
  const { t } = useTranslation();
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLicenses = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.get<LicensesResponse>(
          "/api/v1/ui-data/licenses",
          { suppressErrorToast: true },
        );
        setDependencies(response.data?.dependencies ?? []);
      } catch (err: unknown) {
        setError(
          isAxiosError(err)
            ? err.response?.data?.message || err.message
            : t(
                "settings.licenses.loadError",
                "Failed to load third-party licenses",
              ),
        );
      } finally {
        setLoading(false);
      }
    };

    void loadLicenses();
  }, [t]);

  if (loading) {
    return (
      <Stack align="center" justify="center" h={200}>
        <Loader size="lg" />
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="lg">
        <Alert color="red" title={t("admin.error", "Error")}>
          {error}
        </Alert>
      </Stack>
    );
  }

  return <LicensesSectionBody dependencies={dependencies} />;
}

export function FrontendThirdPartyLicensesSection() {
  const dependencies =
    (frontendLicenses as LicensesResponse).dependencies ?? [];

  return <LicensesSectionBody dependencies={dependencies} />;
}

export default function ThirdPartyLicensesSection() {
  return <BackendThirdPartyLicensesSection />;
}

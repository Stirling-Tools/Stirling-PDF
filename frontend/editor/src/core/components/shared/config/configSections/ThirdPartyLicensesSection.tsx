import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Anchor,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
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

          <Table
            highlightOnHover
            withRowBorders
            verticalSpacing="sm"
            horizontalSpacing="md"
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("settings.licenses.module", "Module")}</Table.Th>
                <Table.Th>{t("settings.licenses.version", "Version")}</Table.Th>
                <Table.Th>{t("settings.licenses.license", "License")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedDependencies.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={3}>
                    <Text ta="center" c="dimmed" py="xl">
                      {t("settings.licenses.empty", "No dependencies found.")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                sortedDependencies.map((dependency) => (
                  <Table.Tr key={getDependencyKey(dependency)}>
                    <Table.Td>
                      {getModuleUrl(dependency) ? (
                        <Anchor
                          href={getModuleUrl(dependency)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {dependency.moduleName || "-"}
                        </Anchor>
                      ) : (
                        <Text size="sm">{dependency.moduleName || "-"}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {dependency.moduleVersion || "-"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {dependency.moduleLicenseUrl ? (
                        <Anchor
                          href={dependency.moduleLicenseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {dependency.moduleLicense || "-"}
                        </Anchor>
                      ) : (
                        <Text size="sm">{dependency.moduleLicense || "-"}</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
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

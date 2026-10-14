import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Anchor,
  Group,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isAxiosError } from "axios";
import apiClient from "@app/services/apiClient";
import frontendLicenses from "../../../../../assets/3rdPartyLicenses.json"; // oxlint-disable-line no-restricted-imports -- asset lives outside @app alias root

interface Dependency {
  moduleName?: string;
  moduleUrl?: string;
  moduleVersion?: string;
  moduleLicense?: string;
  moduleLicenseUrl?: string;
  moduleLicenseText?: string;
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

  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const filteredDependencies = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return sortedDependencies;
    }
    return sortedDependencies.filter((dependency) =>
      [
        dependency.moduleName,
        dependency.moduleVersion,
        dependency.moduleLicense,
      ].some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [sortedDependencies, query]);

  // Native notices add dozens of rows per jar, so only mount the visible slice.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: filteredDependencies.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const topPad = virtualItems[0]?.start ?? 0;
  const bottomPad =
    virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0);

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
              <Text size="xs" c="dimmed" mt={4}>
                {t("settings.licenses.showingCount", "{{count}} dependencies", {
                  count: filteredDependencies.length,
                })}
              </Text>
            </div>
          </Group>
          <TextInput
            placeholder={t(
              "settings.licenses.searchPlaceholder",
              "Search dependencies",
            )}
            aria-label={t(
              "settings.licenses.searchPlaceholder",
              "Search dependencies",
            )}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />

          <ScrollArea h={480} viewportRef={scrollRef}>
            <Table
              highlightOnHover
              withRowBorders
              verticalSpacing="sm"
              horizontalSpacing="md"
              stickyHeader
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("settings.licenses.module", "Module")}</Table.Th>
                  <Table.Th>
                    {t("settings.licenses.version", "Version")}
                  </Table.Th>
                  <Table.Th>
                    {t("settings.licenses.license", "License")}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredDependencies.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text ta="center" c="dimmed" py="xl">
                        {t("settings.licenses.empty", "No dependencies found.")}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  <>
                    {topPad > 0 && (
                      <Table.Tr key="spacer-top">
                        <Table.Td
                          colSpan={3}
                          style={{ height: topPad, padding: 0, border: 0 }}
                        />
                      </Table.Tr>
                    )}
                    {virtualItems.map((virtualRow) => {
                      const dependency = filteredDependencies[virtualRow.index];
                      if (!dependency) {
                        return null;
                      }
                      return (
                        <VirtualLicenseRow
                          key={`${getDependencyKey(dependency)}:${virtualRow.index}`}
                          dependency={dependency}
                          index={virtualRow.index}
                          measureElement={virtualizer.measureElement}
                        />
                      );
                    })}
                    {bottomPad > 0 && (
                      <Table.Tr key="spacer-bottom">
                        <Table.Td
                          colSpan={3}
                          style={{ height: bottomPad, padding: 0, border: 0 }}
                        />
                      </Table.Tr>
                    )}
                  </>
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Paper>
    </Stack>
  );
}

function LicenseCell({ dependency }: { dependency: Dependency }) {
  const [opened, setOpened] = useState(false);
  if (dependency.moduleLicenseText) {
    return (
      <>
        <Anchor component="button" onClick={() => setOpened(true)}>
          {dependency.moduleLicense || "-"}
        </Anchor>
        <Modal
          opened={opened}
          onClose={() => setOpened(false)}
          title={dependency.moduleName || "-"}
          size="lg"
        >
          <ScrollArea.Autosize mah={420}>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
              {dependency.moduleLicenseText}
            </Text>
          </ScrollArea.Autosize>
        </Modal>
      </>
    );
  }
  return dependency.moduleLicenseUrl ? (
    <Anchor
      href={dependency.moduleLicenseUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {dependency.moduleLicense || "-"}
    </Anchor>
  ) : (
    <Text size="sm">{dependency.moduleLicense || "-"}</Text>
  );
}

function VirtualLicenseRow({
  dependency,
  index,
  measureElement,
}: {
  dependency: Dependency;
  index: number;
  measureElement: (element: HTMLTableRowElement | null) => void;
}) {
  return (
    <Table.Tr data-index={index} ref={measureElement}>
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
        <LicenseCell dependency={dependency} />
      </Table.Td>
    </Table.Tr>
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

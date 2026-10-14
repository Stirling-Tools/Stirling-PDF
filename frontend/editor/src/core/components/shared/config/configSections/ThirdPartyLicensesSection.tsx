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
import {
  dedupeDependencies,
  resolveAboutLinks,
  resolveLicenseDisplay,
  resolveModuleLicenseUrl,
  resolveModuleUrl,
} from "@app/components/shared/config/configSections/licenseDisplay";
import type {
  DependencyRow,
  LicenseAboutLink,
} from "@app/components/shared/config/configSections/licenseDisplay";

export interface Dependency {
  moduleName?: string;
  moduleUrl?: string;
  moduleVersion?: string;
  moduleLicense?: string;
  moduleLicenseUrl?: string;
  /** Full license text the backend parsed from a bundled notice file. Present on native-component entries; generated-report entries carry moduleLicenseUrl instead. */
  moduleLicenseText?: string;
}

interface LicensesResponse {
  dependencies?: Dependency[];
}

interface LicensesSectionBodyProps {
  dependencies: Dependency[];
}

function LicensesSectionBody({ dependencies }: LicensesSectionBodyProps) {
  const { t } = useTranslation();
  const sortedDependencies = useMemo(
    () => dedupeDependencies(dependencies),
    [dependencies],
  );

  const [selected, setSelected] = useState<DependencyRow | null>(null);

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
    // Ordinal row IDs stay valid however filtering reshuffles indexes.
    getItemKey: (index) =>
      filteredDependencies[index]?.rowId ?? `license-index-${index}`,
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

          <div
            ref={scrollRef}
            style={{ height: 480, overflowY: "auto", overflowX: "auto" }}
          >
            <Table
              highlightOnHover
              withRowBorders
              verticalSpacing="sm"
              horizontalSpacing="md"
              stickyHeader
              // Collapsed borders disable thead stickiness, so the header
              // scrolls away; separate with zero spacing renders identically.
              // Fixed layout pins column widths to the header cells, so
              // filtering and virtualization cannot shift them around.
              style={{
                borderCollapse: "separate",
                borderSpacing: 0,
                tableLayout: "fixed",
              }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: "40%" }}>
                    {t("settings.licenses.module", "Module")}
                  </Table.Th>
                  <Table.Th style={{ width: "15%" }}>
                    {t("settings.licenses.version", "Version")}
                  </Table.Th>
                  <Table.Th style={{ width: "45%" }}>
                    {t("settings.licenses.license", "License")}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredDependencies.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={3}>
                      <Text ta="center" c="dimmed" py="xl">
                        {dependencies.length === 0
                          ? t(
                              "settings.licenses.empty",
                              "No dependencies found.",
                            )
                          : t(
                              "settings.licenses.noMatch",
                              "No matching dependencies.",
                            )}
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
                          key={dependency.rowId}
                          dependency={dependency}
                          index={virtualRow.index}
                          onSelect={setSelected}
                          measureRef={virtualizer.measureElement}
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
          </div>
          <LicenseModal
            dependency={selected}
            onClose={() => setSelected(null)}
          />
        </Stack>
      </Paper>
    </Stack>
  );
}

const SPDX_LICENSE_PAGE = "https://spdx.org/licenses";

function AboutLink({
  spdxId,
  short,
  text,
}: {
  spdxId: string;
  short: string;
  text?: string;
}) {
  const { t } = useTranslation();
  return (
    <Anchor
      href={`${SPDX_LICENSE_PAGE}/${spdxId}.html`}
      target="_blank"
      rel="noopener noreferrer"
      size="xs"
      c="dimmed"
      title={t("settings.licenses.licenseAboutTitle", "About {{short}}", {
        short,
      })}
    >
      {text ?? t("settings.licenses.licenseAbout", "About")}
    </Anchor>
  );
}

// A dual-licensed row keeps its full label and gets one explainer link per
// known part, so neither alternative hides behind the other.
function AboutLinks({ links }: { links: LicenseAboutLink[] }) {
  const { t } = useTranslation();
  if (links.length === 0) {
    return null;
  }
  if (links.length === 1) {
    return <AboutLink spdxId={links[0].spdxId} short={links[0].short} />;
  }
  return (
    <>
      {links.map((link, index) => (
        <span key={link.spdxId}>
          {index > 0 ? (
            <Text size="xs" c="dimmed" span>
              {" · "}
            </Text>
          ) : null}
          <AboutLink
            spdxId={link.spdxId}
            short={link.short}
            text={t(
              "settings.licenses.licenseAboutCompound",
              "About {{short}}",
              { short: link.short },
            )}
          />
        </span>
      ))}
    </>
  );
}

function LicenseCell({
  dependency,
  onSelect,
}: {
  dependency: DependencyRow;
  onSelect: (dependency: DependencyRow) => void;
}) {
  const full = dependency.moduleLicense || "-";
  const display = resolveLicenseDisplay(
    dependency.moduleLicense,
    dependency.moduleName,
  );
  const links = resolveAboutLinks(display);
  if (dependency.moduleLicenseText) {
    return (
      <span>
        <Anchor
          component="button"
          onClick={() => onSelect(dependency)}
          truncate="end"
          maw={240}
          title={full}
        >
          {display.short}
        </Anchor>
        {links.length > 0 ? (
          <Text size="xs" c="dimmed" span>
            {" "}
            ·{" "}
          </Text>
        ) : null}
        <AboutLinks links={links} />
      </span>
    );
  }
  const licenseHref = resolveModuleLicenseUrl(dependency);
  return licenseHref ? (
    <span>
      <Anchor
        href={licenseHref}
        target="_blank"
        rel="noopener noreferrer"
        truncate="end"
        maw={240}
        title={full}
      >
        {display.short}
      </Anchor>
      {links.length > 0 ? (
        <Text size="xs" c="dimmed" span>
          {" "}
          ·{" "}
        </Text>
      ) : null}
      <AboutLinks links={links} />
    </span>
  ) : (
    <span>
      <Text size="sm" truncate="end" maw={240} title={full} span>
        {display.short}
      </Text>
      {links.length > 0 ? (
        <Text size="xs" c="dimmed" span>
          {" "}
          ·{" "}
        </Text>
      ) : null}
      <AboutLinks links={links} />
    </span>
  );
}

function VirtualLicenseRow({
  dependency,
  index,
  onSelect,
  measureRef,
}: {
  dependency: DependencyRow;
  index: number;
  onSelect: (dependency: DependencyRow) => void;
  measureRef: (element: HTMLTableRowElement | null) => void;
}) {
  return (
    // Measured heights keep the virtualizer honest: table padding and wrapped
    // license links make real rows taller than the 56px estimate, and without
    // measuring the position math drifts further with every scrolled row.
    <Table.Tr ref={measureRef} data-index={index} style={{ height: 56 }}>
      <Table.Td>
        {resolveModuleUrl(dependency) ? (
          <Anchor
            href={resolveModuleUrl(dependency)}
            target="_blank"
            rel="noopener noreferrer"
            truncate="end"
            maw="100%"
            style={{ display: "block" }}
            title={dependency.moduleName || "-"}
          >
            {dependency.moduleName || "-"}
          </Anchor>
        ) : (
          <Text
            size="sm"
            truncate="end"
            maw="100%"
            style={{ display: "block" }}
            title={dependency.moduleName || "-"}
          >
            {dependency.moduleName || "-"}
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text
          size="sm"
          c="dimmed"
          truncate="end"
          maw="100%"
          style={{ display: "block" }}
          title={dependency.moduleVersion || "-"}
        >
          {dependency.moduleVersion || "-"}
        </Text>
      </Table.Td>
      <Table.Td>
        <LicenseCell dependency={dependency} onSelect={onSelect} />
      </Table.Td>
    </Table.Tr>
  );
}

function LicenseModal({
  dependency,
  onClose,
}: {
  dependency: DependencyRow | null;
  onClose: () => void;
}) {
  const selectedDisplay = dependency
    ? resolveLicenseDisplay(dependency.moduleLicense, dependency.moduleName)
    : null;
  const selectedLinks = selectedDisplay
    ? resolveAboutLinks(selectedDisplay)
    : [];
  return (
    <Modal
      opened={dependency !== null}
      onClose={onClose}
      title={dependency?.moduleName || "-"}
      size="lg"
    >
      <ScrollArea.Autosize mah={420}>
        <Text size="sm" c="dimmed">
          {dependency?.moduleLicense || "-"}
        </Text>
        <Text size="sm" mt="xs" style={{ whiteSpace: "pre-wrap" }}>
          {dependency?.moduleLicenseText}
        </Text>
        {selectedLinks.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <AboutLinks links={selectedLinks} />
          </div>
        ) : null}
      </ScrollArea.Autosize>
    </Modal>
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

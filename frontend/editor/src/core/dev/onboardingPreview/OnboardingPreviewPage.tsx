import { Component, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Badge,
  Box,
  Code,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Button } from "@app/ui";
import OnboardingModalSlide from "@app/components/onboarding/OnboardingModalSlide";
import {
  SLIDE_DEFINITIONS,
  type ButtonAction,
  type SlideId,
} from "@app/components/onboarding/onboardingFlowConfig";
import {
  getOnboardingPreviewScenarios,
  getTourPreviews,
  resolvePreviewSlides,
  type PreviewScenario,
  type PreviewTourType,
} from "@app/dev/onboardingPreview/scenarios";

const PREVIEW_ENABLED = import.meta.env.VITE_DEV_ONBOARDING_PREVIEW === "true";

/** Route entry: only mounts the harness when the dev flag is set. */
export function OnboardingPreviewRoute() {
  if (!PREVIEW_ENABLED) return <Navigate to="/" replace />;
  return <OnboardingPreviewPage />;
}

// Some slides invoke hooks that need providers not present on this lightweight
// route (e.g. the MFA slide reads auth context). Catch that so one slide failing
// to render degrades to a note instead of blanking the whole harness.
class SlideErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Paper withBorder p="md" radius="md">
          <Text size="sm" c="dimmed">
            This slide renders live app UI (forms / auth context) and can only
            be previewed inside the full editor. Error:{" "}
            {this.state.error.message}
          </Text>
        </Paper>
      );
    }
    return this.props.children;
  }
}

function SlideRenderer({
  slideId,
  scenario,
  modalSlideCount,
  currentModalSlideIndex,
  onAction,
  onClose,
}: {
  slideId: SlideId;
  scenario: PreviewScenario;
  modalSlideCount: number;
  currentModalSlideIndex: number;
  onAction: (action: ButtonAction) => void;
  onClose: () => void;
}) {
  const definition = SLIDE_DEFINITIONS[slideId];
  const { runtimeState } = scenario;
  // createSlide calls the slide's own hooks, so it must run during this
  // component's render (the component is keyed by slideId, so hook order stays
  // stable per slide type across scenario switches).
  const slideContent = definition.createSlide({
    osLabel: "macOS",
    osUrl: "https://example.com/download",
    osOptions: [
      { label: "Windows", url: "https://example.com/win", value: "windows" },
      { label: "macOS", url: "https://example.com/mac", value: "mac" },
      { label: "Linux", url: "https://example.com/linux", value: "linux" },
    ],
    onDownloadUrlChange: () => {},
    selectedRole: runtimeState.selectedRole,
    onRoleSelect: () => {},
    licenseNotice: runtimeState.licenseNotice,
    loginEnabled: true,
    firstLoginUsername: runtimeState.firstLoginUsername,
    onPasswordChanged: () => {},
    usingDefaultCredentials: runtimeState.usingDefaultCredentials,
    analyticsError: null,
    analyticsLoading: false,
    onMfaSetupComplete: () => {},
  });

  return (
    <OnboardingModalSlide
      slideDefinition={definition}
      slideContent={slideContent}
      runtimeState={runtimeState}
      modalSlideCount={modalSlideCount}
      currentModalSlideIndex={currentModalSlideIndex}
      onSkip={onClose}
      onAction={onAction}
    />
  );
}

export default function OnboardingPreviewPage() {
  const { t } = useTranslation();
  const scenarios = useMemo(() => getOnboardingPreviewScenarios(), []);
  const tours = useMemo(() => getTourPreviews(t), [t]);

  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? "");
  const [slideIndex, setSlideIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [inspectedTour, setInspectedTour] = useState<PreviewTourType | null>(
    null,
  );

  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const slides = useMemo(
    () => (selected ? resolvePreviewSlides(selected) : []),
    [selected],
  );

  const openScenario = (scn: PreviewScenario, atIndex = 0) => {
    setSelectedId(scn.id);
    setSlideIndex(atIndex);
    setModalOpen(true);
    setInspectedTour(null);
  };

  const handleAction = (action: ButtonAction) => {
    switch (action) {
      case "next":
      case "complete-close":
      case "download-selected":
      case "security-next":
        if (slideIndex < slides.length - 1) setSlideIndex((i) => i + 1);
        else setModalOpen(false);
        break;
      case "prev":
        setSlideIndex((i) => Math.max(0, i - 1));
        break;
      case "launch-admin":
        setModalOpen(false);
        setInspectedTour("admin");
        break;
      case "launch-tools":
      case "launch-auto":
        setModalOpen(false);
        setInspectedTour(selected?.leadsToTour ?? "whatsnew");
        break;
      default:
        setModalOpen(false);
        break;
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, PreviewScenario[]>();
    for (const scn of scenarios) {
      const list = map.get(scn.group) ?? [];
      list.push(scn);
      map.set(scn.group, list);
    }
    return [...map.entries()];
  }, [scenarios]);

  const currentSlideId = slides[slideIndex];
  const activeTour = tours.find((tr) => tr.id === inspectedTour);

  return (
    <Box p="xl" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Stack gap="xs" mb="lg">
        <Group gap="sm">
          <Title order={2}>Onboarding preview</Title>
          <Badge color="orange" variant="light">
            dev only
          </Badge>
        </Group>
        <Text c="dimmed" size="sm">
          Every persona this build can render. Slide sequences are resolved from
          the real condition table, so they mirror production. This is the{" "}
          <Code>core</Code> build — run the SaaS or desktop build to preview
          those flavors.
        </Text>
      </Stack>

      <Group align="flex-start" gap="xl" wrap="nowrap">
        <Stack gap="lg" style={{ minWidth: 280 }}>
          {grouped.map(([group, list]) => (
            <Stack key={group} gap="xs">
              <Text fw={500} size="sm" c="dimmed" tt="uppercase">
                {group}
              </Text>
              {list.map((scn) => (
                <Paper
                  key={scn.id}
                  withBorder
                  p="sm"
                  radius="md"
                  style={{
                    cursor: "pointer",
                    borderColor:
                      scn.id === selectedId
                        ? "var(--mantine-primary-color-filled)"
                        : undefined,
                  }}
                  onClick={() => {
                    setSelectedId(scn.id);
                    setSlideIndex(0);
                    setInspectedTour(null);
                  }}
                >
                  <Text fw={500} size="sm">
                    {scn.label}
                  </Text>
                </Paper>
              ))}
            </Stack>
          ))}
        </Stack>

        <Stack gap="md" style={{ flex: 1 }}>
          {selected && (
            <Paper withBorder p="lg" radius="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={4}>{selected.label}</Title>
                  <Button size="sm" onClick={() => openScenario(selected)}>
                    Preview flow ▶
                  </Button>
                </Group>
                <Text size="sm" c="dimmed">
                  {selected.blurb}
                </Text>
                <Divider label="Slides in order" labelPosition="left" />
                <Group gap="xs">
                  {slides.length === 0 && (
                    <Text size="sm" c="dimmed">
                      No modal slides — this persona goes straight to the tour.
                    </Text>
                  )}
                  {slides.map((id, index) => (
                    <Badge
                      key={id}
                      variant="outline"
                      style={{ cursor: "pointer" }}
                      onClick={() => openScenario(selected, index)}
                    >
                      {index + 1}. {id}
                    </Badge>
                  ))}
                </Group>
                {selected.leadsToTour && (
                  <Group gap="xs">
                    <Text size="sm">Then leads into:</Text>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInspectedTour(selected.leadsToTour!)}
                    >
                      {selected.leadsToTour} tour
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          )}

          <Paper withBorder p="lg" radius="md">
            <Stack gap="sm">
              <Title order={4}>Guided tours</Title>
              <Group gap="xs">
                {tours.map((tr) => (
                  <Button
                    key={tr.id}
                    size="sm"
                    variant={inspectedTour === tr.id ? "primary" : "tertiary"}
                    onClick={() => setInspectedTour(tr.id)}
                  >
                    {tr.label} ({tr.steps.length})
                  </Button>
                ))}
              </Group>
              {activeTour && (
                <ScrollArea.Autosize mah={420}>
                  <Stack gap="xs">
                    {activeTour.steps.map((step, index) => (
                      <Paper key={index} withBorder p="sm" radius="sm">
                        <Group gap="xs" mb={4}>
                          <Badge size="sm" variant="light">
                            {index + 1}
                          </Badge>
                          <Code>{step.selector}</Code>
                          <Text size="xs" c="dimmed">
                            {step.position}
                          </Text>
                        </Group>
                        <Text size="sm">
                          {step.content.replace(/<[^>]+>/g, "")}
                        </Text>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              )}
            </Stack>
          </Paper>
        </Stack>
      </Group>

      {modalOpen && selected && currentSlideId && (
        <SlideErrorBoundary key={currentSlideId}>
          <SlideRenderer
            key={currentSlideId}
            slideId={currentSlideId}
            scenario={selected}
            modalSlideCount={slides.length}
            currentModalSlideIndex={slideIndex}
            onAction={handleAction}
            onClose={() => setModalOpen(false)}
          />
        </SlideErrorBoundary>
      )}
    </Box>
  );
}

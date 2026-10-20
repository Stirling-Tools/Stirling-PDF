import { Badge, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useLabelName } from "@app/data/labelDisplay";
import type { ClassifyRustResult } from "@app/services/classifyRustResults";
import type { RulesVerdict } from "@app/services/rulesClassifier";

/** Evidence lines shown for a verdict's winning label. */
const EVIDENCE_LINES = 4;

interface Props {
  results: ClassifyRustResult[];
}

export default function ClassifyRustResultsPanel({ results }: Props) {
  return (
    <Stack gap="md" data-testid="classify-rust-results">
      {results.map((result, index) => (
        <FileResult key={`${result.fileName}-${index}`} result={result} />
      ))}
    </Stack>
  );
}

function FileResult({ result }: { result: ClassifyRustResult }) {
  const { t } = useTranslation();
  return (
    <Stack gap={4}>
      <Text size="sm" fw={600}>
        {result.fileName}
      </Text>
      <Verdict
        title={t("classifyRust.results.rust", "Rust")}
        labels={result.rust?.labels ?? null}
        confidence={result.rust?.confidence ?? null}
      />
      <Verdict
        title={t("classifyRust.results.typescript", "Current heuristic")}
        labels={result.typescript?.labels ?? null}
        confidence={result.typescript?.confidence ?? null}
      />
      <Evidence verdict={result.rust} />
    </Stack>
  );
}

interface VerdictProps {
  title: string;
  /** Null when this side produced no verdict to show. */
  labels: string[] | null;
  confidence: string | null;
}

function Verdict({ title, labels, confidence }: VerdictProps) {
  const { t } = useTranslation();
  const labelName = useLabelName();
  const summary =
    labels === null
      ? t("classifyRust.results.unavailable", "no verdict")
      : t("classifyRust.results.confidence", "{{confidence}} confidence", {
          confidence,
        });
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" w={120}>
        {title}
      </Text>
      {(labels ?? []).map((label) => (
        <Badge key={label} variant="light" size="sm">
          {labelName(label)}
        </Badge>
      ))}
      <NoLabel labels={labels} />
      <Text size="xs" c="dimmed">
        {summary}
      </Text>
    </Group>
  );
}

function NoLabel({ labels }: { labels: string[] | null }) {
  const { t } = useTranslation();
  if (labels === null || labels.length > 0) return null;
  return (
    <Text size="sm" c="dimmed">
      {t("classifyRust.results.noLabel", "No label")}
    </Text>
  );
}

/** Why the Rust classifier's top candidate scored as it did. */
function Evidence({ verdict }: { verdict: RulesVerdict | null }) {
  const top = verdict?.candidates[0];
  if (!top) return null;
  return (
    <Stack gap={0} pl={128}>
      {top.evidence.slice(0, EVIDENCE_LINES).map((line) => (
        <Text key={line} size="xs" c="dimmed">
          {line}
        </Text>
      ))}
    </Stack>
  );
}

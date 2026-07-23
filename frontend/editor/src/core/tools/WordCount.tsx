import { useTranslation } from "react-i18next";
import {
  Stack,
  Text,
  Checkbox,
  Table,
  Badge,
  Alert,
  Divider,
} from "@mantine/core";
import { createToolFlow } from "@app/components/tools/shared/createToolFlow";
import { useBaseTool } from "@app/hooks/tools/shared/useBaseTool";
import { BaseToolProps, ToolComponent } from "@app/types/tool";
import {
  useWordCountParameters,
  defaultParameters,
} from "@app/hooks/tools/wordCount/useWordCountParameters";
import {
  useWordCountOperation,
  WordCountOperationHook,
} from "@app/hooks/tools/wordCount/useWordCountOperation";

const WordCount = (props: BaseToolProps) => {
  const { t } = useTranslation();

  const base = useBaseTool(
    "wordCount",
    useWordCountParameters,
    useWordCountOperation,
    props,
  );

  const operation = base.operation as WordCountOperationHook;
  const hasResults = operation.results.length > 0;

  const resultsContent = hasResults ? (
    <Stack gap="md">
      {operation.results.map((result) => (
        <Stack key={result.fileId} gap="xs">
          <Text size="sm" fw={600} truncate="end">
            {result.fileName}
          </Text>

          {result.error ? (
            <Alert color="red" title={t("wordCount.error.title", "Error")}>
              {result.error}
            </Alert>
          ) : (
            <Stack gap="sm">
              <Table withTableBorder withColumnBorders>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {t("wordCount.label.words", "Words")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {result.wordCount.toLocaleString()}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {t("wordCount.label.characters", "Characters")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {result.characterCount.toLocaleString()}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {t(
                          "wordCount.label.charactersNoSpaces",
                          "Characters (no spaces)",
                        )}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {result.characterCountNoSpaces.toLocaleString()}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                  <Table.Tr>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {t("wordCount.label.lines", "Lines")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" size="lg">
                        {result.lineCount.toLocaleString()}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                </Table.Tbody>
              </Table>

              {result.pages && result.pages.length > 0 && (
                <Stack gap="xs">
                  <Divider
                    label={t(
                      "wordCount.perPage.title",
                      "Per-Page Breakdown",
                    )}
                    labelPosition="center"
                  />
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>
                          {t("wordCount.perPage.page", "Page")}
                        </Table.Th>
                        <Table.Th>
                          {t("wordCount.label.words", "Words")}
                        </Table.Th>
                        <Table.Th>
                          {t("wordCount.label.characters", "Characters")}
                        </Table.Th>
                        <Table.Th>
                          {t("wordCount.label.lines", "Lines")}
                        </Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {result.pages.map((page, idx) => (
                        <Table.Tr key={idx}>
                          <Table.Td>{idx + 1}</Table.Td>
                          <Table.Td>{page.wordCount.toLocaleString()}</Table.Td>
                          <Table.Td>
                            {page.characterCount.toLocaleString()}
                          </Table.Td>
                          <Table.Td>{page.lineCount.toLocaleString()}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}
            </Stack>
          )}
        </Stack>
      ))}
    </Stack>
  ) : null;

  return createToolFlow({
    files: {
      selectedFiles: base.selectedFiles,
      isCollapsed: hasResults,
    },
    steps: [
      {
        title: t("wordCount.options.title", "Options"),
        isVisible: !hasResults,
        isCollapsed: false,
        content: (
          <Stack gap="md">
            <Divider ml="-md" />
            <Checkbox
              checked={base.params.parameters.includePerPage}
              onChange={(e) =>
                base.params.setParameters({
                  ...base.params.parameters,
                  includePerPage: e.currentTarget.checked,
                })
              }
              label={t(
                "wordCount.options.includePerPage",
                "Include per-page breakdown",
              )}
              description={t(
                "wordCount.options.includePerPageDesc",
                "Shows word and character counts for each page individually",
              )}
            />
          </Stack>
        ),
      },
      {
        title: t("wordCount.results.title", "Results"),
        isVisible: hasResults,
        isCollapsed: false,
        content: resultsContent,
      },
    ],
    executeButton: {
      text: t("wordCount.submit", "Count Words"),
      loadingText: t("loading", "Loading..."),
      onClick: base.handleExecute,
      endpointEnabled: base.endpointEnabled,
      paramsValid: base.params.validateParameters(),
      isVisible: !hasResults,
    },
    review: {
      isVisible: false,
      operation: base.operation,
      title: t("wordCount.results.title", "Results"),
      onUndo: base.handleUndo,
    },
  });
};

const WordCountTool = WordCount as ToolComponent;
WordCountTool.tool = () => useWordCountOperation;
WordCountTool.getDefaultParameters = () => ({ ...defaultParameters });

export default WordCountTool;

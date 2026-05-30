import { lazy, Suspense } from "react";
import { Loader, Center, Stack, Text } from "@mantine/core";
import type { BaseToolProps, ToolComponent } from "@app/types/tool";

const V1 = lazy(() => import("@app/tools/pdfTextEditor/PdfTextEditor"));
const V2 = lazy(() => import("@app/tools/pdfTextEditor/v2/PdfTextEditorV2"));

/**
 * Dispatches to v1 or v2 of the PDF text editor based on the `?editor=v2`
 * query param. Defaults to v1 until v2 has feature parity.
 *
 * The query check runs in the component body so navigation to and from the
 * v2 variant doesn't require a hard reload.
 */
function PdfTextEditorRouter(props: BaseToolProps) {
  const useV2 =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("editor") === "v2";
  const Impl = useV2 ? V2 : V1;
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Stack align="center" gap="xs">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Loading PDF text editor...
            </Text>
          </Stack>
        </Center>
      }
    >
      <Impl {...props} />
    </Suspense>
  );
}

(PdfTextEditorRouter as ToolComponent).tool = () => {
  throw new Error("PDF Text Editor does not support automation operations.");
};

(PdfTextEditorRouter as ToolComponent).getDefaultParameters = () => ({
  groups: [],
});

export default PdfTextEditorRouter as ToolComponent;

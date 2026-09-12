import { lazy, Suspense } from "react";
import { Center, Loader } from "@mantine/core";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";

const PageEditor = lazy(() => import("@app/components/pageEditor/PageEditor"));
const PageEditorControls = lazy(
  () => import("@app/components/pageEditor/PageEditorControls"),
);

/**
 * The Multi-Tool's workbench: the single-document page editor plus its own
 * bottom control bar. Reached only while the Multi-Tool is the selected tool;
 * the "Page Editor" view is the multi-file track editor instead.
 */
export default function MultiToolWorkbench() {
  const { pageEditorFunctions, setPageEditorFunctions } = useToolWorkflow();

  return (
    <div style={{ position: "relative", flex: "1 1 0", height: 0 }}>
      <Suspense
        fallback={
          <Center style={{ height: "100%" }}>
            <Loader />
          </Center>
        }
      >
        <PageEditor onFunctionsReady={setPageEditorFunctions} />
        {pageEditorFunctions && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 100,
            }}
          >
            <PageEditorControls
              onClosePdf={pageEditorFunctions.closePdf}
              onUndo={pageEditorFunctions.handleUndo}
              onRedo={pageEditorFunctions.handleRedo}
              canUndo={pageEditorFunctions.canUndo}
              canRedo={pageEditorFunctions.canRedo}
              onRotate={pageEditorFunctions.handleRotate}
              onDelete={pageEditorFunctions.handleDelete}
              onSplit={pageEditorFunctions.handleSplit}
              onSplitAll={pageEditorFunctions.handleSplitAll}
              onPageBreak={pageEditorFunctions.handlePageBreak}
              onPageBreakAll={pageEditorFunctions.handlePageBreakAll}
              onExportAll={pageEditorFunctions.onExportAll}
              exportLoading={pageEditorFunctions.exportLoading}
              selectionMode={pageEditorFunctions.selectionMode}
              selectedPageIds={pageEditorFunctions.selectedPageIds}
              displayDocument={pageEditorFunctions.displayDocument}
              splitPositions={pageEditorFunctions.splitPositions}
              totalPages={pageEditorFunctions.totalPages}
            />
          </div>
        )}
      </Suspense>
    </div>
  );
}

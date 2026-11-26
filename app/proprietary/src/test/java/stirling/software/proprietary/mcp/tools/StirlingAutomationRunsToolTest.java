package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.PolicyRunView;

/** How a run reads to the assistant. */
class StirlingAutomationRunsToolTest {

    private static final long SIX_OCT_NINE = Instant.parse("2026-10-06T09:00:00Z").toEpochMilli();

    @Test
    void aFailedRunSaysWhereAndWhy() {
        PolicyRunView run =
                new PolicyRunView(
                        "r1",
                        "p1",
                        PolicyRunStatus.FAILED,
                        2,
                        3,
                        "OCR found existing text",
                        "OCR_TEXT",
                        null,
                        List.of(),
                        SIX_OCT_NINE,
                        "invoice.pdf",
                        false);

        assertEquals(
                "invoice.pdf: failed at step 2 of 3 (6 Oct 09:00 UTC): OCR found existing text",
                StirlingAutomationRunsTool.describe(run));
    }

    @Test
    void aFinishedRunSaysWhereItsResultsWent() {
        ResultFile out = new ResultFile();
        out.setFileName("invoice_ocr.pdf");
        PolicyRunView run =
                new PolicyRunView(
                        "r2",
                        "p1",
                        PolicyRunStatus.COMPLETED,
                        3,
                        3,
                        null,
                        null,
                        null,
                        List.of(out),
                        SIX_OCT_NINE,
                        null,
                        true);

        assertEquals(
                "Run r2: finished (6 Oct 09:00 UTC); delivered invoice_ocr.pdf",
                StirlingAutomationRunsTool.describe(run));
    }
}

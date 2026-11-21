package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.McpAutomations;

/** How connections read to the assistant. */
class StirlingListAutomationsToolTest {

    @Test
    void aConnectionSaysWhereItPointsAndWhatRunningFromItDoes() {
        McpAutomations.SourceRef scans =
                new McpAutomations.SourceRef(
                        "s1",
                        "Scans",
                        "folder",
                        "server folder",
                        false,
                        true,
                        "/data/scans",
                        true,
                        null);
        McpAutomations.SourceRef hook =
                new McpAutomations.SourceRef(
                        "w1",
                        "Zapier",
                        "webhook",
                        "webhook",
                        true,
                        false,
                        null,
                        false,
                        "https://pdf.example.com/api/v1/webhooks/abc");

        assertEquals(
                "Scans (server folder /data/scans, sourceId=s1; removes files after processing;"
                        + " can be a destination)",
                StirlingListAutomationsTool.describe(scans));
        assertEquals(
                "Zapier (webhook, sourceId=w1; paused; source only; webhook URL"
                        + " https://pdf.example.com/api/v1/webhooks/abc)",
                StirlingListAutomationsTool.describe(hook));
    }
}

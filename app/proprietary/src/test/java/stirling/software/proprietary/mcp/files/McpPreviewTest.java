package stirling.software.proprietary.mcp.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpCallContext;

import tools.jackson.databind.ObjectMapper;

class McpPreviewTest {

    private final ApplicationProperties props = new ApplicationProperties();
    private final McpPreview preview = new McpPreview(props);

    private static byte[] pdf(int pages) throws Exception {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage());
            }
            doc.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void rendersPageCountAndJpegThumbnail() throws Exception {
        McpPreview.Preview p = preview.of(pdf(3));

        assertEquals(3, p.pageCount());
        assertTrue(p.imageDataUrl().startsWith("data:image/jpeg;base64,"));
    }

    @Test
    void unreadableOrHugeInputGivesNoPreview() {
        assertNull(preview.of("not a pdf".getBytes()));
        assertNull(preview.of(new byte[0]));
        assertNull(preview.of(null));
    }

    @Test
    void onlyWantedWhenTheWidgetCanShowIt() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        McpCallContext legacy = new McpCallContext("alice", Set.of(), false);
        McpCallContext apps =
                new McpCallContext(
                        "alice",
                        Set.of(),
                        false,
                        mapper.readTree("{\"extensions\":{\"io.modelcontextprotocol/ui\":{}}}"),
                        null);
        McpCallContext noApps =
                new McpCallContext("alice", Set.of(), false, mapper.readTree("{}"), null);

        assertTrue(preview.wanted(legacy));
        assertTrue(preview.wanted(apps));
        assertFalse(preview.wanted(noApps));

        props.getMcp().setWidgetEnabled(false);
        assertFalse(preview.wanted(apps));
    }
}

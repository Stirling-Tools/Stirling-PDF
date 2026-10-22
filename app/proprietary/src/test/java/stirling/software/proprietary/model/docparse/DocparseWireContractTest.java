package stirling.software.proprietary.model.docparse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.common.pdf.MarkdownBlock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Java DTOs must serialize to exactly the camelCase wire shapes defined in {@code
 * engine/src/stirling/contracts/docparse.py}; a drift here breaks ingestion silently.
 */
class DocparseWireContractTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void ingestRequestSerializesTheEngineContract() {
        IngestRequest request =
                new IngestRequest(
                        "doc-1",
                        "report.pdf",
                        "user:alice",
                        List.of("user:alice"),
                        null,
                        List.of(new MarkdownBlock("# Title", 1, 2, List.of("Title"))),
                        512,
                        64,
                        true,
                        true);

        JsonNode json = mapper.readTree(mapper.writeValueAsString(request));

        assertEquals("doc-1", json.get("documentId").asString());
        assertEquals("report.pdf", json.get("source").asString());
        assertEquals("user:alice", json.get("ownerId").asString());
        assertEquals("user:alice", json.get("readPrincipals").get(0).asString());
        JsonNode block = json.get("blocks").get(0);
        assertEquals("# Title", block.get("markdown").asString());
        assertEquals(1, block.get("pageStart").asInt());
        assertEquals(2, block.get("pageEnd").asInt());
        assertEquals("Title", block.get("headingPath").get(0).asString());
        assertEquals(512, json.get("chunkSize").asInt());
        assertEquals(64, json.get("overlap").asInt());
        assertTrue(json.get("index").asBoolean());
        assertTrue(json.get("includeChunks").asBoolean());
        // The engine rejects unknown keys (extra="forbid"), so the retired fields must be gone.
        assertNull(json.get("fileName"));
        assertNull(json.get("pages"));
        assertNull(json.get("mode"));
        assertNull(json.get("includeMarkdown"));
    }

    @Test
    void ingestResponseReadsTheEngineShapeIncludingEchoedChunks() {
        String engineJson =
                "{\"documentId\":\"doc-1\",\"chunksIndexed\":2,"
                        + "\"chunks\":[{\"index\":0,\"text\":\"t\",\"pageStart\":1,\"pageEnd\":2,"
                        + "\"headingPath\":[\"Intro\"]}]}";

        IngestResponse response = mapper.readValue(engineJson, IngestResponse.class);

        assertEquals("doc-1", response.documentId());
        assertEquals(2, response.chunksIndexed());
        assertEquals(1, response.chunks().size());
        assertEquals(List.of("Intro"), response.chunks().get(0).headingPath());
    }

    @Test
    void ingestResponseToleratesAbsentChunks() {
        String engineJson = "{\"documentId\":\"d\",\"chunksIndexed\":0}";

        IngestResponse response = mapper.readValue(engineJson, IngestResponse.class);

        assertNull(response.chunks());
        assertEquals(0, response.chunksIndexed());
    }
}

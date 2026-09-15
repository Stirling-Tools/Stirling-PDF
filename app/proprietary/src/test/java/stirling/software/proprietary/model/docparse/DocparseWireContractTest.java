package stirling.software.proprietary.model.docparse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.api.ai.AiPageText;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * The Java DTOs must serialize to exactly the camelCase wire shapes defined in {@code
 * engine/src/stirling/contracts/docparse.py}; a drift here breaks ingestion silently.
 */
class DocparseWireContractTest {

    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void ragIngestRequestSerializesTheEngineContract() {
        RagIngestRequest request =
                new RagIngestRequest(
                        "report.pdf",
                        "doc-1",
                        "report.pdf",
                        "user:alice",
                        List.of("user:alice"),
                        null,
                        List.of(new AiPageText(1, "hello")),
                        512,
                        64,
                        DocparseMode.AUTO,
                        true,
                        false,
                        true);
        JsonNode json = mapper.readTree(mapper.writeValueAsString(request));
        assertEquals("report.pdf", json.get("fileName").asText());
        assertEquals("doc-1", json.get("documentId").asText());
        assertEquals("user:alice", json.get("ownerId").asText());
        assertEquals("user:alice", json.get("readPrincipals").get(0).asText());
        assertEquals(1, json.get("pages").get(0).get("pageNumber").asInt());
        assertEquals("hello", json.get("pages").get(0).get("text").asText());
        assertEquals(512, json.get("chunkSize").asInt());
        assertEquals(64, json.get("overlap").asInt());
        assertEquals("auto", json.get("mode").asText());
        assertTrue(json.get("index").asBoolean());
        assertFalse(json.get("includeMarkdown").asBoolean());
        assertTrue(json.get("includeChunks").asBoolean());
    }

    @Test
    void ragIngestResponseReadsTheEngineShapeIncludingEchoedContent() {
        String engineJson =
                "{\"mode\":\"basic\",\"documentId\":\"doc-1\",\"chunksIndexed\":2,\"pages\":3,"
                        + "\"markdown\":\"# Title\",\"chunks\":[{\"index\":0,\"text\":\"t\","
                        + "\"pageStart\":1,\"pageEnd\":2,\"headingPath\":[\"Intro\"]}]}";
        RagIngestResponse response = mapper.readValue(engineJson, RagIngestResponse.class);
        assertEquals(DocparseTier.BASIC, response.mode());
        assertEquals("doc-1", response.documentId());
        assertEquals(2, response.chunksIndexed());
        assertEquals(3, response.pages());
        assertEquals("# Title", response.markdown());
        assertEquals(1, response.chunks().size());
        assertEquals(List.of("Intro"), response.chunks().get(0).headingPath());
    }

    @Test
    void ragIngestResponseToleratesAbsentEchoFields() {
        String engineJson =
                "{\"mode\":\"basic\",\"documentId\":\"d\",\"chunksIndexed\":0,\"pages\":1}";
        RagIngestResponse response = mapper.readValue(engineJson, RagIngestResponse.class);
        assertNull(response.markdown());
        assertNull(response.chunks());
    }

    @Test
    void capabilitiesReadTheEngineProbeShape() {
        String engineJson =
                "{\"advancedInstalled\":false,\"doclingVersion\":null,\"torchVersion\":null,"
                        + "\"modelsAvailable\":false,\"modelsPath\":null,\"errors\":[\"missing\"]}";
        DocparseCapabilities capabilities =
                mapper.readValue(engineJson, DocparseCapabilities.class);
        assertFalse(capabilities.advancedInstalled());
        assertEquals(List.of("missing"), capabilities.errors());
    }
}

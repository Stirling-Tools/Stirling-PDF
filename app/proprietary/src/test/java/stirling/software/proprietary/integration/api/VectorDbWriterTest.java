package stirling.software.proprietary.integration.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.policy.output.CorpusChunk;
import stirling.software.proprietary.policy.output.VectorDbTarget;

import tools.jackson.databind.json.JsonMapper;

class VectorDbWriterTest {
    private final ExternalApiCaller caller = mock(ExternalApiCaller.class);
    private final VectorDbWriter writer = new VectorDbWriter(caller, JsonMapper.builder().build());
    private final VectorDbTarget target = new VectorDbTarget(1, "Documents", "__default__", "text");
    private final List<CorpusChunk> chunks =
            List.of(new CorpusChunk("doc", 0, "hello", 1, 1, List.of()));

    private VectorDbConnectionSettings connection(String vendor) {
        return VectorDbConnectionSettings.from(
                Map.of(
                        "vendor",
                        vendor,
                        "baseUrl",
                        "https://index.example.com",
                        "token",
                        "test-key"));
    }

    private static ExternalApiCaller.Response response(int status, String body) {
        return new ExternalApiCaller.Response(
                status, "application/json", body.getBytes(StandardCharsets.UTF_8), Map.of());
    }

    @Test
    void weaviateChecksPerObjectFailuresBeforeRemovingOldChunks() throws IOException {
        when(caller.get(any(), any()))
                .thenReturn(response(200, "{\"vectorizer\":\"text2vec-openai\"}"));
        when(caller.dispatch(any(), eq("POST"), any(), any(), any()))
                .thenReturn(response(200, "[{\"result\":{\"status\":\"FAILED\"}}]"));
        assertThrows(
                IOException.class,
                () -> writer.replace(connection("weaviate"), target, "doc", chunks));
        verify(caller, never()).dispatch(any(), eq("DELETE"), any(), any(), any());
    }

    @Test
    void weaviateRefusesACollectionWithoutEmbedding() throws IOException {
        when(caller.get(any(), any())).thenReturn(response(200, "{\"vectorizer\":\"none\"}"));
        assertThrows(
                IOException.class,
                () -> writer.replace(connection("weaviate"), target, "doc", chunks));
        verify(caller, never()).dispatch(any(), any(), any(), any(), any());
    }

    @Test
    void cleanupFailureFailsTheDelivery() throws IOException {
        when(caller.get(any(), any()))
                .thenReturn(response(200, "{\"vectorizer\":\"text2vec-openai\"}"));
        when(caller.dispatch(any(), eq("POST"), any(), any(), any()))
                .thenReturn(response(200, "[{\"result\":{\"status\":\"SUCCESS\"}}]"));
        when(caller.dispatch(any(), eq("DELETE"), any(), any(), any()))
                .thenReturn(response(200, "{\"results\":{\"failed\":1}}"));
        assertThrows(
                IOException.class,
                () -> writer.replace(connection("weaviate"), target, "doc", chunks));
    }

    @Test
    void pineconeRetriesRateLimitsAndThenRemovesTheObsoleteTail() throws IOException {
        when(caller.get(any(), eq("/indexes/Documents")))
                .thenReturn(
                        response(
                                200,
                                "{\"host\":\"index.example.com\",\"embed\":{\"field_map\":{\"text\":\"text\"}}}"));
        when(caller.dispatch(any(), eq("POST"), contains("/upsert"), any(), any()))
                .thenReturn(response(429, "{}"), response(201, ""));
        when(caller.dispatch(any(), eq("POST"), eq("/vectors/delete"), any(), any()))
                .thenReturn(response(200, "{}"));
        writer.replace(connection("pinecone"), target, "doc", chunks);
        var ordered = inOrder(caller);
        ordered.verify(caller, times(2))
                .dispatch(any(), eq("POST"), contains("/upsert"), any(), any());
        ordered.verify(caller).dispatch(any(), eq("POST"), eq("/vectors/delete"), any(), any());
    }

    @Test
    void pineconeRejectsClassicIndexesBeforeWriting() throws IOException {
        when(caller.get(any(), any()))
                .thenReturn(response(200, "{\"host\":\"index.example.com\"}"));
        assertThrows(
                IOException.class,
                () -> writer.replace(connection("pinecone"), target, "doc", chunks));
        verify(caller, never()).dispatch(any(), any(), any(), any(), any());
    }

    @Test
    void authIsFixedByVendorAndCannotBeOverriddenByConfig() {
        var config =
                VectorDbConnectionSettings.from(
                        Map.of(
                                "vendor",
                                "pinecone",
                                "baseUrl",
                                "https://index.example.com",
                                "token",
                                "test-key",
                                "authType",
                                "NONE",
                                "headerName",
                                "Other"));
        assertEquals(ApiAuthType.HEADER, config.api().authType());
        assertEquals("Api-Key", config.api().headerName());
        assertEquals("2025-10", config.api().headers().get("X-Pinecone-Api-Version"));
    }
}

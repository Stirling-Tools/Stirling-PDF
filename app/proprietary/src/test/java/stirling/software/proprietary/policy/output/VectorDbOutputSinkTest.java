package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.integration.api.ApiConnectionResolver;
import stirling.software.proprietary.integration.api.VectorDbIntegrationValidator;
import stirling.software.proprietary.integration.api.VectorDbWriter;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;

import tools.jackson.databind.json.JsonMapper;

class VectorDbOutputSinkTest {
    private final ApiConnectionResolver resolver = mock(ApiConnectionResolver.class);
    private final VectorDbWriter writer = mock(VectorDbWriter.class);
    private final FileStorage fileStorage = mock(FileStorage.class);
    private final VectorDbOutputSink sink =
            new VectorDbOutputSink(
                    resolver,
                    mock(VectorDbIntegrationValidator.class),
                    writer,
                    JsonMapper.builder().build(),
                    fileStorage);
    private final OutputSpec output =
            new OutputSpec("vectordb", Map.of("connectionId", "42", "collection", "Documents"));

    @Test
    void changedContentReusesTheOriginalSourceIdentity() throws IOException {
        when(resolver.resolveConfig(42L, IntegrationType.VECTOR_DB))
                .thenReturn(
                        Map.of(
                                "vendor",
                                "weaviate",
                                "baseUrl",
                                "https://db.example.com",
                                "token",
                                "test-key"));
        when(fileStorage.storeInputStream(any(), any()))
                .thenReturn(new FileStorage.StoredFile("receipt", 80));
        var original =
                new ByteArrayResource(new byte[0]) {
                    @Override
                    public String getDescription() {
                        return "s3://bucket/document.pdf";
                    }
                };
        var delivery =
                new OutputDelivery(
                        "run",
                        "policy",
                        PolicyInputs.of(List.of(original)),
                        null,
                        "source:documents/document");
        sink.deliver(delivery, List.of(corpus("hash-before", 0)), output);
        sink.deliver(delivery, List.of(corpus("hash-after", 0)), output);
        ArgumentCaptor<String> ids = ArgumentCaptor.forClass(String.class);
        verify(writer, times(2)).replace(any(), any(), ids.capture(), any());
        assertEquals(ids.getAllValues().getFirst(), ids.getAllValues().getLast());
    }

    @Test
    void retryUsesTheRunReferenceDespiteDifferentUploadTempPaths() throws IOException {
        when(resolver.resolveConfig(42L, IntegrationType.VECTOR_DB))
                .thenReturn(
                        Map.of(
                                "vendor",
                                "weaviate",
                                "baseUrl",
                                "https://db.example.com",
                                "token",
                                "test-key"));
        when(fileStorage.storeInputStream(any(), any()))
                .thenReturn(new FileStorage.StoredFile("receipt", 80));
        var first =
                new OutputDelivery(
                        "run-1",
                        "policy",
                        PolicyInputs.of(
                                List.of(
                                        new org.springframework.core.io.FileSystemResource(
                                                "/tmp/upload-one"))),
                        null,
                        "user:alice/document");
        var retry =
                new OutputDelivery(
                        "run-2",
                        "policy",
                        PolicyInputs.of(
                                List.of(
                                        new org.springframework.core.io.FileSystemResource(
                                                "/tmp/upload-two"))),
                        null,
                        "user:alice/document");
        sink.deliver(first, List.of(corpus("first-content", 0)), output);
        sink.deliver(retry, List.of(corpus("changed-content", 0)), output);
        sink.deliver(
                new OutputDelivery("run-3", "policy", retry.inputs(), null, "user:bob/document"),
                List.of(corpus("changed-content", 0)),
                output);
        ArgumentCaptor<String> ids = ArgumentCaptor.forClass(String.class);
        verify(writer, times(3)).replace(any(), any(), ids.capture(), any());
        assertEquals(ids.getAllValues().get(0), ids.getAllValues().get(1));
        assertNotEquals(ids.getAllValues().get(1), ids.getAllValues().get(2));
    }

    @Test
    void malformedCorpusNeverReachesTheWriter() {
        when(resolver.resolveConfig(42L, IntegrationType.VECTOR_DB))
                .thenReturn(
                        Map.of(
                                "vendor",
                                "weaviate",
                                "baseUrl",
                                "https://db.example.com",
                                "token",
                                "test-key"));
        assertThrows(
                IOException.class,
                () ->
                        sink.deliver(
                                new OutputDelivery("run", "policy"),
                                List.of(corpus("doc", 3)),
                                output));
        verifyNoInteractions(writer);
    }

    private static ByteArrayResource corpus(String id, int index) {
        String line = "{\"documentId\":\"" + id + "\",\"index\":" + index + ",\"text\":\"hello\"}";
        return new ByteArrayResource(line.getBytes(StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return "document.chunks.jsonl";
            }
        };
    }

    @Test
    void connectionOwnershipIsCheckedDuringValidation() {
        when(resolver.resolveConfig(42L, IntegrationType.VECTOR_DB))
                .thenThrow(new IllegalArgumentException("inaccessible"));
        assertThrows(IllegalArgumentException.class, () -> sink.validate(output));
        verify(resolver).resolveConfig(42L, IntegrationType.VECTOR_DB);
    }

    @Test
    void rejectsMixedOutputsBeforeAnyDatabaseWrite() {
        when(resolver.resolveConfig(42L, IntegrationType.VECTOR_DB))
                .thenReturn(
                        Map.of(
                                "vendor",
                                "weaviate",
                                "baseUrl",
                                "https://db.example.com",
                                "token",
                                "test-key"));
        var pdf =
                new ByteArrayResource("pdf".getBytes(StandardCharsets.UTF_8)) {
                    @Override
                    public String getFilename() {
                        return "document.pdf";
                    }
                };
        assertThrows(
                IOException.class,
                () -> sink.deliver(new OutputDelivery("run", "policy"), List.of(pdf), output));
        verifyNoInteractions(writer);
    }

    @Test
    void requiresAChunksOnlyTerminalStep() {
        var valid =
                new PipelineStep(
                        "/api/v1/docparse/rag-ingest",
                        Map.of("includeOriginal", false, "exportChunksJsonl", true));
        sink.validatePipeline(output, List.of(valid));
        var mixed =
                new PipelineStep("/api/v1/docparse/rag-ingest", Map.of("exportChunksJsonl", true));
        assertThrows(
                IllegalArgumentException.class,
                () -> sink.validatePipeline(output, List.of(mixed)));
        assertThrows(
                IllegalArgumentException.class, () -> sink.validatePipeline(output, List.of()));
    }
}

package stirling.software.proprietary.policy.output;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.integration.api.ApiConnectionResolver;
import stirling.software.proprietary.integration.api.VectorDbConnectionSettings;
import stirling.software.proprietary.integration.api.VectorDbIntegrationValidator;
import stirling.software.proprietary.integration.api.VectorDbWriter;
import stirling.software.proprietary.integration.model.IntegrationType;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;

import tools.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class VectorDbOutputSink implements PolicyOutputSink {
    private final ApiConnectionResolver connectionResolver;
    private final VectorDbIntegrationValidator connectionValidator;
    private final VectorDbWriter writer;
    private final ObjectMapper objectMapper;
    private final FileStorage fileStorage;

    @Override
    public String type() {
        return "vectordb";
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && type().equals(spec.type());
    }

    @Override
    public void validate(OutputSpec spec) {
        resolve(VectorDbTarget.from(spec.options()));
    }

    @Override
    public void validatePipeline(OutputSpec spec, List<PipelineStep> steps) {
        if (steps.isEmpty()) {
            throw new IllegalArgumentException(
                    "A vector database destination requires a final AI ingestion step");
        }
        PipelineStep last = steps.getLast();
        Map<String, Object> params = last.parameters();
        if (!"/api/v1/docparse/ingest".equals(last.operation())
                || !"true".equals(String.valueOf(params.get("exportChunksJsonl")))
                || !"false".equals(String.valueOf(params.get("includeOriginal")))
                || "true".equals(String.valueOf(params.get("exportMarkdown")))) {
            throw new IllegalArgumentException(
                    "The final AI ingestion step must export chunks only, with the original PDF and Markdown excluded");
        }
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) throws IOException {
        VectorDbTarget target = VectorDbTarget.from(spec.options());
        VectorDbConnectionSettings connection = resolve(target);
        if (outputs.isEmpty()) {
            return List.of();
        }
        List<List<CorpusChunk>> documents = new ArrayList<>();
        for (Resource output : outputs) {
            documents.add(readCorpus(output));
        }
        int indexed = 0;
        for (int i = 0; i < documents.size(); i++) {
            List<CorpusChunk> chunks = documents.get(i);
            String identity =
                    delivery.documentIdentity() != null
                            ? delivery.documentIdentity()
                            : chunks.getFirst().documentId();
            identity += "\n" + outputs.get(i).getFilename();
            String documentId =
                    UUID.nameUUIDFromBytes(
                                    (delivery.policyId() + "\n" + identity)
                                            .getBytes(StandardCharsets.UTF_8))
                            .toString();
            writer.replace(connection, target, documentId, chunks);
            indexed += chunks.size();
        }
        byte[] receipt =
                objectMapper.writeValueAsBytes(
                        Map.of(
                                "documentsIndexed",
                                documents.size(),
                                "chunksIndexed",
                                indexed,
                                "collection",
                                target.collection(),
                                "vendor",
                                connection.vendor()));
        String name = "indexing-report.json";
        FileStorage.StoredFile stored =
                fileStorage.storeInputStream(new ByteArrayInputStream(receipt), name);
        return List.of(
                ResultFile.builder()
                        .fileId(stored.fileId())
                        .fileName(name)
                        .contentType("application/json")
                        .fileSize(stored.size())
                        .build());
    }

    private VectorDbConnectionSettings resolve(VectorDbTarget target) {
        VectorDbConnectionSettings connection =
                VectorDbConnectionSettings.from(
                        connectionResolver.resolveConfig(
                                target.connectionId(), IntegrationType.VECTOR_DB));
        connectionValidator.validate(connection);
        return connection;
    }

    private List<CorpusChunk> readCorpus(Resource resource) throws IOException {
        if (resource.getFilename() == null || !resource.getFilename().endsWith(".chunks.jsonl")) {
            throw new IOException(
                    "Vector database destinations accept only ingestion chunk exports");
        }
        if (resource.contentLength() > 32L * 1024 * 1024) {
            throw new IOException("Corpus exceeds the 32 MiB limit");
        }
        List<CorpusChunk> chunks = new ArrayList<>();
        try (BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                CorpusChunk chunk = objectMapper.readValue(line, CorpusChunk.class);
                if (chunk.index() != chunks.size()
                        || (!chunks.isEmpty()
                                && !chunk.documentId().equals(chunks.getFirst().documentId()))) {
                    throw new IOException(
                            "Corpus must contain contiguous chunks from one document");
                }
                chunks.add(chunk);
                if (chunks.size() > 10000)
                    throw new IOException("Corpus exceeds the 10000 chunk limit");
            }
        }
        if (chunks.isEmpty()) throw new IOException("AI ingestion produced no chunks to index");
        return chunks;
    }
}

package stirling.software.proprietary.integration.api;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.output.CorpusChunk;
import stirling.software.proprietary.policy.output.VectorDbTarget;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Replaces a document's chunks; obsolete tail chunks are removed only after all upserts succeed.
 */
@Service
@RequiredArgsConstructor
public class VectorDbWriter {
    private static final int BATCH_SIZE = 16;
    private static final int MAX_CHUNK_BYTES = 60_000;
    private final ExternalApiCaller caller;
    private final ObjectMapper objectMapper;

    public void replace(
            VectorDbConnectionSettings connection,
            VectorDbTarget target,
            String documentId,
            List<CorpusChunk> chunks)
            throws IOException {
        for (CorpusChunk chunk : chunks) {
            if (objectMapper.writeValueAsBytes(properties(target, documentId, chunk)).length
                    > MAX_CHUNK_BYTES) {
                throw new IOException(
                        "A chunk exceeds the 60000-byte indexing limit; reduce the ingestion chunk size");
            }
        }
        boolean weaviate = connection.vendor().equals("weaviate");
        if (weaviate) verifyWeaviate(connection, target);
        else verifyPinecone(connection, target);
        for (int start = 0; start < chunks.size(); start += BATCH_SIZE) {
            List<CorpusChunk> batch =
                    chunks.subList(start, Math.min(start + BATCH_SIZE, chunks.size()));
            if (weaviate) {
                ObjectNode body = objectMapper.createObjectNode();
                var objects = body.putArray("objects");
                for (CorpusChunk chunk : batch) {
                    ObjectNode object = objects.addObject();
                    object.put("class", target.collection());
                    object.put("id", chunkId(documentId, chunk.index()));
                    if (!target.namespace().equals("__default__"))
                        object.put("tenant", target.namespace());
                    object.set("properties", properties(target, documentId, chunk));
                }
                JsonNode result =
                        request(
                                connection,
                                "POST",
                                "/v1/batch/objects",
                                "application/json",
                                objectMapper.writeValueAsBytes(body));
                if (!result.isArray() || result.size() != batch.size()) {
                    throw new IOException("Weaviate returned an incomplete batch result");
                }
                for (JsonNode item : result) {
                    if (!"SUCCESS".equals(item.path("result").path("status").asString())) {
                        throw new IOException(
                                "Weaviate rejected a chunk; check the collection schema and vectorizer credentials");
                    }
                }
            } else {
                StringBuilder body = new StringBuilder();
                for (CorpusChunk chunk : batch) {
                    ObjectNode record = properties(target, documentId, chunk);
                    record.put("_id", chunkId(documentId, chunk.index()));
                    body.append(objectMapper.writeValueAsString(record)).append('\n');
                }
                request(
                        connection,
                        "POST",
                        "/records/namespaces/" + encode(target.namespace()) + "/upsert",
                        "application/x-ndjson",
                        body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        if (weaviate) {
            deleteWeaviateTail(connection, target, documentId, chunks.size());
        } else {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("namespace", target.namespace());
            ObjectNode filter = body.putObject("filter");
            filter.putObject("documentId").put("$eq", documentId);
            filter.putObject("chunkIndex").put("$gte", chunks.size());
            request(
                    connection,
                    "POST",
                    "/vectors/delete",
                    "application/json",
                    objectMapper.writeValueAsBytes(body));
        }
    }

    private ObjectNode properties(VectorDbTarget target, String documentId, CorpusChunk chunk) {
        ObjectNode properties = objectMapper.createObjectNode();
        properties.put(target.textField(), chunk.text());
        properties.put("documentId", documentId);
        properties.put("chunkIndex", chunk.index());
        if (chunk.pageStart() != null) properties.put("pageStart", chunk.pageStart());
        if (chunk.pageEnd() != null) properties.put("pageEnd", chunk.pageEnd());
        if (!chunk.headingPath().isEmpty()) {
            var headings = properties.putArray("headingPath");
            chunk.headingPath().forEach(headings::add);
        }
        return properties;
    }

    private void verifyPinecone(VectorDbConnectionSettings connection, VectorDbTarget target)
            throws IOException {
        ApiConnectionSettings control =
                ApiConnectionSettings.from(
                        Map.of(
                                "baseUrl",
                                "https://api.pinecone.io",
                                "authType",
                                "HEADER",
                                "headerName",
                                "Api-Key",
                                "token",
                                connection.api().token(),
                                "headers",
                                connection.api().headers()));
        ExternalApiCaller.Response response =
                caller.get(control, "/indexes/" + encode(target.collection()));
        requireSuccess(response);
        JsonNode index = objectMapper.readTree(response.body());
        if (!target.textField()
                        .equals(index.path("embed").path("field_map").path("text").asString())
                || !connection
                        .api()
                        .baseUri()
                        .getHost()
                        .equalsIgnoreCase(index.path("host").asString())) {
            throw new IOException(
                    "Pinecone requires an integrated-embedding index with a matching index host and text field");
        }
    }

    private void verifyWeaviate(VectorDbConnectionSettings connection, VectorDbTarget target)
            throws IOException {
        ExternalApiCaller.Response response =
                caller.get(connection.api(), "/v1/schema/" + encode(target.collection()));
        requireSuccess(response);
        JsonNode schema = objectMapper.readTree(response.body());
        String vectorizer = schema.path("vectorizer").asString("");
        boolean embeds = !vectorizer.isBlank() && !vectorizer.equals("none");
        JsonNode named = schema.path("vectorConfig");
        if (named.isObject() && !named.isEmpty()) {
            embeds = true;
            for (JsonNode vector : named) {
                JsonNode config = vector.path("vectorizer");
                embeds &= config.isObject() && !config.isEmpty() && !config.has("none");
            }
        }
        if (!embeds)
            throw new IOException("The Weaviate collection must have a server-side vectorizer");
        boolean multiTenant = schema.path("multiTenancyConfig").path("enabled").asBoolean();
        if (multiTenant == target.namespace().equals("__default__")) {
            throw new IOException(
                    "Set a tenant for a multi-tenant Weaviate collection; leave it empty for a single-tenant collection");
        }
    }

    private void deleteWeaviateTail(
            VectorDbConnectionSettings connection,
            VectorDbTarget target,
            String documentId,
            int count)
            throws IOException {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("output", "minimal");
        ObjectNode match = body.putObject("match");
        match.put("class", target.collection());
        ObjectNode where = match.putObject("where");
        where.put("operator", "And");
        var operands = where.putArray("operands");
        ObjectNode document = operands.addObject();
        document.putArray("path").add("documentId");
        document.put("operator", "Equal");
        document.put("valueText", documentId);
        ObjectNode tail = operands.addObject();
        tail.putArray("path").add("chunkIndex");
        tail.put("operator", "GreaterThanEqual");
        tail.put("valueInt", count);
        String path = "/v1/batch/objects";
        if (!target.namespace().equals("__default__"))
            path += "?tenant=" + encode(target.namespace());
        for (int attempt = 0; attempt < 100; attempt++) {
            JsonNode result =
                    request(
                                    connection,
                                    "DELETE",
                                    path,
                                    "application/json",
                                    objectMapper.writeValueAsBytes(body))
                            .path("results");
            if (!result.has("failed") || result.path("failed").asInt() != 0) {
                throw new IOException("Weaviate could not remove obsolete document chunks");
            }
            if (result.path("matches").asInt() <= result.path("successful").asInt()) return;
            if (result.path("successful").asInt() == 0) break;
        }
        throw new IOException("Weaviate did not finish removing obsolete document chunks");
    }

    private JsonNode request(
            VectorDbConnectionSettings connection,
            String method,
            String path,
            String contentType,
            byte[] body)
            throws IOException {
        for (int attempt = 0; ; attempt++) {
            ExternalApiCaller.Response response =
                    caller.dispatch(
                            connection.api(),
                            method,
                            path,
                            ExternalApiCaller.raw(contentType, body),
                            Map.of());
            if (attempt < 2 && (response.status() == 429 || response.status() >= 500)) {
                try {
                    Thread.sleep(250L << attempt);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IOException("Vector indexing interrupted", e);
                }
                continue;
            }
            requireSuccess(response);
            return response.body().length == 0
                    ? objectMapper.createObjectNode()
                    : objectMapper.readTree(response.body());
        }
    }

    private static void requireSuccess(ExternalApiCaller.Response response) throws IOException {
        if (response.status() < 200 || response.status() >= 300) {
            throw new IOException(
                    "Vector database returned HTTP "
                            + response.status()
                            + "; check credentials, collection, text field and server-side embedding configuration");
        }
    }

    private static String chunkId(String documentId, int index) {
        return UUID.nameUUIDFromBytes((documentId + ":" + index).getBytes(StandardCharsets.UTF_8))
                .toString();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }
}

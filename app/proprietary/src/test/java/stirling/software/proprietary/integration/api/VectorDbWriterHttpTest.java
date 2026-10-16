package stirling.software.proprietary.integration.api;

import static org.junit.jupiter.api.Assertions.*;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.output.CorpusChunk;
import stirling.software.proprietary.policy.output.VectorDbTarget;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class VectorDbWriterHttpTest {
    private record Request(String method, String authorization, JsonNode body) {}

    @Test
    void sendsAuthenticatedBatchesWithStableIdsThenDeletesOnlyTheObsoleteTail() throws Exception {
        var mapper = JsonMapper.builder().build();
        var requests = new ConcurrentLinkedQueue<Request>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext(
                "/v1/schema/Documents",
                exchange -> {
                    byte[] response =
                            "{\"vectorizer\":\"text2vec-openai\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.createContext(
                "/v1/batch/objects",
                exchange -> {
                    JsonNode body = mapper.readTree(exchange.getRequestBody().readAllBytes());
                    requests.add(
                            new Request(
                                    exchange.getRequestMethod(),
                                    exchange.getRequestHeaders().getFirst("Authorization"),
                                    body));
                    byte[] response;
                    if (exchange.getRequestMethod().equals("POST")) {
                        var results = mapper.createArrayNode();
                        body.path("objects")
                                .forEach(
                                        ignored ->
                                                results.addObject()
                                                        .putObject("result")
                                                        .put("status", "SUCCESS"));
                        response = mapper.writeValueAsBytes(results);
                    } else {
                        response =
                                "{\"results\":{\"failed\":0,\"matches\":0,\"successful\":0}}"
                                        .getBytes(StandardCharsets.UTF_8);
                    }
                    exchange.sendResponseHeaders(200, response.length);
                    exchange.getResponseBody().write(response);
                    exchange.close();
                });
        server.start();
        try {
            var properties = new ApplicationProperties();
            properties.getPolicies().setAllowPrivateApiEndpoints(true);
            var writer = new VectorDbWriter(new ExternalApiCaller(properties, mapper), mapper);
            var connection =
                    VectorDbConnectionSettings.from(
                            Map.of(
                                    "vendor",
                                    "weaviate",
                                    "token",
                                    "test-key",
                                    "baseUrl",
                                    "http://127.0.0.1:" + server.getAddress().getPort()));
            var target = new VectorDbTarget(1, "Documents", "__default__", "content");
            var chunks = new ArrayList<CorpusChunk>();
            for (int i = 0; i < 17; i++)
                chunks.add(new CorpusChunk("old", i, "text " + i, 1, 2, List.of("Heading")));
            writer.replace(connection, target, "external-doc", chunks);
            writer.replace(
                    connection,
                    target,
                    "external-doc",
                    List.of(new CorpusChunk("new", 0, "updated", 1, 1, List.of())));
            List<Request> sent = List.copyOf(requests);
            assertEquals(
                    List.of("POST", "POST", "DELETE", "POST", "DELETE"),
                    sent.stream().map(Request::method).toList());
            assertTrue(
                    sent.stream()
                            .allMatch(
                                    request -> "Bearer test-key".equals(request.authorization())));
            JsonNode first = sent.getFirst().body().path("objects").get(0);
            JsonNode replacement = sent.get(3).body().path("objects").get(0);
            assertEquals(first.path("id"), replacement.path("id"));
            assertEquals("updated", replacement.path("properties").path("content").asString());
            assertEquals("external-doc", first.path("properties").path("documentId").asString());
            JsonNode operands = sent.getLast().body().path("match").path("where").path("operands");
            assertEquals("external-doc", operands.get(0).path("valueText").asString());
            assertEquals(1, operands.get(1).path("valueInt").asInt());
        } finally {
            server.stop(0);
        }
    }
}

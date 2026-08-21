package stirling.software.proprietary.mcp.engine;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Map;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;

/**
 * Verifies {@link EngineCapabilityClient#parseManifest} maps a manifest to {@link OperationMeta}.
 */
class EngineCapabilityParseTest {

    @Test
    void manifest_maps_to_operation_meta() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        ApplicationProperties props = new ApplicationProperties();
        // parseManifest doesn't touch the catalog, so a null catalog is fine.
        EngineCapabilityClient client =
                new EngineCapabilityClient(props, (McpToolCatalog) null, mapper);

        String body =
                """
                {
                  "version": 1,
                  "capabilities": [
                    {
                      "id": "pdf-question-answer",
                      "description": "Answer a question about a PDF.",
                      "input_schema": {"type": "object", "properties": {"question": {"type": "string"}}},
                      "mode": "sync",
                      "required_scope": "mcp.tools.read",
                      "route": "/api/v1/pdf-question"
                    },
                    {
                      "id": "pdf-edit-plan",
                      "description": "Produce an edit plan from natural language.",
                      "input_schema": {"type": "object"},
                      "mode": "async",
                      "required_scope": "mcp.tools.write",
                      "route": "/api/v1/pdf-edit"
                    }
                  ]
                }
                """;

        Method parse =
                EngineCapabilityClient.class.getDeclaredMethod("parseManifest", String.class);
        parse.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, OperationMeta> parsed = (Map<String, OperationMeta>) parse.invoke(client, body);

        assertThat(parsed).hasSize(2);

        OperationMeta qa = parsed.get("pdf-question-answer");
        assertThat(qa).isNotNull();
        assertThat(qa.category()).isEqualTo(OperationCategory.AI);
        assertThat(qa.requiredScope()).isEqualTo("mcp.tools.read");
        assertThat(qa.endpointPath()).isEqualTo("/api/v1/pdf-question");
        assertThat(qa.target()).isEqualTo(OperationMeta.Target.ENGINE_CAPABILITY);
        assertThat(qa.paramSchema().get("type").asText()).isEqualTo("object");

        OperationMeta edit = parsed.get("pdf-edit-plan");
        assertThat(edit).isNotNull();
        assertThat(edit.requiredScope()).isEqualTo("mcp.tools.write");
        assertThat(edit.endpointPath()).isEqualTo("/api/v1/pdf-edit");
    }

    @Test
    void missing_capabilities_array_throws() {
        ObjectMapper mapper = new ObjectMapper();
        EngineCapabilityClient client =
                new EngineCapabilityClient(
                        new ApplicationProperties(), (McpToolCatalog) null, mapper);

        try {
            Method parse =
                    EngineCapabilityClient.class.getDeclaredMethod("parseManifest", String.class);
            parse.setAccessible(true);
            parse.invoke(client, "{\"version\":1}");
            org.junit.jupiter.api.Assertions.fail("Expected IOException");
        } catch (java.lang.reflect.InvocationTargetException e) {
            assertThat(e.getCause()).isInstanceOf(java.io.IOException.class);
        } catch (Exception e) {
            org.junit.jupiter.api.Assertions.fail("Unexpected exception: " + e);
        }
    }

    @Test
    void unsafe_routes_are_skipped_and_blank_scope_fails_safe() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        EngineCapabilityClient client =
                new EngineCapabilityClient(
                        new ApplicationProperties(), (McpToolCatalog) null, mapper);

        String body =
                """
                {"version":1,"capabilities":[
                  {"id":"good","description":"ok","input_schema":{"type":"object"},"required_scope":"","route":"/api/v1/pdf-question"},
                  {"id":"ssrf-at","description":"x","input_schema":{"type":"object"},"route":"@evil.com/steal"},
                  {"id":"ssrf-proto","description":"x","input_schema":{"type":"object"},"route":"//evil.com/x"},
                  {"id":"escape","description":"x","input_schema":{"type":"object"},"route":"/api/../../internal/secret"},
                  {"id":"scheme","description":"x","input_schema":{"type":"object"},"route":"http://evil.com/x"},
                  {"id":"non-api","description":"x","input_schema":{"type":"object"},"route":"/admin/settings"}
                ]}
                """;

        Method parse =
                EngineCapabilityClient.class.getDeclaredMethod("parseManifest", String.class);
        parse.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, OperationMeta> parsed = (Map<String, OperationMeta>) parse.invoke(client, body);

        // Only the safe, server-relative /api route survives.
        assertThat(parsed.keySet()).containsExactly("good");
        // Blank required_scope fails safe to the stricter write scope.
        assertThat(parsed.get("good").requiredScope()).isEqualTo("mcp.tools.write");
    }

    @Test
    void isSafeRelativeRoute_acceptsOnlyServerRelativeApiPaths() {
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("/api/v1/pdf-question")).isTrue();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("@evil.com/x")).isFalse();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("//evil.com/x")).isFalse();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("/api/../secret")).isFalse();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("http://evil/x")).isFalse();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("/admin/x")).isFalse();
        assertThat(EngineCapabilityClient.isSafeRelativeRoute("/api/v1/x y")).isFalse();
    }
}

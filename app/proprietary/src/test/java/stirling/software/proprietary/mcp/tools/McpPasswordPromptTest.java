package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpPasswordPromptTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private OperationMeta op(boolean withPasswords) {
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode props = schema.putObject("properties");
        props.putObject("keyLength").put("type", "integer");
        if (withPasswords) {
            props.putObject("password").put("type", "string").put("format", "password");
            props.putObject("ownerPassword").put("type", "string").put("format", "password");
        }
        return new OperationMeta(
                "add-password",
                OperationCategory.SECURITY,
                "Add password",
                schema,
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/security/add-password",
                null);
    }

    private McpCallContext modern(String capabilities, String inputResponses) {
        return new McpCallContext(
                "alice",
                Set.of(),
                false,
                capabilities == null ? null : mapper.readTree(capabilities),
                inputResponses == null ? null : mapper.readTree(inputResponses));
    }

    private JsonNode params(String json) {
        return mapper.readTree(json);
    }

    @Test
    void formCapableClient_isAskedForEveryPasswordField() {
        McpPasswordPrompt.Outcome out =
                McpPasswordPrompt.apply(
                        mapper,
                        op(true),
                        params("{\"keyLength\":256}"),
                        modern("{\"elicitation\":{}}", null));

        ObjectNode result = out.response();
        assertEquals("input_required", result.get("resultType").asText());
        JsonNode request = result.get("inputRequests").get(McpPasswordPrompt.INPUT_KEY);
        assertEquals("elicitation/create", request.get("method").asText());
        assertEquals("form", request.get("params").get("mode").asText());
        JsonNode fields = request.get("params").get("requestedSchema").get("properties");
        assertEquals("Password", fields.get("password").get("title").asText());
        assertEquals("Owner password", fields.get("ownerPassword").get("title").asText());
        assertFalse(fields.has("keyLength"));
    }

    @Test
    void signingWithTheServersCertificate_neverAsksForAPassword() {
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode props = schema.putObject("properties");
        props.putObject("certType").put("type", "string");
        props.putObject("password").put("type", "string").put("format", "password");
        OperationMeta certSign =
                new OperationMeta(
                        "cert-sign",
                        OperationCategory.SECURITY,
                        "Sign",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/security/cert-sign",
                        null);
        McpCallContext context = modern("{\"elicitation\":{}}", null);

        McpPasswordPrompt.Outcome server =
                McpPasswordPrompt.apply(
                        mapper, certSign, params("{\"certType\":\"SERVER\"}"), context);
        McpPasswordPrompt.Outcome keystore =
                McpPasswordPrompt.apply(
                        mapper, certSign, params("{\"certType\":\"PKCS12\"}"), context);

        assertNull(server.response());
        JsonNode form = keystore.response().get("inputRequests").get(McpPasswordPrompt.INPUT_KEY);
        assertTrue(form.get("params").get("message").asText().contains("certificate's password"));
    }

    @Test
    void acceptedAnswer_isMergedAndBlankFieldsSkipped() {
        McpPasswordPrompt.Outcome out =
                McpPasswordPrompt.apply(
                        mapper,
                        op(true),
                        params("{\"keyLength\":256}"),
                        modern(
                                "{\"elicitation\":{\"form\":{}}}",
                                "{\"stirling_passwords\":{\"action\":\"accept\","
                                        + "\"content\":{\"password\":\"s3cret\",\"ownerPassword\":\"\"}}}"));

        assertNull(out.response());
        assertEquals("s3cret", out.parameters().get("password").asText());
        assertEquals(256, out.parameters().get("keyLength").asInt());
        assertFalse(out.parameters().has("ownerPassword"));
    }

    @Test
    void declinedAnswer_cancelsTheOperation() {
        McpPasswordPrompt.Outcome out =
                McpPasswordPrompt.apply(
                        mapper,
                        op(true),
                        null,
                        modern(
                                "{\"elicitation\":{}}",
                                "{\"stirling_passwords\":{\"action\":\"decline\"}}"));

        assertTrue(out.response().get("isError").asBoolean());
        assertTrue(out.response().get("content").get(0).get("text").asText().contains("cancelled"));
    }

    @Test
    void passwordFromTheModel_isUsedWithoutAsking() {
        JsonNode given = params("{\"password\":\"from-model\"}");

        McpPasswordPrompt.Outcome out =
                McpPasswordPrompt.apply(
                        mapper, op(true), given, modern("{\"elicitation\":{}}", null));

        assertNull(out.response());
        assertSame(given, out.parameters());
    }

    @Test
    void clientsThatCannotShowAForm_keepTheOldBehaviour() {
        JsonNode given = params("{}");
        for (McpCallContext ctx :
                new McpCallContext[] {
                    new McpCallContext("alice", Set.of(), false),
                    modern("{}", null),
                    modern("{\"elicitation\":{\"url\":{}}}", null)
                }) {
            McpPasswordPrompt.Outcome out = McpPasswordPrompt.apply(mapper, op(true), given, ctx);
            assertNull(out.response());
            assertSame(given, out.parameters());
        }
    }

    @Test
    void operationsWithoutPasswords_areUntouched() {
        McpPasswordPrompt.Outcome out =
                McpPasswordPrompt.apply(
                        mapper, op(false), null, modern("{\"elicitation\":{}}", null));

        assertNull(out.response());
        assertNull(out.parameters());
    }
}

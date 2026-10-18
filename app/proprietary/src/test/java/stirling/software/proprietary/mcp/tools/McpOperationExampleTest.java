package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpOperationExampleTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void exampleFillsRequiredParametersFromDefaultsAndEnums() {
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode props = schema.putObject("properties");
        props.putObject("fileInput").put("type", "string").put("format", "file-id");
        props.putObject("angle").put("type", "integer").put("default", 90);
        props.putObject("mode").put("type", "string").putArray("enum").add("fast").add("slow");
        props.putObject("label").put("type", "string");
        props.putObject("optionalNote").put("type", "string");
        schema.putArray("required").add("fileInput").add("angle").add("mode").add("label");

        ObjectNode example = McpOperationExample.of(mapper, op(schema));

        assertEquals("stirling_pages", example.get("tool").asText());
        ObjectNode args = (ObjectNode) example.get("arguments");
        assertEquals("rotate-pdf", args.get("operation").asText());
        assertEquals("<fileId>", args.get("fileId").asText());
        ObjectNode params = (ObjectNode) args.get("parameters");
        assertEquals(90, params.get("angle").asInt());
        assertEquals("fast", params.get("mode").asText());
        assertEquals("<value>", params.get("label").asText());
        assertFalse(params.has("optionalNote"), "only what the call needs");
        assertFalse(params.has("fileInput"), "the file goes in fileId");
    }

    @Test
    void multiFileOperationsUseFileIds() {
        ObjectNode schema = mapper.createObjectNode();
        schema.putObject("properties").putObject("fileInput").put("type", "array");

        ObjectNode example = McpOperationExample.of(mapper, op(schema));

        assertEquals(2, example.at("/arguments/fileIds").size());
    }

    private static OperationMeta op(ObjectNode schema) {
        return new OperationMeta(
                "rotate-pdf",
                OperationCategory.PAGES,
                "Rotate",
                schema,
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/general/rotate-pdf",
                null);
    }
}

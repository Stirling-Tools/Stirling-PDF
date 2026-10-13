package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class McpParameterCheckTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private ObjectNode schema() {
        ObjectNode schema = mapper.createObjectNode();
        ObjectNode props = schema.putObject("properties");
        props.putObject("optimizeLevel")
                .put("type", "integer")
                .putArray("enum")
                .add("1")
                .add("5")
                .add("9");
        props.putObject("opacity").put("type", "number").put("minimum", 0).put("maximum", 1);
        props.putObject("flag").put("type", "boolean");
        props.putObject("languages").put("type", "array").putObject("items").put("type", "string");
        return schema;
    }

    @Test
    void outOfRangeAndUnknownValuesAreReported() {
        ObjectNode params =
                mapper.createObjectNode()
                        .put("optimizeLevel", 999)
                        .put("opacity", 1.5)
                        .put("flag", "yes");

        List<String> problems = McpParameterCheck.problems(schema(), params);

        assertEquals(3, problems.size());
        assertTrue(problems.get(0).startsWith("optimizeLevel must be one of"));
        assertTrue(problems.get(1).startsWith("opacity must be at most"));
        assertTrue(problems.get(2).startsWith("flag must be true or false"));
    }

    @Test
    void validValuesInTheirUsualShapesPass() {
        ObjectNode params =
                mapper.createObjectNode()
                        .put("optimizeLevel", "5")
                        .put("opacity", 0.5)
                        .put("flag", "true")
                        .put("unknownExtra", "kept for the endpoint");
        params.putArray("languages").add("eng");

        assertTrue(McpParameterCheck.problems(schema(), params).isEmpty());
        assertTrue(
                McpParameterCheck.problems(
                                schema(), mapper.createObjectNode().put("optimizeLevel", 9))
                        .isEmpty());
    }

    @Test
    void allowedValuesAreSpelledAsTheEndpointExpects() {
        ObjectNode schema =
                (ObjectNode)
                        mapper.readTree(
                                """
                                {"properties":{"certType":{"type":"string","enum":["SERVER","PEM"]},
                                 "langs":{"type":"array","items":{"type":"string",
                                 "enum":["eng","chi_sim"]}},"name":{"type":"string"}}}
                                """);
        ObjectNode params = mapper.createObjectNode().put("certType", "server").put("name", "x");
        params.putArray("langs").add("ENG").add("Chi_Sim");

        tools.jackson.databind.JsonNode fixed = McpParameterCheck.canonical(schema, params);

        assertEquals("SERVER", fixed.get("certType").asText());
        assertEquals("[\"eng\",\"chi_sim\"]", fixed.get("langs").toString());
        assertEquals("x", fixed.get("name").asText());
        assertEquals("server", params.get("certType").asText(), "the caller's copy is untouched");
    }
}

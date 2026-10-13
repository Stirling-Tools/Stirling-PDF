package stirling.software.proprietary.mcp.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.JsonNodeFactory;
import tools.jackson.databind.node.ObjectNode;

/** Checks call parameters against the operation's published schema before anything runs. */
final class McpParameterCheck {

    private static final String MAIN_INPUT = "fileInput";
    private static final JsonNode MISSING_PARAMETERS = JsonNodeFactory.instance.objectNode();

    private McpParameterCheck() {}

    /** Problems found, one per parameter; empty when the call matches the schema. */
    static List<String> problems(JsonNode schema, JsonNode parameters) {
        return problems(schema, parameters, null);
    }

    /** As above, where {@code input} is a file list filled from the call's fileIds instead. */
    static List<String> problems(JsonNode schema, JsonNode parameters, String input) {
        List<String> problems = new ArrayList<>();
        JsonNode properties = schema == null ? null : schema.get("properties");
        if (properties == null || !properties.isObject()) {
            return problems;
        }
        JsonNode given =
                parameters != null && parameters.isObject() ? parameters : MISSING_PARAMETERS;
        for (JsonNode required : schema.path("required")) {
            String name = required.asText();
            JsonNode value = given.get(name);
            // The main input travels as fileId/fileIds, not as a parameter.
            if (!MAIN_INPUT.equals(name)
                    && !name.equals(input)
                    && (value == null || value.isNull())) {
                problems.add(name + " is required");
            }
        }
        boolean closed =
                schema.path("additionalProperties").isBoolean()
                        && !schema.path("additionalProperties").asBoolean();
        for (Map.Entry<String, JsonNode> e : given.properties()) {
            JsonNode prop = properties.get(e.getKey());
            JsonNode value = e.getValue();
            if (prop == null && closed) {
                problems.add(e.getKey() + " is not a parameter of this operation");
                continue;
            }
            if (prop == null || value == null || value.isNull()) {
                continue;
            }
            String problem = check(prop, value);
            if (problem != null) {
                problems.add(e.getKey() + " " + problem);
            }
        }
        return problems;
    }

    /**
     * The parameters with each allowed value spelled as the schema spells it. Matching ignores
     * case, but endpoints compare exactly, so "server" must reach them as "SERVER".
     */
    static JsonNode canonical(JsonNode schema, JsonNode parameters) {
        JsonNode properties = schema == null ? null : schema.get("properties");
        if (properties == null || parameters == null || !parameters.isObject()) {
            return parameters;
        }
        ObjectNode out = ((ObjectNode) parameters).deepCopy();
        for (Map.Entry<String, JsonNode> e : parameters.properties()) {
            JsonNode prop = properties.get(e.getKey());
            if (prop == null) {
                continue;
            }
            JsonNode value = e.getValue();
            if (value.isArray() && prop.path("items").get("enum") != null) {
                ArrayNode items = out.putArray(e.getKey());
                value.forEach(item -> items.add(spelled(prop.path("items").get("enum"), item)));
            } else if (prop.get("enum") != null) {
                out.set(e.getKey(), spelled(prop.get("enum"), value));
            }
        }
        return out;
    }

    private static JsonNode spelled(JsonNode allowed, JsonNode value) {
        if (!value.isTextual()) {
            return value;
        }
        for (JsonNode option : allowed) {
            if (option.isTextual() && option.asText().equalsIgnoreCase(value.asText())) {
                return option;
            }
        }
        return value;
    }

    private static String check(JsonNode prop, JsonNode value) {
        String type = prop.path("type").asText("");
        if ("array".equals(type)) {
            if (!value.isArray()) {
                return null; // A single value is sent as a one-item list.
            }
            for (JsonNode item : value) {
                String problem = check(prop.path("items"), item);
                if (problem != null) {
                    return problem;
                }
            }
            return null;
        }
        Double number = null;
        if ("integer".equals(type) || "number".equals(type)) {
            number = asNumber(value);
            if (number == null) {
                return "must be a number, got " + value;
            }
            if ("integer".equals(type) && number != Math.rint(number)) {
                return "must be a whole number, got " + value;
            }
        }
        if ("boolean".equals(type) && !value.isBoolean() && !isBooleanText(value)) {
            return "must be true or false, got " + value;
        }
        JsonNode allowed = prop.get("enum");
        if (allowed != null
                && allowed.isArray()
                && !allowed.isEmpty()
                && !matches(allowed, value)) {
            return "must be one of " + allowed + ", got " + value;
        }
        if (number != null && prop.has("minimum") && number < prop.get("minimum").asDouble()) {
            return "must be at least " + prop.get("minimum") + ", got " + value;
        }
        if (number != null && prop.has("maximum") && number > prop.get("maximum").asDouble()) {
            return "must be at most " + prop.get("maximum") + ", got " + value;
        }
        return null;
    }

    private static Double asNumber(JsonNode value) {
        if (value.isNumber()) {
            return value.asDouble();
        }
        if (value.isTextual()) {
            try {
                return Double.parseDouble(value.asText().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static boolean isBooleanText(JsonNode value) {
        String text = value.asText("");
        return "true".equalsIgnoreCase(text) || "false".equalsIgnoreCase(text);
    }

    /** Enum values from @Schema are strings, so "5" and 5 both match. */
    private static boolean matches(JsonNode allowed, JsonNode value) {
        String text =
                value.isNumber() && value.asDouble() == Math.rint(value.asDouble())
                        ? Long.toString(value.asLong())
                        : value.asText();
        for (JsonNode option : allowed) {
            if (option.asText().equalsIgnoreCase(text)) {
                return true;
            }
        }
        return false;
    }
}

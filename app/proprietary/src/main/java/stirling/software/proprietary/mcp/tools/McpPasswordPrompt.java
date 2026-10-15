package stirling.software.proprietary.mcp.tools;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Asks the user for an operation's passwords via MRTR, so they never pass through the model. */
final class McpPasswordPrompt {

    static final String INPUT_KEY = "stirling_passwords";
    // These certificate types never use a password: the server's own, or the OS prompts for it.
    private static final Set<String> NO_PASSWORD_CERTS = Set.of("SERVER", "WINDOWS_STORE");

    private McpPasswordPrompt() {}

    /** Parameters to send on, or a response to return instead (a prompt or a cancellation). */
    record Outcome(JsonNode parameters, ObjectNode response) {}

    static Outcome apply(
            ObjectMapper mapper, OperationMeta meta, JsonNode parameters, McpCallContext context) {
        return apply(mapper, meta, parameters, context, INPUT_KEY);
    }

    /** As above under its own input key, so several steps can ask in one round. */
    static Outcome apply(
            ObjectMapper mapper,
            OperationMeta meta,
            JsonNode parameters,
            McpCallContext context,
            String key) {
        List<String> fields = passwordFields(meta.paramSchema());
        if (fields.isEmpty()
                || context == null
                || anyProvided(parameters, fields)
                || needsNoPassword(meta, parameters)) {
            return new Outcome(parameters, null);
        }
        JsonNode answer = context.inputResponse(key);
        if (answer != null) {
            if (!"accept".equals(answer.path("action").asText())) {
                return new Outcome(
                        null,
                        McpResponses.error(
                                mapper, meta.id() + " cancelled: no password was entered."));
            }
            return new Outcome(merge(mapper, parameters, answer.path("content"), fields), null);
        }
        if (!context.canElicitForm()) {
            return new Outcome(parameters, null);
        }
        return new Outcome(
                null, McpResponses.inputRequired(mapper, key, form(mapper, meta, fields)));
    }

    static List<String> passwordFields(JsonNode schema) {
        List<String> fields = new ArrayList<>();
        JsonNode properties = schema == null ? null : schema.get("properties");
        if (properties != null) {
            properties
                    .properties()
                    .forEach(
                            e -> {
                                if ("password".equals(e.getValue().path("format").asText())) {
                                    fields.add(e.getKey());
                                }
                            });
        }
        return fields;
    }

    private static boolean needsNoPassword(OperationMeta meta, JsonNode parameters) {
        if (!"cert-sign".equals(meta.id()) || parameters == null) {
            return false;
        }
        String type = parameters.path("certType").asText("").toUpperCase(Locale.ROOT);
        return NO_PASSWORD_CERTS.contains(type);
    }

    private static boolean anyProvided(JsonNode parameters, List<String> fields) {
        if (parameters == null || !parameters.isObject()) {
            return false;
        }
        return fields.stream()
                .anyMatch(f -> parameters.hasNonNull(f) && !parameters.get(f).asText().isEmpty());
    }

    private static JsonNode merge(
            ObjectMapper mapper, JsonNode parameters, JsonNode content, List<String> fields) {
        ObjectNode merged =
                parameters != null && parameters.isObject()
                        ? ((ObjectNode) parameters).deepCopy()
                        : mapper.createObjectNode();
        for (String field : fields) {
            JsonNode value = content.get(field);
            if (value != null && value.isTextual() && !value.asText().isEmpty()) {
                merged.put(field, value.asText());
            }
        }
        return merged;
    }

    private static ObjectNode form(ObjectMapper mapper, OperationMeta meta, List<String> fields) {
        ObjectNode params = mapper.createObjectNode();
        params.put("mode", "form");
        params.put("message", message(meta.id()));
        ObjectNode schema = params.putObject("requestedSchema");
        schema.put("type", "object");
        ObjectNode properties = schema.putObject("properties");
        for (String field : fields) {
            properties.putObject(field).put("type", "string").put("title", label(field));
        }
        return params;
    }

    private static String message(String operation) {
        String privacy = " It goes straight to Stirling PDF, not to the assistant.";
        return switch (operation) {
            case "add-password" ->
                    "Choose the password to open this PDF, and optionally an owner password that"
                            + " guards its restrictions."
                            + privacy
                            + " Leave a field empty to skip it.";
            case "cert-sign" ->
                    "Enter the certificate's password (or the token PIN)."
                            + privacy
                            + " Leave it empty if the certificate has none.";
            default ->
                    "Enter the password for "
                            + operation
                            + "."
                            + privacy
                            + " Leave a field empty if the PDF has no such password.";
        };
    }

    /** {@code ownerPassword} becomes "Owner password". */
    static String label(String field) {
        String spaced = field.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}

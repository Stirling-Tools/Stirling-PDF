package stirling.software.proprietary.mcp.tools;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import tools.jackson.databind.JsonNode;

/** One-line parameter summary, e.g. {@code (angle:0|90|180|270, pages?:string)}, for listings. */
final class McpOperationSignature {

    private static final int MAX_PARAMS = 8;
    // Allowed values are shown in full up to this many characters, so none hide behind "...".
    private static final int MAX_ENUM_CHARS = 90;
    private static final int MAX_DEFAULT = 16;
    // The main input travels as file/fileId/inputFile, so the request's own fields are noise here.
    private static final Set<String> FILE_FIELDS = Set.of("fileInput", "fileId", "fileUrl");

    private McpOperationSignature() {}

    static String of(JsonNode paramSchema) {
        JsonNode properties = paramSchema == null ? null : paramSchema.get("properties");
        if (properties == null || !properties.isObject()) {
            return "";
        }
        Set<String> required = new HashSet<>();
        paramSchema.path("required").forEach(r -> required.add(r.asText()));
        List<Map.Entry<String, JsonNode>> needed = new ArrayList<>();
        List<Map.Entry<String, JsonNode>> files = new ArrayList<>();
        List<Map.Entry<String, JsonNode>> optional = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : properties.properties()) {
            if (FILE_FIELDS.contains(e.getKey())) {
                continue;
            }
            if (isFile(e.getValue())) {
                files.add(e);
            } else if (required.contains(e.getKey())) {
                needed.add(e);
            } else {
                optional.add(e);
            }
        }
        // Required first and file inputs always, so the cap never hides what a call needs.
        List<String> parts = new ArrayList<>();
        List<String> hidden = new ArrayList<>();
        for (Map.Entry<String, JsonNode> e : needed) {
            parts.add(param(e, required));
        }
        for (Map.Entry<String, JsonNode> e : files) {
            parts.add(param(e, required));
        }
        for (Map.Entry<String, JsonNode> e : optional) {
            if (parts.size() >= MAX_PARAMS + files.size()) {
                hidden.add(e.getKey());
            } else {
                parts.add(param(e, required));
            }
        }
        if (!hidden.isEmpty()) {
            parts.add("+" + hidden.size() + " more: " + String.join(", ", hidden));
        }
        return parts.isEmpty() ? "" : "(" + String.join(", ", parts) + ")";
    }

    private static String param(Map.Entry<String, JsonNode> e, Set<String> required) {
        String optional = required.contains(e.getKey()) ? "" : "?";
        return e.getKey() + optional + ":" + type(e.getValue()) + defaultOf(e.getValue());
    }

    private static boolean isFile(JsonNode prop) {
        return "file-id".equals(prop.path("format").asText())
                || "file-id".equals(prop.path("items").path("format").asText());
    }

    /** "=value" for a short default, so agents can see what an omitted parameter means. */
    private static String defaultOf(JsonNode prop) {
        JsonNode value = prop.get("default");
        if (value == null || value.isNull() || value.isObject()) {
            return "";
        }
        String text;
        if (value.isArray()) {
            List<String> items = new ArrayList<>();
            value.forEach(v -> items.add(v.asText()));
            text = String.join(",", items);
        } else {
            text = value.asText();
        }
        return text.isEmpty() || text.length() > MAX_DEFAULT ? "" : "=" + text;
    }

    private static String type(JsonNode prop) {
        if ("file-id".equals(prop.path("format").asText())) {
            return "fileId";
        }
        JsonNode values = prop.get("enum");
        if (values != null && values.isArray() && !values.isEmpty()) {
            return allowed(values);
        }
        String type = prop.path("type").asText("any");
        if ("array".equals(type)) {
            JsonNode items = prop.path("items");
            if ("file-id".equals(items.path("format").asText())) {
                return "fileId[]";
            }
            JsonNode itemValues = items.get("enum");
            if (itemValues != null && itemValues.isArray() && !itemValues.isEmpty()) {
                return "(" + allowed(itemValues) + ")[]";
            }
            return items.path("type").asText("any") + "[]";
        }
        return type;
    }

    /** "1-9" for a run of whole numbers, else every value up to a length budget. */
    private static String allowed(JsonNode values) {
        String range = range(values);
        if (range != null) {
            return range;
        }
        StringBuilder shown = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            String value = values.get(i).asText();
            if (i > 0 && shown.length() + value.length() + 1 > MAX_ENUM_CHARS) {
                return shown + "|...";
            }
            shown.append(i == 0 ? "" : "|").append(value);
        }
        return shown.toString();
    }

    private static String range(JsonNode values) {
        if (values.size() < 4) {
            return null;
        }
        long first;
        try {
            first = Long.parseLong(values.get(0).asText());
            for (int i = 1; i < values.size(); i++) {
                if (Long.parseLong(values.get(i).asText()) != first + i) {
                    return null;
                }
            }
        } catch (NumberFormatException e) {
            return null;
        }
        return first + "-" + (first + values.size() - 1);
    }
}

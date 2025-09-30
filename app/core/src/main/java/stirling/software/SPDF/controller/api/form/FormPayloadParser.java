package stirling.software.SPDF.controller.api.form;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.FormUtils;

final class FormPayloadParser {

    private static final String KEY_FIELDS = "fields";
    private static final String KEY_NAME = "name";
    private static final String KEY_TARGET_NAME = "targetName";
    private static final String KEY_FIELD_NAME = "fieldName";
    private static final String KEY_FIELD = "field";
    private static final String KEY_VALUE = "value";
    private static final String KEY_DEFAULT_VALUE = "defaultValue";

    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<FormUtils.ModifyFormFieldDefinition>>
            MODIFY_FIELD_LIST_TYPE = new TypeReference<>() {};
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {};

    private FormPayloadParser() {}

    static Map<String, Object> parseValueMap(ObjectMapper objectMapper, String json)
            throws IOException {
        if (json == null || json.isBlank()) {
            return Map.of();
        }

        JsonNode root;
        try {
            root = objectMapper.readTree(json);
        } catch (IOException e) {
            // Fallback to legacy direct map parse (will throw again if invalid)
            return objectMapper.readValue(json, MAP_TYPE);
        }
        if (root == null || root.isNull()) {
            return Map.of();
        }

        // 1. If payload already a flat object with no special wrapping, keep legacy behavior
        if (root.isObject()) {
            // a) Prefer explicit 'template' object if present (new combined /fields response)
            JsonNode templateNode = root.get("template");
            if (templateNode != null && templateNode.isObject()) {
                return objectToLinkedMap(templateNode);
            }
            // b) Accept an inline 'fields' array of field definitions (build map from them)
            JsonNode fieldsNode = root.get(KEY_FIELDS);
            if (fieldsNode != null && fieldsNode.isArray()) {
                Map<String, Object> record = extractFieldInfoArray(fieldsNode);
                if (!record.isEmpty()) {
                    return record;
                }
            }
            // c) Fallback: treat entire object as the value map (legacy behavior)
            return objectToLinkedMap(root);
        }

        // 2. If an array was supplied to /fill (non-standard), treat first element as record
        if (root.isArray()) {
            if (root.isEmpty()) {
                return Map.of();
            }
            JsonNode first = root.get(0);
            if (first != null && first.isObject()) {
                if (first.has(KEY_NAME) || first.has(KEY_VALUE) || first.has(KEY_DEFAULT_VALUE)) {
                    return extractFieldInfoArray(root);
                }
                return objectToLinkedMap(first);
            }
            return Map.of();
        }

        // 3. Anything else: fallback to strict map parse
        return objectMapper.readValue(json, MAP_TYPE);
    }

    static List<FormUtils.ModifyFormFieldDefinition> parseModificationDefinitions(
            ObjectMapper objectMapper, String json) throws IOException {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        return objectMapper.readValue(json, MODIFY_FIELD_LIST_TYPE);
    }

    static List<String> parseNameList(ObjectMapper objectMapper, String json) throws IOException {
        if (json == null || json.isBlank()) {
            return List.of();
        }

        final JsonNode root = objectMapper.readTree(json);
        if (root == null || root.isNull()) {
            return List.of();
        }

        final Set<String> names = new LinkedHashSet<>();

        if (root.isArray()) {
            collectNames(root, names);
        } else if (root.isObject()) {
            if (root.has(KEY_FIELDS) && root.get(KEY_FIELDS).isArray()) {
                collectNames(root.get(KEY_FIELDS), names);
            } else {
                final String single = extractName(root);
                if (nonBlank(single)) {
                    names.add(single);
                }
            }
        } else if (root.isTextual()) {
            final String single = trimToNull(root.asText());
            if (single != null) {
                names.add(single);
            }
        }

        if (!names.isEmpty()) {
            return List.copyOf(names);
        }

        try {
            return objectMapper.readValue(json, STRING_LIST_TYPE);
        } catch (IOException e) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "names payload",
                    "expected array of strings or objects with 'name'-like properties");
        }
    }

    private static Map<String, Object> extractFieldInfoArray(JsonNode fieldsNode) {
        final Map<String, Object> record = new LinkedHashMap<>();
        if (fieldsNode == null || fieldsNode.isNull() || !fieldsNode.isArray()) {
            return record;
        }

        for (JsonNode fieldNode : fieldsNode) {
            if (fieldNode == null || !fieldNode.isObject()) {
                continue;
            }

            final String name = extractName(fieldNode);
            if (!nonBlank(name)) {
                continue;
            }

            JsonNode valueNode = fieldNode.get(KEY_VALUE);
            if ((valueNode == null || valueNode.isNull())
                    && fieldNode.hasNonNull(KEY_DEFAULT_VALUE)) {
                valueNode = fieldNode.get(KEY_DEFAULT_VALUE);
            }

            final String normalized = normalizeFieldValue(valueNode);
            record.put(name, normalized == null ? "" : normalized);
        }

        return record;
    }

    private static String normalizeFieldValue(JsonNode valueNode) {
        if (valueNode == null || valueNode.isNull()) {
            return null;
        }

        if (valueNode.isArray()) {
            final List<String> values = new ArrayList<>();
            for (JsonNode element : valueNode) {
                final String text = coerceScalarToString(element);
                if (text != null) {
                    values.add(text);
                }
            }
            return String.join(",", values);
        }

        if (valueNode.isObject()) {
            // Preserve object as JSON string
            return valueNode.toString();
        }

        // Scalar (text/number/boolean)
        return coerceScalarToString(valueNode);
    }

    private static String coerceScalarToString(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual()) {
            return trimToEmpty(node.asText());
        }
        if (node.isNumber()) {
            return node.numberValue().toString();
        }
        if (node.isBoolean()) {
            return Boolean.toString(node.booleanValue());
        }
        // Fallback for other scalar-like nodes
        return trimToEmpty(node.asText());
    }

    private static void collectNames(JsonNode arrayNode, Set<String> sink) {
        if (arrayNode == null || !arrayNode.isArray()) {
            return;
        }
        for (JsonNode node : arrayNode) {
            final String name = extractName(node);
            if (nonBlank(name)) {
                sink.add(name);
            }
        }
    }

    private static String extractName(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }

        if (node.isTextual()) {
            return trimToNull(node.asText());
        }

        if (node.isObject()) {
            final String direct = textProperty(node, KEY_NAME, KEY_TARGET_NAME, KEY_FIELD_NAME);
            if (nonBlank(direct)) {
                return direct;
            }
            final JsonNode field = node.get(KEY_FIELD);
            if (field != null && field.isObject()) {
                final String nested =
                        textProperty(field, KEY_NAME, KEY_TARGET_NAME, KEY_FIELD_NAME);
                if (nonBlank(nested)) {
                    return nested;
                }
            }
        }

        return null;
    }

    private static String textProperty(JsonNode node, String... keys) {
        for (String key : keys) {
            final JsonNode valueNode = node.get(key);
            final String value = coerceScalarToString(valueNode);
            if (nonBlank(value)) {
                return value;
            }
        }
        return null;
    }

    private static Map<String, Object> objectToLinkedMap(JsonNode objectNode) {
        final Map<String, Object> result = new LinkedHashMap<>();
        objectNode
                .fieldNames()
                .forEachRemaining(
                        key -> {
                            final JsonNode v = objectNode.get(key);
                            if (v == null || v.isNull()) {
                                result.put(key, null);
                            } else if (v.isTextual() || v.isNumber() || v.isBoolean()) {
                                result.put(key, coerceScalarToString(v));
                            } else {
                                result.put(key, v.toString());
                            }
                        });
        return result;
    }

    private static boolean nonBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        final String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String trimToEmpty(String s) {
        return s == null ? "" : s.trim();
    }
}

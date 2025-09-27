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
        return objectMapper.readValue(json, MAP_TYPE);
    }

    static List<Map<String, Object>> parseRecordArray(ObjectMapper objectMapper, String json)
            throws IOException {
        if (json == null || json.isBlank()) {
            return List.of();
        }

        JsonNode root = objectMapper.readTree(json);
        if (root == null || root.isNull()) {
            return List.of();
        }
        if (!root.isArray()) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "records payload",
                    "must be a JSON array");
        }

        List<Map<String, Object>> records = new ArrayList<>();
        for (JsonNode node : root) {
            Map<String, Object> record = parseRecordNode(objectMapper, node);
            if (record.isEmpty()) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.dataRequired",
                        "{0} must contain at least one populated record",
                        "records payload");
            }
            records.add(record);
        }
        return records;
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

        JsonNode root = objectMapper.readTree(json);
        if (root == null || root.isNull()) {
            return List.of();
        }

        Set<String> names = new LinkedHashSet<>();
        if (root.isArray()) {
            collectNames(root, names);
        } else if (root.has("fields") && root.get("fields").isArray()) {
            collectNames(root.get("fields"), names);
        } else {
            String name = extractName(root);
            if (name != null) {
                names.add(name);
            }
        }

        if (!names.isEmpty()) {
            return List.copyOf(names);
        }

        return objectMapper.readValue(json, STRING_LIST_TYPE);
    }

    private static Map<String, Object> parseRecordNode(ObjectMapper objectMapper, JsonNode node) {
        if (node == null || node.isNull()) {
            return Map.of();
        }

        if (node.isArray()) {
            return extractFieldInfoArray(node);
        }

        if (node.isObject()) {
            JsonNode fieldsNode = node.get("fields");
            if (fieldsNode != null && fieldsNode.isArray()) {
                Map<String, Object> record = extractFieldInfoArray(fieldsNode);
                if (!record.isEmpty()) {
                    return record;
                }
            }
            return objectMapper.convertValue(node, MAP_TYPE);
        }

        throw ExceptionUtils.createIllegalArgumentException(
                "error.invalidFormat",
                "Invalid {0} format: {1}",
                "record",
                "must be a JSON object or an array of field definitions");
    }

    private static Map<String, Object> extractFieldInfoArray(JsonNode fieldsNode) {
        Map<String, Object> record = new LinkedHashMap<>();
        if (fieldsNode == null || fieldsNode.isNull()) {
            return record;
        }

        for (JsonNode fieldNode : fieldsNode) {
            if (fieldNode == null || !fieldNode.isObject()) {
                continue;
            }

            String name = stringValue(fieldNode.get("name"));
            if (name == null || name.isBlank()) {
                continue;
            }

            boolean multiSelect = fieldNode.path("multiSelect").asBoolean(false);
            JsonNode valueNode = fieldNode.get("value");
            if ((valueNode == null || valueNode.isNull()) && fieldNode.hasNonNull("defaultValue")) {
                valueNode = fieldNode.get("defaultValue");
            }

            String value = normalizeFieldValue(valueNode, multiSelect);
            record.put(name, value == null ? "" : value);
        }

        return record;
    }

    private static String normalizeFieldValue(JsonNode valueNode, boolean multiSelect) {
        if (valueNode == null || valueNode.isNull()) {
            return null;
        }

        if (valueNode.isArray()) {
            List<String> values = new ArrayList<>();
            for (JsonNode element : valueNode) {
                String text = stringValue(element);
                if (text != null) {
                    values.add(text);
                }
            }
            return String.join(",", values);
        }

        if (valueNode.isObject()) {
            return valueNode.toString();
        }

        if (multiSelect) {
            return stringValue(valueNode);
        }

        return stringValue(valueNode);
    }

    private static String stringValue(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isTextual()) {
            return node.asText();
        }
        if (node.isNumber()) {
            return node.numberValue().toString();
        }
        if (node.isBoolean()) {
            return Boolean.toString(node.booleanValue());
        }
        return node.toString();
    }

    private static void collectNames(JsonNode arrayNode, Set<String> sink) {
        for (JsonNode node : arrayNode) {
            String name = extractName(node);
            if (name != null && !name.isBlank()) {
                sink.add(name);
            }
        }
    }

    private static String extractName(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }

        if (node.isTextual()) {
            String value = node.asText();
            return value != null && !value.isBlank() ? value : null;
        }

        if (node.isObject()) {
            String direct = textProperty(node, "name", "targetName", "fieldName");
            if (direct != null && !direct.isBlank()) {
                return direct;
            }

            JsonNode field = node.get("field");
            if (field != null && field.isObject()) {
                String nested = textProperty(field, "name", "targetName", "fieldName");
                if (nested != null && !nested.isBlank()) {
                    return nested;
                }
            }
        }

        return null;
    }

    private static String textProperty(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode valueNode = node.get(key);
            String value = stringValue(valueNode);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}

package stirling.software.proprietary.workflow.service;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class WorkflowMetadataValidator {

    private WorkflowMetadataValidator() {}

// Validate at session creation so malformed metadata cannot cause signing-time type errors.
    static Map<String, Object> validate(Map<String, Object> metadata) {
        if (metadata == null) {
            throw invalid("must be a valid JSON object");
        }
        validateType(metadata, "showSignature", Boolean.class);
        validateType(metadata, "pageNumber", Number.class);
        validateType(metadata, "showLogo", Boolean.class);
        validateType(metadata, "includeSummaryPage", Boolean.class);
        validateType(metadata, "reason", String.class);
        validateType(metadata, "location", String.class);
        return metadata;
    }

    static boolean booleanValue(Map<String, Object> metadata, String key, boolean defaultValue) {
        Object value = value(metadata, key, Boolean.class);
        return value == null ? defaultValue : (Boolean) value;
    }

    static Integer integerValue(Map<String, Object> metadata, String key) {
        Object value = value(metadata, key, Number.class);
        return value == null ? null : ((Number) value).intValue();
    }

    static String stringValue(Map<String, Object> metadata, String key) {
        Object value = value(metadata, key, String.class);
        return value == null ? null : (String) value;
    }

    private static Object value(Map<String, Object> metadata, String key, Class<?> expectedType) {
        if (metadata == null || !metadata.containsKey(key)) {
            return null;
        }
        Object value = metadata.get(key);
        if (value == null || !expectedType.isInstance(value)) {
            throw invalid(key + " must be a " + expectedType.getSimpleName());
        }
        return value;
    }

    private static void validateType(
            Map<String, Object> metadata, String key, Class<?> expectedType) {
        if (metadata.containsKey(key)) {
            Object value = metadata.get(key);
            if (value == null || !expectedType.isInstance(value)) {
                throw invalid(key + " must be a " + expectedType.getSimpleName());
            }
        }
    }

    private static ResponseStatusException invalid(String detail) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Invalid workflowMetadata: " + detail);
    }
}

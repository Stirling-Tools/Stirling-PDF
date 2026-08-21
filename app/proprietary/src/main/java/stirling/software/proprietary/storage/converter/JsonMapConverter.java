package stirling.software.proprietary.storage.converter;

import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import lombok.extern.slf4j.Slf4j;

/**
 * JPA AttributeConverter for storing Map<String, Object> as JSON in database columns.
 *
 * <p>Converts between Java Map objects and JSON strings for PostgreSQL JSONB or TEXT columns.
 * Includes backward compatibility handling for legacy double-encoded JSON data.
 */
@Converter
@Slf4j
public class JsonMapConverter implements AttributeConverter<Map<String, Object>, String> {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String convertToDatabaseColumn(Map<String, Object> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }

        try {
            return objectMapper.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            log.error("Failed to convert map to JSON", e);
            throw new RuntimeException("Failed to convert map to JSON", e);
        }
    }

    @Override
    public Map<String, Object> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return new HashMap<>();
        }

        try {
            // Try normal parsing first
            return objectMapper.readValue(dbData, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            // Fallback: try double-parsing for legacy double-encoded data
            // This handles data that was stored as JSON strings instead of JSON objects
            log.debug("Attempting double-decode fallback for legacy metadata format");
            try {
                JsonNode node = objectMapper.readTree(dbData);
                if (node.isTextual()) {
                    log.warn(
                            "╔════════════════════════════════════════════════════════════════════╗");
                    log.warn(
                            "║ WARNING: DOUBLE-ENCODED JSON DETECTED - LEGACY DATA FOUND         ║");
                    log.warn(
                            "║ This should not occur in newly created records.                   ║");
                    log.warn(
                            "║ Data preview: {}",
                            dbData.length() > 100 ? dbData.substring(0, 100) + "..." : dbData);
                    log.warn(
                            "╚════════════════════════════════════════════════════════════════════╝");
                    return objectMapper.readValue(
                            node.asText(), new TypeReference<Map<String, Object>>() {});
                }
            } catch (JsonProcessingException e2) {
                log.error("Failed to parse metadata even with double-decode fallback", e2);
            }

            // If all parsing fails, return empty map to prevent application errors
            log.error("Unable to parse JSON metadata, returning empty map", e);
            return new HashMap<>();
        }
    }
}

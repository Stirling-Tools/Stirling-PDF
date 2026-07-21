package stirling.software.common.util.propertyeditor;

import java.beans.PropertyEditorSupport;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Binds a multipart form value containing a JSON object into a typed {@code T}. Companion to {@link
 * JsonListPropertyEditor} for single-object nested fields on {@code @ModelAttribute} endpoints.
 */
@Slf4j
public class JsonObjectPropertyEditor<T> extends PropertyEditorSupport {

    private static final ObjectMapper OBJECT_MAPPER =
            JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private final Class<T> type;

    public JsonObjectPropertyEditor(Class<T> type) {
        this.type = type;
    }

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if (text == null || text.trim().isEmpty()) {
            setValue(null);
            return;
        }
        try {
            setValue(OBJECT_MAPPER.readValue(text, type));
        } catch (Exception e) {
            log.error("Failed to parse JSON object value", e);
            throw new IllegalArgumentException(
                    "Expected a JSON object but could not parse: " + e.getMessage());
        }
    }
}

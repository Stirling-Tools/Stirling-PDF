package stirling.software.common.util.propertyeditor;

import java.beans.PropertyEditorSupport;
import java.util.ArrayList;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Binds a multipart form value containing a JSON array into a typed {@code List<T>}. Used for
 * endpoints that accept structured list parameters via {@code @ModelAttribute} — the form field
 * carries the full JSON array as its value and the editor parses it once.
 */
@Slf4j
public class JsonListPropertyEditor<T> extends PropertyEditorSupport {

    private static final ObjectMapper OBJECT_MAPPER =
            JsonMapper.builder()
                    .enable(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
                    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .build();

    private final TypeReference<? extends List<T>> typeRef;

    public JsonListPropertyEditor(TypeReference<? extends List<T>> typeRef) {
        this.typeRef = typeRef;
    }

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if (text == null || text.trim().isEmpty()) {
            setValue(new ArrayList<T>());
            return;
        }
        try {
            setValue(OBJECT_MAPPER.readValue(text, typeRef));
        } catch (Exception e) {
            log.error("Failed to parse JSON list value", e);
            throw new IllegalArgumentException(
                    "Expected a JSON array but could not parse: " + e.getMessage());
        }
    }
}

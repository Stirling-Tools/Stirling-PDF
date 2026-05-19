package stirling.software.common.util.propertyeditor;

import java.beans.PropertyEditorSupport;
import java.util.ArrayList;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JavaType;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Spring property editor that decodes a JSON string into a typed {@link ArrayList}. Used to bind
 * complex list parameters (e.g. {@code List<RedactionArea>}, {@code List<EditTextOperation>}) from
 * multipart form fields, where Spring's default binding cannot deserialize a JSON array.
 */
@Slf4j
public class StringToArrayListPropertyEditor<T> extends PropertyEditorSupport {

    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .enable(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
                    .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .build();

    private final Class<T> elementType;

    public StringToArrayListPropertyEditor(Class<T> elementType) {
        this.elementType = elementType;
    }

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if (text == null || text.trim().isEmpty()) {
            setValue(new ArrayList<>());
            return;
        }
        try {
            JavaType listType =
                    objectMapper
                            .getTypeFactory()
                            .constructCollectionType(ArrayList.class, elementType);
            List<T> list = objectMapper.readValue(text, listType);
            setValue(list);
        } catch (Exception e) {
            log.error("Exception while converting {}", e);
            throw new IllegalArgumentException(
                    "Failed to convert java.lang.String to java.util.List");
        }
    }
}

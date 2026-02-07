package stirling.software.common.util.propertyeditor;

import java.beans.PropertyEditorSupport;
import java.util.ArrayList;
import java.util.List;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.security.RedactionArea;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
public class StringToArrayListPropertyEditor extends PropertyEditorSupport {

    private final ObjectMapper objectMapper =
            JsonMapper.builder()
                    .enable(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY)
                    .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                    .build();

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if (text == null || text.trim().isEmpty()) {
            setValue(new ArrayList<>());
            return;
        }
        try {
            TypeReference<ArrayList<RedactionArea>> typeRef = new TypeReference<>() {};
            List<RedactionArea> list = objectMapper.readValue(text, typeRef);
            setValue(list);
        } catch (Exception e) {
            log.error("Exception while converting {}", e);
            throw new IllegalArgumentException(
                    "Failed to convert java.lang.String to java.util.List");
        }
    }
}

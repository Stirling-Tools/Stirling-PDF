package stirling.software.SPDF.utils.propertyeditor;

import java.beans.PropertyEditorSupport;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.security.RedactionArea;

@Slf4j
public class StringToArrayListPropertyEditor extends PropertyEditorSupport {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        if (text == null || text.trim().isEmpty()) {
            setValue(new ArrayList<>());
            return;
        }
        try {
            objectMapper.configure(DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY, true);
            TypeReference<ArrayList<RedactionArea>> typeRef =
                    new TypeReference<ArrayList<RedactionArea>>() {};
            List<RedactionArea> list = objectMapper.readValue(text, typeRef);
            setValue(list);
        } catch (Exception e) {
            log.error("Exception while converting {}", e);
            throw new IllegalArgumentException(
                    "Failed to convert java.lang.String to java.util.List");
        }
    }
}

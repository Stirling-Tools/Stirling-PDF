package stirling.software.common.util.propertyeditor;

import java.beans.PropertyEditorSupport;
import java.util.HashMap;
import java.util.Map;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

public class StringToMapPropertyEditor extends PropertyEditorSupport {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void setAsText(String text) throws IllegalArgumentException {
        try {
            TypeReference<HashMap<String, String>> typeRef = new TypeReference<>() {};
            Map<String, String> map = objectMapper.readValue(text, typeRef);
            setValue(map);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "Failed to convert java.lang.String to java.util.Map");
        }
    }
}

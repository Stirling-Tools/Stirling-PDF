package stirling.software.SPDF.model.json;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PdfJsonCosValue {

    public enum Type {
        NULL,
        BOOLEAN,
        INTEGER,
        FLOAT,
        NAME,
        STRING,
        ARRAY,
        DICTIONARY,
        STREAM
    }

    private Type type;

    /**
     * Holds the decoded value for primitives (boolean, integer, float, name, string). For name
     * values the stored value is the PDF name literal. For string values the content is Base64
     * encoded to safely transport arbitrary binaries.
     */
    private Object value;

    /** Reference to nested values for arrays. */
    private List<PdfJsonCosValue> items;

    /** Reference to nested values for dictionaries. */
    private Map<String, PdfJsonCosValue> entries;

    /** Stream payload when {@code type == STREAM}. */
    private PdfJsonStream stream;
}

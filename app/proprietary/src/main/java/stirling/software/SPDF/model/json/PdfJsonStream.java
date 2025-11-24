package stirling.software.SPDF.model.json;

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
public class PdfJsonStream {

    /**
     * A dictionary of entries that describe the stream metadata (Filter, DecodeParms, etc). Each
     * entry is represented using {@link PdfJsonCosValue} so nested structures are supported.
     */
    private Map<String, PdfJsonCosValue> dictionary;

    /** Raw stream bytes in Base64 form. Data is stored exactly as it appeared in the source PDF. */
    private String rawData;
}

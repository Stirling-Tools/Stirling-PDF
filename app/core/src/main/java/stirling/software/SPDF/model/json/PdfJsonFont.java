package stirling.software.SPDF.model.json;

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
public class PdfJsonFont {

    private String id;
    private String name;
    private String subtype;
    private String encoding;
    private Boolean embedded;
    private String standard14Name;
    private Integer fontDescriptorFlags;
    private String base64Data;
}

package stirling.software.SPDF.model.json;

import java.util.ArrayList;
import java.util.List;

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
public class PdfJsonDocument {

    private PdfJsonMetadata metadata;

    /** Optional XMP metadata packet stored as Base64. */
    private String xmpMetadata;

    @Builder.Default private List<PdfJsonFont> fonts = new ArrayList<>();

    @Builder.Default private List<PdfJsonPage> pages = new ArrayList<>();
}

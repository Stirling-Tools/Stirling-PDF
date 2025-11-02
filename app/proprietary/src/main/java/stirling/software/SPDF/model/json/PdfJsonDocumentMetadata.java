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
public class PdfJsonDocumentMetadata {

    private PdfJsonMetadata metadata;

    /** Optional XMP metadata packet stored as Base64. */
    private String xmpMetadata;

    /** Indicates that images should be requested lazily via the page endpoint. */
    private Boolean lazyImages;

    @Builder.Default private List<PdfJsonFont> fonts = new ArrayList<>();

    @Builder.Default private List<PdfJsonPageDimension> pageDimensions = new ArrayList<>();

    /** Form fields (AcroForm) at document level */
    @Builder.Default private List<PdfJsonFormField> formFields = new ArrayList<>();
}

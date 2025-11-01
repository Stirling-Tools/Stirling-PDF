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
public class PdfJsonPage {

    private Integer pageNumber;
    private Float width;
    private Float height;
    private Integer rotation;

    @Builder.Default private List<PdfJsonTextElement> textElements = new ArrayList<>();
    @Builder.Default private List<PdfJsonImageElement> imageElements = new ArrayList<>();
    @Builder.Default private List<PdfJsonAnnotation> annotations = new ArrayList<>();

    /** Serialized representation of the page resources dictionary. */
    private PdfJsonCosValue resources;

    /** Raw content streams associated with the page, preserved for lossless round-tripping. */
    @Builder.Default private List<PdfJsonStream> contentStreams = new ArrayList<>();
}

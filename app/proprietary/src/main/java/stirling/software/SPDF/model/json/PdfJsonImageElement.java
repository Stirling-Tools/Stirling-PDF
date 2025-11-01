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
public class PdfJsonImageElement {

    private String id;
    private String objectName;
    private Boolean inlineImage;
    private Integer nativeWidth;
    private Integer nativeHeight;
    private Float x;
    private Float y;
    private Float width;
    private Float height;
    private Float left;
    private Float right;
    private Float top;
    private Float bottom;
    @Builder.Default private List<Float> transform = new ArrayList<>();
    private Integer zOrder;
    private String imageData;
    private String imageFormat;
}

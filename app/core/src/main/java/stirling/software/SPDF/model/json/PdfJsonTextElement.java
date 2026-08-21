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
public class PdfJsonTextElement {

    private String text;
    private String fontId;
    private Float fontSize;
    private Float fontMatrixSize;
    private Float fontSizeInPt;
    private Float characterSpacing;
    private Float wordSpacing;
    private Float spaceWidth;
    private Integer zOrder;
    private Float horizontalScaling;
    private Float leading;
    private Float rise;
    private Float x;
    private Float y;
    private Float width;
    private Float height;
    private float[] textMatrix;
    private PdfJsonTextColor fillColor;
    private PdfJsonTextColor strokeColor;
    private Integer renderingMode;
    private Boolean fallbackUsed;
    private int[] charCodes;
}

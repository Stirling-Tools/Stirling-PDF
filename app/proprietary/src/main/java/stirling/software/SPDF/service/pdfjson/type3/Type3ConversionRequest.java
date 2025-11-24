package stirling.software.SPDF.service.pdfjson.type3;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDType3Font;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class Type3ConversionRequest {
    private final PDDocument document;
    private final PDType3Font font;
    private final String fontId;
    private final int pageNumber;
    private final String fontUid;
}

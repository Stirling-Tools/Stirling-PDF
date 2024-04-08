package stirling.software.SPDF.model;

import java.util.Calendar;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class PdfMetadata {
    private String author;
    private String producer;
    private String title;
    private String creator;
    private String subject;
    private String keywords;
    private Calendar creationDate;
    private Calendar modificationDate;
}

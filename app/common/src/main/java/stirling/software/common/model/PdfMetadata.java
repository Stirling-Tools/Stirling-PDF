package stirling.software.common.model;

import java.time.ZonedDateTime;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PdfMetadata {
    private String author;
    private String producer;
    private String title;
    private String creator;
    private String subject;
    private String keywords;
    private ZonedDateTime creationDate;
    private ZonedDateTime modificationDate;
}

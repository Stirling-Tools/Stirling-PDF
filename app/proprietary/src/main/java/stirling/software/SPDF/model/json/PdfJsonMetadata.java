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
public class PdfJsonMetadata {

    private String title;
    private String author;
    private String subject;
    private String keywords;
    private String creator;
    private String producer;
    private String creationDate;
    private String modificationDate;
    private String trapped;
    private Integer numberOfPages;
}

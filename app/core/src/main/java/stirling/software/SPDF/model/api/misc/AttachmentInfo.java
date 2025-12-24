package stirling.software.SPDF.model.api.misc;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AttachmentInfo {
    private String filename;
    private Long size;
    private String contentType;
    private String description;
    private String creationDate;
    private String modificationDate;
}

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

    /** Page carrying this attachment's pin, or {@code null} when the file has no pin. */
    private Integer pinPageIndex;

    /** Horizontal pin position, normalized to the displayed page width. */
    private Float pinX;

    /** Vertical pin position, normalized to the displayed page height. */
    private Float pinY;

    public AttachmentInfo(
            String filename,
            Long size,
            String contentType,
            String description,
            String creationDate,
            String modificationDate) {
        this.filename = filename;
        this.size = size;
        this.contentType = contentType;
        this.description = description;
        this.creationDate = creationDate;
        this.modificationDate = modificationDate;
    }
}

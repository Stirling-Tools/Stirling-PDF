package stirling.software.common.model.job;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Represents a single file result from a job execution */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResultFile {

    /** The file ID for accessing the file */
    private String fileId;

    /** The original file name */
    private String fileName;

    /** MIME type of the file */
    private String contentType;

    /** Size of the file in bytes */
    private long fileSize;
}

package stirling.software.SPDF.model.api.misc;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class BatchAttachmentRequest extends PDFFile {
    private String opsJson;
    private List<MultipartFile> attachments;
    private boolean convertToPdfA3b;
}

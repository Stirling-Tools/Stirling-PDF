package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.web.multipart.MultipartFile;

public interface AttachmentServiceInterface {

    PDDocument addAttachment(PDDocument document, List<MultipartFile> attachments)
            throws IOException;
}

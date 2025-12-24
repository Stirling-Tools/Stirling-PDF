package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.misc.AttachmentInfo;

public interface AttachmentServiceInterface {

    PDDocument addAttachment(PDDocument document, List<MultipartFile> attachments)
            throws IOException;

    Optional<byte[]> extractAttachments(PDDocument document) throws IOException;

    List<AttachmentInfo> listAttachments(PDDocument document) throws IOException;

    PDDocument renameAttachment(PDDocument document, String attachmentName, String newName)
            throws IOException;

    PDDocument deleteAttachment(PDDocument document, String attachmentName) throws IOException;
}

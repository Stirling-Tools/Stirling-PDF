package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.springframework.web.multipart.MultipartFile;

public interface PDFAttachmentServiceInterface {

    void addAttachment(
            PDDocument document,
            PDEmbeddedFilesNameTreeNode efTree,
            List<MultipartFile> attachments)
            throws IOException;
}

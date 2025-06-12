package stirling.software.SPDF.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class PDFAttachmentService implements PDFAttachmentServiceInterface {

    @Override
    public void addAttachment(
            PDDocument document,
            PDEmbeddedFilesNameTreeNode efTree,
            List<MultipartFile> attachments)
            throws IOException {
        // Get existing names or create new map
        Map<String, PDComplexFileSpecification> existingNames = new java.util.HashMap<>();
        try {
            existingNames = efTree.getNames();
        } catch (IOException e) {
            log.warn("Could not retrieve existing embedded files, starting with empty map", e);
        }

        Map<String, PDComplexFileSpecification> finalExistingNames = existingNames;
        attachments.forEach(
                attachment -> {
                    // Create attachments specification
                    PDComplexFileSpecification fileSpecification = new PDComplexFileSpecification();
                    fileSpecification.setFile(attachment.getOriginalFilename());
                    fileSpecification.setFileDescription(
                            "Embedded attachment: " + attachment.getOriginalFilename());

                    try {
                        // Create embedded attachment
                        PDEmbeddedFile embeddedFile =
                                new PDEmbeddedFile(
                                        document, new ByteArrayInputStream(attachment.getBytes()));
                        embeddedFile.setSize((int) attachment.getSize());
                        embeddedFile.setCreationDate(new java.util.GregorianCalendar());
                        embeddedFile.setModDate(new java.util.GregorianCalendar());

                        // Set MIME type if available
                        String contentType = attachment.getContentType();
                        if (StringUtils.isNotBlank(contentType)) {
                            embeddedFile.setSubtype(contentType);
                        }

                        // Associate embedded attachment with file specification
                        fileSpecification.setEmbeddedFile(embeddedFile);

                        // Add to the existing names map
                        finalExistingNames.put(attachment.getOriginalFilename(), fileSpecification);

                        log.info(
                                "Added embedded attachment: {} ({} bytes)",
                                attachment.getOriginalFilename(),
                                attachment.getSize());
                    } catch (IOException e) {
                        log.error(
                                "Failed to create embedded file for attachment: {}",
                                attachment.getOriginalFilename(),
                                e);
                    }
                });

        // Update the name tree with all names
        efTree.setNames(existingNames);
    }
}

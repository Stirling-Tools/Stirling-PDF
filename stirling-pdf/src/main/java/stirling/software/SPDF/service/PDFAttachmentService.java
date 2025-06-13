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
            PDEmbeddedFilesNameTreeNode embeddedFilesTree,
            List<MultipartFile> attachments)
            throws IOException {
//        todo: sanitize attachments first
        // todo: find out how to access the embedded files in the PDF
        Map<String, PDComplexFileSpecification> existingNames;

        try {
            existingNames = embeddedFilesTree.getNames();
            if (existingNames == null) {
                log.info("No existing embedded files found, creating new names map.");
                // Initialize an empty map if no existing names are found
                existingNames = new java.util.HashMap<>();
            }

            log.debug("Existing embedded files: {}", existingNames.keySet());
        } catch (IOException e) {
            log.error("Could not retrieve existing embedded files", e);
            throw e;
        }

        final Map<String, PDComplexFileSpecification> existingEmbeddedFiles = existingNames;
        attachments.forEach(
                attachment -> {
                    // Create attachments specification
                    PDComplexFileSpecification fileSpecification = new PDComplexFileSpecification();
                    fileSpecification.setFile(attachment.getOriginalFilename());
                    fileSpecification.setFileDescription(
                            "Embedded attachment: " + attachment.getOriginalFilename());

                    try {
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
                        existingEmbeddedFiles.put(attachment.getOriginalFilename(), fileSpecification);

                        log.info(
                                "Added attachment: {} ({} bytes)",
                                attachment.getOriginalFilename(),
                                attachment.getSize());
                    } catch (IOException e) {
                        log.warn(
                                "Failed to create embedded file for attachment: {}",
                                attachment.getOriginalFilename(),
                                e);
                    }
                });

        embeddedFilesTree.setNames(existingNames);
    }
}

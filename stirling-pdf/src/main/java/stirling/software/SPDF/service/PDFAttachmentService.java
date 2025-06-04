package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.PDFAttachmentUtils;

@Slf4j
@Service
public class PDFAttachmentService implements PDFAttachmentServiceInterface {

    @Override
    public void addAttachment(
            PDDocument document,
            PDEmbeddedFilesNameTreeNode embeddedFilesTree,
            List<MultipartFile> attachments)
            throws IOException {
        Map<String, PDComplexFileSpecification> existingNames;

        try {
            existingNames = embeddedFilesTree.getNames();
            if (existingNames == null) {
                log.debug("No existing embedded files found, creating new names map.");
                existingNames = new HashMap<>();
            }

            log.debug("Embedded files: {}", existingNames.keySet());
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
                    fileSpecification.setFileUnicode(attachment.getOriginalFilename());
                    fileSpecification.setFileDescription(
                            "Embedded attachment: " + attachment.getOriginalFilename());

                    try {
                        // Create embedded attachment
                        PDEmbeddedFile embeddedFile =
                                new PDEmbeddedFile(document, attachment.getInputStream());
                        embeddedFile.setSize((int) attachment.getSize());
                        embeddedFile.setCreationDate(new GregorianCalendar());
                        embeddedFile.setModDate(new GregorianCalendar());

                        // Set MIME type if available
                        String contentType = attachment.getContentType();
                        if (StringUtils.isNotBlank(contentType)) {
                            embeddedFile.setSubtype(contentType);
                        }

                        // Associate embedded attachment with file specification
                        embeddedFile.setFile(fileSpecification);
                        fileSpecification.setEmbeddedFile(embeddedFile);
                        fileSpecification.setEmbeddedFileUnicode(embeddedFile);

                        // Add to the existing files map
                        existingEmbeddedFiles.put(
                                attachment.getOriginalFilename(), fileSpecification);

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

        // Ensure document has proper access permissions for embedded files
        grantAccessPermissions(document);
        PDFAttachmentUtils.setCatalogViewerPreferences(document);
    }

    private void grantAccessPermissions(PDDocument document) {
        AccessPermission currentPermissions = document.getCurrentAccessPermission();

        currentPermissions.setCanAssembleDocument(true);
        currentPermissions.setCanFillInForm(currentPermissions.canFillInForm());
        currentPermissions.setCanModify(true);
        currentPermissions.setCanPrint(true);
        currentPermissions.setCanPrintFaithful(true);

        // Ensure these permissions are enabled for embedded file access
        currentPermissions.setCanExtractContent(true);
        currentPermissions.setCanExtractForAccessibility(true);
        currentPermissions.setCanModifyAnnotations(true);
    }
}

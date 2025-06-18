package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.PDFAttachmentUtils;

@Slf4j
@Service
public class PDFAttachmentService implements PDFAttachmentServiceInterface {

    @Override
    public byte[] addAttachment(
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

        grantAccessPermissions(document);
        final Map<String, PDComplexFileSpecification> existingEmbeddedFiles = existingNames;

        attachments.forEach(
                attachment -> {
                    String filename = attachment.getOriginalFilename();

                    try {
                        PDEmbeddedFile embeddedFile =
                                new PDEmbeddedFile(document, attachment.getInputStream());
                        embeddedFile.setSize((int) attachment.getSize());
                        embeddedFile.setCreationDate(new GregorianCalendar());
                        embeddedFile.setModDate(new GregorianCalendar());
                        String contentType = attachment.getContentType();
                        if (StringUtils.isNotBlank(contentType)) {
                            embeddedFile.setSubtype(contentType);
                        }

                        // Create attachments specification and associate embedded attachment with
                        // file
                        PDComplexFileSpecification fileSpecification =
                                new PDComplexFileSpecification();
                        fileSpecification.setFile(filename);
                        fileSpecification.setFileUnicode(filename);
                        fileSpecification.setFileDescription("Embedded attachment: " + filename);
                        embeddedFile.setFile(fileSpecification);
                        fileSpecification.setEmbeddedFile(embeddedFile);
                        fileSpecification.setEmbeddedFileUnicode(embeddedFile);

                        // Add to the existing files map
                        existingEmbeddedFiles.put(filename, fileSpecification);

                        log.info("Added attachment: {} ({} bytes)", filename, attachment.getSize());
                    } catch (IOException e) {
                        log.warn("Failed to create embedded file for attachment: {}", filename, e);
                    }
                });

        embeddedFilesTree.setNames(existingNames);
        PDFAttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        document.save(output);

        return output.toByteArray();
    }

    private void grantAccessPermissions(PDDocument document) {
        try {
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

            var protectionPolicy = new StandardProtectionPolicy(null, null, currentPermissions);

            if (!document.isAllSecurityToBeRemoved()) {
                document.setAllSecurityToBeRemoved(true);
            }

            document.protect(protectionPolicy);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}

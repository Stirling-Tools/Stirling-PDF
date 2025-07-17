package stirling.software.SPDF.service;

import static stirling.software.common.util.AttachmentUtils.setCatalogViewerPreferences;

import java.io.IOException;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class AttachmentService implements AttachmentServiceInterface {

    @Override
    public PDDocument addAttachment(PDDocument document, List<MultipartFile> attachments)
            throws IOException {
        PDEmbeddedFilesNameTreeNode embeddedFilesTree = getEmbeddedFilesTree(document);
        Map<String, PDComplexFileSpecification> existingNames;

        try {
            Map<String, PDComplexFileSpecification> names = embeddedFilesTree.getNames();

            if (names == null) {
                log.debug("No existing embedded files found, creating new names map.");
                existingNames = new HashMap<>();
            } else {
                existingNames = new HashMap<>(names);
                log.debug("Embedded files: {}", existingNames.keySet());
            }
        } catch (IOException e) {
            log.error("Could not retrieve existing embedded files", e);
            throw e;
        }

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
                        fileSpecification.setEmbeddedFile(embeddedFile);
                        fileSpecification.setEmbeddedFileUnicode(embeddedFile);

                        existingNames.put(filename, fileSpecification);

                        log.info("Added attachment: {} ({} bytes)", filename, attachment.getSize());
                    } catch (IOException e) {
                        log.warn("Failed to create embedded file for attachment: {}", filename, e);
                    }
                });

        embeddedFilesTree.setNames(existingNames);
        setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

        return document;
    }

    private PDEmbeddedFilesNameTreeNode getEmbeddedFilesTree(PDDocument document) {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDDocumentNameDictionary documentNames = catalog.getNames();

        if (documentNames == null) {
            documentNames = new PDDocumentNameDictionary(catalog);
        }

        catalog.setNames(documentNames);
        PDEmbeddedFilesNameTreeNode embeddedFilesTree = documentNames.getEmbeddedFiles();

        if (embeddedFilesTree == null) {
            embeddedFilesTree = new PDEmbeddedFilesNameTreeNode();
            documentNames.setEmbeddedFiles(embeddedFilesTree);
        }
        return embeddedFilesTree;
    }
}

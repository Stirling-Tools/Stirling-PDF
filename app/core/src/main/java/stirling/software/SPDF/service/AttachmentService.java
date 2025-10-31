package stirling.software.SPDF.service;

import static stirling.software.common.util.AttachmentUtils.setCatalogViewerPreferences;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.common.filespecification.PDFileSpecification;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class AttachmentService implements AttachmentServiceInterface {

    private static final long DEFAULT_MAX_ATTACHMENT_SIZE_BYTES = 50L * 1024 * 1024; // 50 MB
    private static final long DEFAULT_MAX_TOTAL_ATTACHMENT_SIZE_BYTES =
            200L * 1024 * 1024; // 200 MB

    private final long maxAttachmentSizeBytes;
    private final long maxTotalAttachmentSizeBytes;

    public AttachmentService() {
        this(DEFAULT_MAX_ATTACHMENT_SIZE_BYTES, DEFAULT_MAX_TOTAL_ATTACHMENT_SIZE_BYTES);
    }

    public AttachmentService(long maxAttachmentSizeBytes, long maxTotalAttachmentSizeBytes) {
        this.maxAttachmentSizeBytes = maxAttachmentSizeBytes;
        this.maxTotalAttachmentSizeBytes = maxTotalAttachmentSizeBytes;
    }

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
                        // use java.time.Instant and convert to GregorianCalendar for PDFBox
                        Instant now = Instant.now();
                        GregorianCalendar nowCal =
                                GregorianCalendar.from(
                                        ZonedDateTime.ofInstant(now, ZoneId.systemDefault()));
                        embeddedFile.setCreationDate(nowCal);
                        embeddedFile.setModDate(nowCal);
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

    @Override
    public Optional<byte[]> extractAttachments(PDDocument document) throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return Optional.empty();
        }

        PDDocumentNameDictionary documentNames = catalog.getNames();
        if (documentNames == null) {
            return Optional.empty();
        }

        PDEmbeddedFilesNameTreeNode embeddedFilesTree = documentNames.getEmbeddedFiles();
        if (embeddedFilesTree == null) {
            return Optional.empty();
        }

        Map<String, PDComplexFileSpecification> embeddedFiles = new LinkedHashMap<>();
        collectEmbeddedFiles(embeddedFilesTree, embeddedFiles);

        if (embeddedFiles.isEmpty()) {
            return Optional.empty();
        }

        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ZipOutputStream zipOutputStream = new ZipOutputStream(baos)) {
            Set<String> usedNames = new HashSet<>();
            boolean hasExtractedAttachments = false;
            long totalBytesWritten = 0L;

            for (Map.Entry<String, PDComplexFileSpecification> entry : embeddedFiles.entrySet()) {
                PDComplexFileSpecification fileSpecification = entry.getValue();
                PDEmbeddedFile embeddedFile = getEmbeddedFile(fileSpecification);

                if (embeddedFile == null) {
                    log.debug(
                            "Skipping attachment {} because embedded file was null",
                            entry.getKey());
                    continue;
                }

                String filename = determineFilename(entry.getKey(), fileSpecification);
                filename = Filenames.toSimpleFileName(filename);
                String sanitizedFilename = sanitizeFilename(filename);

                Optional<byte[]> attachmentData = readAttachmentData(embeddedFile);
                if (attachmentData.isEmpty()) {
                    log.warn(
                            "Skipping attachment '{}' because it exceeds the size limit of {} bytes",
                            sanitizedFilename,
                            maxAttachmentSizeBytes);
                    continue;
                }

                byte[] data = attachmentData.get();
                if (maxTotalAttachmentSizeBytes > 0
                        && (data.length + totalBytesWritten) > maxTotalAttachmentSizeBytes) {
                    log.warn(
                            "Skipping attachment '{}' because the total size would exceed {} bytes",
                            sanitizedFilename,
                            maxTotalAttachmentSizeBytes);
                    continue;
                }

                String uniqueFilename = ensureUniqueFilename(sanitizedFilename, usedNames);

                ZipEntry zipEntry = new ZipEntry(uniqueFilename);
                if (embeddedFile.getModDate() != null) {
                    zipEntry.setLastModifiedTime(
                            FileTime.from(embeddedFile.getModDate().toInstant()));
                }
                if (embeddedFile.getCreationDate() != null) {
                    zipEntry.setCreationTime(
                            FileTime.from(embeddedFile.getCreationDate().toInstant()));
                }
                zipEntry.setSize(data.length);

                zipOutputStream.putNextEntry(zipEntry);
                zipOutputStream.write(data);
                zipOutputStream.closeEntry();
                hasExtractedAttachments = true;
                totalBytesWritten += data.length;
                log.info("Extracted attachment '{}' ({} bytes)", uniqueFilename, data.length);
            }

            zipOutputStream.finish();

            if (!hasExtractedAttachments) {
                return Optional.empty();
            }

            return Optional.of(baos.toByteArray());
        }
    }

    private String sanitizeFilename(String candidate) {
        String sanitized = Filenames.toSimpleFileName(candidate);
        if (StringUtils.isBlank(sanitized)) {
            sanitized = generateDefaultFilename();
        }
        return sanitized;
    }

    private String generateDefaultFilename() {
        return "unknown_attachment_" + System.currentTimeMillis();
    }

    private Optional<byte[]> readAttachmentData(PDEmbeddedFile embeddedFile) throws IOException {
        try (var inputStream = embeddedFile.createInputStream();
                var buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            long total = 0L;
            int read;
            while ((read = inputStream.read(chunk)) != -1) {
                total += read;
                if (maxAttachmentSizeBytes > 0 && total > maxAttachmentSizeBytes) {
                    return Optional.empty();
                }
                buffer.write(chunk, 0, read);
            }
            return Optional.of(buffer.toByteArray());
        }
    }

    private void collectEmbeddedFiles(
            PDNameTreeNode<PDComplexFileSpecification> node,
            Map<String, PDComplexFileSpecification> collector)
            throws IOException {
        if (node == null) {
            return;
        }

        Map<String, PDComplexFileSpecification> names = node.getNames();
        if (names != null) {
            collector.putAll(names);
        }

        List<PDNameTreeNode<PDComplexFileSpecification>> kids = node.getKids();
        if (kids != null) {
            for (PDNameTreeNode<PDComplexFileSpecification> kid : kids) {
                collectEmbeddedFiles(kid, collector);
            }
        }
    }

    private PDEmbeddedFile getEmbeddedFile(PDFileSpecification fileSpecification) {
        if (!(fileSpecification instanceof PDComplexFileSpecification complexSpecification)) {
            return null;
        }

        if (complexSpecification.getEmbeddedFileUnicode() != null) {
            return complexSpecification.getEmbeddedFileUnicode();
        }
        if (complexSpecification.getEmbeddedFile() != null) {
            return complexSpecification.getEmbeddedFile();
        }
        if (complexSpecification.getEmbeddedFileDos() != null) {
            return complexSpecification.getEmbeddedFileDos();
        }
        if (complexSpecification.getEmbeddedFileMac() != null) {
            return complexSpecification.getEmbeddedFileMac();
        }
        return complexSpecification.getEmbeddedFileUnix();
    }

    private String determineFilename(String key, PDComplexFileSpecification specification) {
        if (specification == null) {
            return fallbackFilename(key);
        }

        String name = specification.getFileUnicode();
        if (StringUtils.isBlank(name)) {
            name = specification.getFilename();
        }
        if (StringUtils.isBlank(name)) {
            name = specification.getFile();
        }
        if (StringUtils.isBlank(name)) {
            name = key;
        }
        return fallbackFilename(name);
    }

    private String fallbackFilename(String candidate) {
        if (StringUtils.isBlank(candidate)) {
            return "unknown_attachment_" + System.currentTimeMillis();
        }
        return candidate;
    }

    private String ensureUniqueFilename(String filename, Set<String> usedNames) {
        String baseName = filename;
        String extension = "";
        int lastDot = filename.lastIndexOf('.');
        if (lastDot > 0 && lastDot < filename.length() - 1) {
            baseName = filename.substring(0, lastDot);
            extension = filename.substring(lastDot);
        }

        String uniqueName = filename;
        int counter = 1;
        while (usedNames.contains(uniqueName)) {
            uniqueName = baseName + "_" + counter + extension;
            counter++;
        }

        usedNames.add(uniqueName);
        return uniqueName;
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

package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;

import org.apache.poi.poifs.filesystem.DirectoryEntry;
import org.apache.poi.poifs.filesystem.DocumentEntry;
import org.apache.poi.poifs.filesystem.Entry;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.simplejavamail.api.email.AttachmentResource;
import org.simplejavamail.api.email.Email;
import org.simplejavamail.api.email.Recipient;
import org.simplejavamail.converter.EmailConverter;

import jakarta.activation.DataSource;
import jakarta.mail.Message.RecipientType;

import lombok.Data;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.converters.EmlToPdfRequest;

@Slf4j
@UtilityClass
public class EmlParser {

    // Configuration constants
    private final int DEFAULT_MAX_ATTACHMENT_MB = 10;
    private final long MAX_SIZE_ESTIMATION_BYTES = 500L * 1024 * 1024; // 500MB
    private final int MAX_ATTACHMENTS = ZipBombGuard.MAX_ENTRIES;
    final int MAX_FILENAME_LENGTH = 255;
    private final int MAX_EXTENSION_LENGTH = 16; // including the dot
    private final int MAX_MSG_PROPERTY_STREAM_BYTES = 64 * 1024;
    private final String MSG_PROPERTY_STREAM_PREFIX = "__properties_version1.0";

    // Message constants
    private final String NO_CONTENT_MESSAGE = "Email content could not be parsed";
    private final String ATTACHMENT_PREFIX = "attachment-";

    public EmailContent extractEmailContent(
            byte[] emlBytes, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {

        EmlProcessingUtils.validateEmlInput(emlBytes);

        Email email = parseEmail(emlBytes);
        return buildEmailContent(email, request, customHtmlSanitizer);
    }

    private Email parseEmail(byte[] emlBytes) throws IOException {
        boolean isMsgFile = EmlProcessingUtils.isMsgFile(emlBytes);
        try (ByteArrayInputStream input = new ByteArrayInputStream(emlBytes)) {
            Email email;
            if (isMsgFile) {
                try {
                    validateMsgStreamSizes(emlBytes);
                    email = EmailConverter.outlookMsgToEmail(input);
                } catch (Exception e) {
                    // OLE2 magic bytes match but parsing failed - might be DOC/XLS/other OLE2 file
                    throw new IOException(
                            "The file appears to be an OLE2 file (MSG/DOC/XLS) but could not be "
                                    + "parsed as an Outlook email. Ensure it is a valid .msg file: "
                                    + e.getMessage(),
                            e);
                }
            } else {
                email = EmailConverter.emlToEmail(input);
            }

            return email;
        } catch (IOException e) {
            throw e; // Re-throw IOException as-is
        } catch (Exception e) {
            throw new IOException(
                    String.format(
                            "Failed to parse EML file with Simple Java Mail: %s", e.getMessage()),
                    e);
        }
    }

    /**
     * Rejects a compound file whose directory declares more stream data than the file holds, or
     * whose property streams are larger than a message needs. The MSG parser reads both in full, so
     * the check runs first.
     */
    private void validateMsgStreamSizes(byte[] msgBytes) throws IOException {
        try (POIFSFileSystem fileSystem = new POIFSFileSystem(new ByteArrayInputStream(msgBytes))) {
            if (sumStreamSizes(fileSystem.getRoot()) > msgBytes.length) {
                throw new IOException("MSG streams add up to more data than the file contains");
            }
        }
    }

    private long sumStreamSizes(DirectoryEntry directory) throws IOException {
        long total = 0;
        for (Entry entry : directory) {
            if (entry instanceof DirectoryEntry child) {
                total += sumStreamSizes(child);
            } else if (entry instanceof DocumentEntry stream) {
                int size = stream.getSize();
                if (size < 0) {
                    throw new IOException("MSG stream has a negative size");
                }
                if (size > MAX_MSG_PROPERTY_STREAM_BYTES
                        && stream.getName().startsWith(MSG_PROPERTY_STREAM_PREFIX)) {
                    throw new IOException("MSG property stream is too large");
                }
                total += size;
            }
        }
        return total;
    }

    private EmailContent buildEmailContent(
            Email email, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {

        EmailContent content = new EmailContent();
        content.setSubject(defaultString(email.getSubject()));
        content.setFrom(formatRecipient(email.getFromRecipient()));
        content.setTo(formatRecipients(email.getRecipients(), RecipientType.TO));
        content.setCc(formatRecipients(email.getRecipients(), RecipientType.CC));
        content.setBcc(formatRecipients(email.getRecipients(), RecipientType.BCC));

        Date sentDate = email.getSentDate();
        if (sentDate != null) {
            // Use UTC for consistent timezone handling across deployments
            content.setDate(ZonedDateTime.ofInstant(sentDate.toInstant(), ZoneOffset.UTC));
        }

        String htmlBody = email.getHTMLText();
        if (customHtmlSanitizer != null && htmlBody != null) {
            htmlBody = customHtmlSanitizer.sanitize(htmlBody);
        }
        content.setHtmlBody(htmlBody);

        String textBody = email.getPlainText();
        if (customHtmlSanitizer != null && textBody != null) {
            textBody = customHtmlSanitizer.sanitize(textBody);
        }
        content.setTextBody(textBody);

        if (isBlank(content.getHtmlBody()) && isBlank(content.getTextBody())) {
            content.setTextBody(NO_CONTENT_MESSAGE);
        }

        // Embedding is capped like the archive readers; listing alone is not. Counted before
        // mapping so a rejected message reads nothing.
        if (request != null && request.isIncludeAttachments()) {
            int resourceCount =
                    countResources(email.getEmbeddedImages())
                            + countResources(email.getAttachments());
            if (resourceCount > MAX_ATTACHMENTS) {
                throw new IOException(
                        "Email contains more than the maximum allowed "
                                + MAX_ATTACHMENTS
                                + " attachments");
            }
        }

        List<EmailAttachment> attachments = new ArrayList<>();
        attachments.addAll(mapResources(email.getEmbeddedImages(), request, true));
        attachments.addAll(mapResources(email.getAttachments(), request, false));
        content.setAttachments(attachments);
        content.setAttachmentCount(attachments.size());

        return content;
    }

    private int countResources(List<AttachmentResource> resources) {
        if (resources == null) {
            return 0;
        }
        int count = 0;
        for (AttachmentResource resource : resources) {
            if (resource != null) {
                count++;
            }
        }
        return count;
    }

    private List<EmailAttachment> mapResources(
            List<AttachmentResource> resources, EmlToPdfRequest request, boolean embedded)
            throws IOException {

        if (resources == null || resources.isEmpty()) {
            return List.of();
        }

        List<EmailAttachment> mapped = new ArrayList<>(resources.size());
        int unnamedCounter = 0; // Start at 0, increment before use

        for (AttachmentResource resource : resources) {
            if (resource == null) {
                continue; // Skip null resources early
            }

            // Pre-determine if this resource needs a generated filename
            boolean needsGeneratedName = !embedded && needsGeneratedFilename(resource);

            if (needsGeneratedName) {
                unnamedCounter++;
            }

            EmailAttachment attachment =
                    toEmailAttachment(resource, request, embedded, unnamedCounter);
            if (attachment != null) {
                mapped.add(attachment);
            }
        }
        return mapped;
    }

    /** Checks if a resource needs a generated filename (has no usable name). */
    private boolean needsGeneratedFilename(AttachmentResource resource) {
        if (resource == null) {
            return false;
        }
        String resourceName = resource.getName();
        if (!isBlank(resourceName)) {
            return false;
        }
        DataSource dataSource = resource.getDataSource();
        return isBlank(dataSource.getName());
    }

    private EmailAttachment toEmailAttachment(
            AttachmentResource resource, EmlToPdfRequest request, boolean embedded, int counter)
            throws IOException {

        if (resource == null) {
            return null;
        }

        EmailAttachment attachment = new EmailAttachment();
        attachment.setEmbedded(embedded);

        String resourceName = defaultString(resource.getName());
        String filename = resourceName;
        DataSource dataSource = resource.getDataSource();
        String contentType = dataSource.getContentType();

        if (!isBlank(dataSource.getName())) {
            filename = dataSource.getName();
        }
        filename = safeMimeDecode(filename);

        // Generate unique filename for unnamed attachments
        if (isBlank(filename)) {
            String extension = detectExtensionFromMimeType(contentType);
            filename = embedded ? resourceName : (ATTACHMENT_PREFIX + counter + extension);
        }
        attachment.setFilename(filename);

        String contentId = embedded ? stripCid(resource.getContentId()) : null;
        attachment.setContentId(contentId);

        String detectedContentType = EmlProcessingUtils.detectMimeType(filename, contentType);
        attachment.setContentType(detectedContentType);

        // Read data with size limit to prevent OOM
        ReadResult readResult = readData(dataSource, embedded, request);
        if (readResult != null) {
            attachment.setSizeBytes(readResult.totalSize);
            if (shouldIncludeAttachmentData(embedded, request, readResult)) {
                attachment.setData(readResult.data);
            }
        }

        return attachment;
    }

    private boolean shouldIncludeAttachmentData(
            boolean embedded, EmlToPdfRequest request, ReadResult readResult) {
        // Always include embedded images for proper rendering
        if (embedded) {
            return readResult != null && readResult.data() != null;
        }
        // Check if attachments are requested and data is available within size limit
        if (request == null || !request.isIncludeAttachments()) {
            return false;
        }
        if (readResult == null || readResult.data() == null) {
            return false;
        }
        return readResult.data().length <= getMaxAttachmentSizeBytes(request);
    }

    private String detectExtensionFromMimeType(String mimeType) {
        if (mimeType == null) {
            return "";
        }

        String lower = mimeType.toLowerCase(Locale.ROOT);

        // Remove any parameters (e.g., "text/plain; charset=utf-8" -> "text/plain")
        int semicolon = lower.indexOf(';');
        if (semicolon > 0) {
            lower = lower.substring(0, semicolon).trim();
        }

        // Match exact MIME types first, then fall back to contains() for variants
        return switch (lower) {
            case "application/pdf" -> ".pdf";
            case "image/png" -> ".png";
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "image/bmp" -> ".bmp";
            case "text/plain" -> ".txt";
            case "text/html" -> ".html";
            case "text/xml", "application/xml" -> ".xml";
            case "application/json" -> ".json";
            case "application/zip" -> ".zip";
            case "application/octet-stream" -> ".bin";
            default -> {
                if (lower.contains("wordprocessingml") || lower.contains("msword")) yield ".docx";
                if (lower.contains("spreadsheetml") || lower.contains("excel")) yield ".xlsx";
                if (lower.contains("presentationml") || lower.contains("powerpoint")) yield ".pptx";
                if (lower.contains("opendocument.text")) yield ".odt";
                if (lower.contains("opendocument.spreadsheet")) yield ".ods";
                yield "";
            }
        };
    }

    private ReadResult readData(DataSource dataSource, boolean embedded, EmlToPdfRequest request)
            throws IOException {
        if (dataSource == null) {
            return null;
        }

        long maxBytes = getMaxAttachmentSizeBytes(request);

        try (InputStream input = dataSource.getInputStream()) {
            // Embedded images are usually needed for display regardless of size,
            // but regular attachments should be guarded against OOM
            if (!embedded && request != null) {
                byte[] buffer = new byte[8192];
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                int bytesRead;
                long totalBytes = 0;
                while ((bytesRead = input.read(buffer)) != -1) {
                    totalBytes += bytesRead;
                    if (totalBytes > maxBytes) {
                        // Attachment too large - skip remaining data but estimate total size
                        long remainingBytes = countRemainingBytes(input, totalBytes);
                        log.debug(
                                "Attachment exceeds size limit: {} bytes (max: {} bytes), skipping",
                                remainingBytes,
                                maxBytes);
                        return new ReadResult(null, remainingBytes);
                    }
                    output.write(buffer, 0, bytesRead);
                }
                byte[] data = output.toByteArray();
                return new ReadResult(data, data.length);
            } else {
                byte[] data = input.readAllBytes();
                return new ReadResult(data, data.length);
            }
        } catch (IOException e) {
            if (embedded) {
                log.debug(
                        "Failed to read embedded image, using empty placeholder: {}",
                        e.getMessage());
                return new ReadResult(new byte[0], 0);
            }
            throw e;
        }
    }

    private long countRemainingBytes(InputStream input, long alreadyRead) throws IOException {
        long count = alreadyRead;

        long skipped;
        while (count < MAX_SIZE_ESTIMATION_BYTES
                && (skipped = input.skip(MAX_SIZE_ESTIMATION_BYTES - count)) > 0) {
            count += skipped;
        }

        if (count < MAX_SIZE_ESTIMATION_BYTES && input.available() > 0) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1 && count < MAX_SIZE_ESTIMATION_BYTES) {
                count += read;
            }
        }

        return count;
    }

    private String formatRecipients(List<Recipient> recipients, RecipientType type) {
        if (recipients == null || type == null) {
            return "";
        }

        return recipients.stream()
                .filter(Objects::nonNull)
                // Use type.equals() for null-safe comparison (recipient.getType() may be null)
                .filter(recipient -> type.equals(recipient.getType()))
                .map(EmlParser::formatRecipient)
                .filter(string -> !isBlank(string))
                .collect(Collectors.joining(", "));
    }

    private String formatRecipient(Recipient recipient) {
        if (recipient == null) {
            return "";
        }

        String name = safeMimeDecode(recipient.getName());
        String address = safeMimeDecode(recipient.getAddress());

        if (!isBlank(name) && !isBlank(address)) {
            return name + " <" + address + ">";
        }
        return !isBlank(name) ? name : address;
    }

    public String safeMimeDecode(String headerValue) {
        if (isBlank(headerValue)) {
            return "";
        }
        return EmlProcessingUtils.decodeMimeHeader(headerValue.trim());
    }

    private String stripCid(String contentId) {
        if (contentId == null) {
            return null;
        }
        return RegexPatternUtils.getInstance()
                .getAngleBracketsPattern()
                .matcher(contentId)
                .replaceAll("")
                .trim();
    }

    private long getMaxAttachmentSizeBytes(EmlToPdfRequest request) {
        long maxMb = request != null ? request.getMaxAttachmentSizeMB() : DEFAULT_MAX_ATTACHMENT_MB;
        return maxMb * 1024L * 1024L;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String defaultString(String value) {
        return value != null ? value : "";
    }

    private record ReadResult(byte[] data, long totalSize) {
        public ReadResult {
            if (totalSize < 0) {
                throw new IllegalArgumentException("Size cannot be negative: " + totalSize);
            }
            if (data != null && data.length > totalSize) {
                throw new IllegalArgumentException(
                        "Data length (" + data.length + ") exceeds total size (" + totalSize + ")");
            }
        }
    }

    @Data
    public class EmailContent {
        private String subject;
        private String from;
        private String to;
        private String cc;
        private String bcc;
        private ZonedDateTime date;
        private String dateString; // Maintained for compatibility
        private String htmlBody;
        private String textBody;
        private int attachmentCount;
        private List<EmailAttachment> attachments = new ArrayList<>();

        public void setHtmlBody(String htmlBody) {
            this.htmlBody =
                    htmlBody != null
                            ? RegexPatternUtils.getInstance()
                                    .getCarriageReturnPattern()
                                    .matcher(htmlBody)
                                    .replaceAll("")
                            : null;
        }

        public void setTextBody(String textBody) {
            this.textBody =
                    textBody != null
                            ? RegexPatternUtils.getInstance()
                                    .getCarriageReturnPattern()
                                    .matcher(textBody)
                                    .replaceAll("")
                            : null;
        }
    }

    @Data
    public class EmailAttachment {
        private String filename;
        private String contentType;
        private byte[] data;
        private boolean embedded;
        private String embeddedFilename;
        private long sizeBytes;
        private String contentId;
        private String disposition;
        private String transferEncoding;

        public void setData(byte[] data) {
            this.data = data;
            if (data != null) {
                this.sizeBytes = data.length;
            }
        }

        /**
         * Names over {@code MAX_FILENAME_LENGTH} UTF-16 units are shortened, keeping an extension
         * of up to {@code MAX_EXTENSION_LENGTH} characters and never splitting a surrogate pair, so
         * every consumer sees the same bounded name.
         */
        public void setFilename(String filename) {
            this.filename = limitFilenameLength(filename);
        }
    }

    static String limitFilenameLength(String filename) {
        if (filename == null || filename.length() <= MAX_FILENAME_LENGTH) {
            return filename;
        }
        String extension = "";
        int lastDot = filename.lastIndexOf('.');
        if (lastDot > 0 && filename.length() - lastDot <= MAX_EXTENSION_LENGTH) {
            extension = filename.substring(lastDot);
        }
        int keep = MAX_FILENAME_LENGTH - extension.length();
        if (Character.isHighSurrogate(filename.charAt(keep - 1))) {
            keep--;
        }
        return filename.substring(0, keep) + extension;
    }
}

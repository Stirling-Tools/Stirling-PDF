package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import lombok.Data;
import lombok.Getter;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.converters.EmlToPdfRequest;

@Slf4j
@UtilityClass
public class EmlToPdf {
    private static final class StyleConstants {
        // Font and layout constants
        static final int DEFAULT_FONT_SIZE = 12;
        static final String DEFAULT_FONT_FAMILY = "Helvetica, sans-serif";
        static final float DEFAULT_LINE_HEIGHT = 1.4f;
        static final String DEFAULT_ZOOM = "1.0";

        // Color constants - aligned with application theme
        static final String DEFAULT_TEXT_COLOR = "#202124";
        static final String DEFAULT_BACKGROUND_COLOR = "#ffffff";
        static final String DEFAULT_BORDER_COLOR = "#e8eaed";
        static final String ATTACHMENT_BACKGROUND_COLOR = "#f9f9f9";
        static final String ATTACHMENT_BORDER_COLOR = "#eeeeee";

        // Size constants for PDF annotations
        static final float ATTACHMENT_ICON_WIDTH = 12f;
        static final float ATTACHMENT_ICON_HEIGHT = 14f;
        static final float ANNOTATION_X_OFFSET = 2f;
        static final float ANNOTATION_Y_OFFSET = 10f;

        // Content validation constants
        static final int EML_CHECK_LENGTH = 8192;
        static final int MIN_HEADER_COUNT_FOR_VALID_EML = 2;

        private StyleConstants() {}
    }

    private static final class MimeConstants {
        static final Pattern MIME_ENCODED_PATTERN =
                Pattern.compile("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=");
        static final String ATTACHMENT_MARKER = "►";

        private MimeConstants() {}
    }

    private static final class FileSizeConstants {
        static final long BYTES_IN_KB = 1024L;
        static final long BYTES_IN_MB = BYTES_IN_KB * 1024L;
        static final long BYTES_IN_GB = BYTES_IN_MB * 1024L;

        private FileSizeConstants() {}
    }

    // Cached Jakarta Mail availability check
    private static Boolean jakartaMailAvailable = null;

    private static boolean isJakartaMailAvailable() {
        if (jakartaMailAvailable == null) {
            try {
                Class.forName("jakarta.mail.internet.MimeMessage");
                Class.forName("jakarta.mail.Session");
                jakartaMailAvailable = true;
                log.debug("Jakarta Mail libraries are available");
            } catch (ClassNotFoundException e) {
                jakartaMailAvailable = false;
                log.debug("Jakarta Mail libraries are not available, using basic parsing");
            }
        }
        return jakartaMailAvailable;
    }

    public static String convertEmlToHtml(byte[] emlBytes, EmlToPdfRequest request)
            throws IOException {
        validateEmlInput(emlBytes);

        if (isJakartaMailAvailable()) {
            return convertEmlToHtmlAdvanced(emlBytes, request);
        } else {
            return convertEmlToHtmlBasic(emlBytes, request);
        }
    }

    public static byte[] convertEmlToPdf(
            String weasyprintPath,
            EmlToPdfRequest request,
            byte[] emlBytes,
            String fileName,
            boolean disableSanitize,
            stirling.software.common.service.CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException, InterruptedException {

        validateEmlInput(emlBytes);

        try {
            // Generate HTML representation
            EmailContent emailContent = null;
            String htmlContent;

            if (isJakartaMailAvailable()) {
                emailContent = extractEmailContentAdvanced(emlBytes, request);
                htmlContent = generateEnhancedEmailHtml(emailContent, request);
            } else {
                htmlContent = convertEmlToHtmlBasic(emlBytes, request);
            }

            // Convert HTML to PDF
            byte[] pdfBytes =
                    convertHtmlToPdf(weasyprintPath, request, htmlContent, disableSanitize);

            // Attach files if available and requested
            if (shouldAttachFiles(emailContent, request)) {
                pdfBytes =
                        attachFilesToPdf(
                                pdfBytes, emailContent.getAttachments(), pdfDocumentFactory);
            }

            return pdfBytes;

        } catch (IOException | InterruptedException e) {
            log.error("Failed to convert EML to PDF for file: {}", fileName, e);
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error during EML to PDF conversion for file: {}", fileName, e);
            throw new IOException("Conversion failed: " + e.getMessage(), e);
        }
    }

    private static void validateEmlInput(byte[] emlBytes) {
        if (emlBytes == null || emlBytes.length == 0) {
            throw new IllegalArgumentException("EML file is empty or null");
        }

        if (isInvalidEmlFormat(emlBytes)) {
            throw new IllegalArgumentException("Invalid EML file format");
        }
    }

    private static boolean shouldAttachFiles(EmailContent emailContent, EmlToPdfRequest request) {
        return emailContent != null
                && request != null
                && request.isIncludeAttachments()
                && !emailContent.getAttachments().isEmpty();
    }

    private static byte[] convertHtmlToPdf(
            String weasyprintPath,
            EmlToPdfRequest request,
            String htmlContent,
            boolean disableSanitize)
            throws IOException, InterruptedException {

        stirling.software.common.model.api.converters.HTMLToPdfRequest htmlRequest =
                createHtmlRequest(request);

        try {
            return FileToPdf.convertHtmlToPdf(
                    weasyprintPath,
                    htmlRequest,
                    htmlContent.getBytes(StandardCharsets.UTF_8),
                    "email.html",
                    disableSanitize);
        } catch (IOException | InterruptedException e) {
            log.warn("Initial HTML to PDF conversion failed, trying with simplified HTML");
            String simplifiedHtml = simplifyHtmlContent(htmlContent);
            return FileToPdf.convertHtmlToPdf(
                    weasyprintPath,
                    htmlRequest,
                    simplifiedHtml.getBytes(StandardCharsets.UTF_8),
                    "email.html",
                    disableSanitize);
        }
    }

    private static String simplifyHtmlContent(String htmlContent) {
        String simplified = htmlContent.replaceAll("(?i)<script[^>]*>.*?</script>", "");
        simplified = simplified.replaceAll("(?i)<style[^>]*>.*?</style>", "");
        return simplified;
    }

    private static String generateUniqueAttachmentId(String filename) {
        return "attachment_" + filename.hashCode() + "_" + System.nanoTime();
    }

    private static String convertEmlToHtmlBasic(byte[] emlBytes, EmlToPdfRequest request) {
        if (emlBytes == null || emlBytes.length == 0) {
            throw new IllegalArgumentException("EML file is empty or null");
        }

        String emlContent = new String(emlBytes, StandardCharsets.UTF_8);

        // Basic email parsing
        String subject = extractBasicHeader(emlContent, "Subject:");
        String from = extractBasicHeader(emlContent, "From:");
        String to = extractBasicHeader(emlContent, "To:");
        String cc = extractBasicHeader(emlContent, "Cc:");
        String bcc = extractBasicHeader(emlContent, "Bcc:");
        String date = extractBasicHeader(emlContent, "Date:");

        // Try to extract HTML content
        String htmlBody = extractHtmlBody(emlContent);
        if (htmlBody == null) {
            String textBody = extractTextBody(emlContent);
            htmlBody =
                    convertTextToHtml(
                            textBody != null ? textBody : "Email content could not be parsed");
        }

        // Generate HTML with custom styling based on request
        StringBuilder html = new StringBuilder();
        html.append("<!DOCTYPE html>\n");
        html.append("<html><head><meta charset=\"UTF-8\">\n");
        html.append("<title>").append(escapeHtml(subject)).append("</title>\n");
        html.append("<style>\n");
        appendEnhancedStyles(html);
        html.append("</style>\n");
        html.append("</head><body>\n");

        html.append("<div class=\"email-container\">\n");
        html.append("<div class=\"email-header\">\n");
        html.append("<h1>").append(escapeHtml(subject)).append("</h1>\n");
        html.append("<div class=\"email-meta\">\n");
        html.append("<div><strong>From:</strong> ").append(escapeHtml(from)).append("</div>\n");
        html.append("<div><strong>To:</strong> ").append(escapeHtml(to)).append("</div>\n");

        // Include CC and BCC if present and requested
        if (request != null && request.isIncludeAllRecipients()) {
            if (!cc.trim().isEmpty()) {
                html.append("<div><strong>CC:</strong> ").append(escapeHtml(cc)).append("</div>\n");
            }
            if (!bcc.trim().isEmpty()) {
                html.append("<div><strong>BCC:</strong> ")
                        .append(escapeHtml(bcc))
                        .append("</div>\n");
            }
        }

        if (!date.trim().isEmpty()) {
            html.append("<div><strong>Date:</strong> ").append(escapeHtml(date)).append("</div>\n");
        }
        html.append("</div></div>\n");

        html.append("<div class=\"email-body\">\n");
        html.append(processEmailHtmlBody(htmlBody));
        html.append("</div>\n");

        // Add attachment information - always check for and display attachments
        String attachmentInfo = extractAttachmentInfo(emlContent);
        if (!attachmentInfo.isEmpty()) {
            html.append("<div class=\"attachment-section\">\n");
            html.append("<h3>Attachments</h3>\n");
            html.append(attachmentInfo);

            // Add status message about attachment inclusion
            if (request != null && request.isIncludeAttachments()) {
                html.append("<div class=\"attachment-inclusion-note\">\n");
                html.append(
                        "<p><strong>Note:</strong> Attachments are saved as external files and linked in this PDF. Click the links to open files externally.</p>\n");
                html.append("</div>\n");
            } else {
                html.append("<div class=\"attachment-info-note\">\n");
                html.append(
                        "<p><em>Attachment information displayed - files not included in PDF. Enable 'Include attachments' to embed files.</em></p>\n");
                html.append("</div>\n");
            }

            html.append("</div>\n");
        }

        // Show advanced features status if requested
        assert request != null;
        if (request.getFileInput().isEmpty()) {
            html.append("<div class=\"advanced-features-notice\">\n");
            html.append(
                    "<p><em>Note: Some advanced features require Jakarta Mail dependencies.</em></p>\n");
            html.append("</div>\n");
        }

        html.append("</div>\n");
        html.append("</body></html>");

        return html.toString();
    }

    private static EmailContent extractEmailContentAdvanced(
            byte[] emlBytes, EmlToPdfRequest request) {
        try {
            // Use Jakarta Mail for processing
            Class<?> sessionClass = Class.forName("jakarta.mail.Session");
            Class<?> mimeMessageClass = Class.forName("jakarta.mail.internet.MimeMessage");

            Method getDefaultInstance =
                    sessionClass.getMethod("getDefaultInstance", Properties.class);
            Object session = getDefaultInstance.invoke(null, new Properties());

            // Cast the session object to the proper type for the constructor
            Class<?>[] constructorArgs = new Class<?>[] {sessionClass, InputStream.class};
            Constructor<?> mimeMessageConstructor =
                    mimeMessageClass.getConstructor(constructorArgs);
            Object message =
                    mimeMessageConstructor.newInstance(
                            sessionClass.cast(session), new ByteArrayInputStream(emlBytes));

            return extractEmailContentAdvanced(message, request);

        } catch (ReflectiveOperationException e) {
            // Create basic EmailContent from basic processing
            EmailContent content = new EmailContent();
            content.setHtmlBody(convertEmlToHtmlBasic(emlBytes, request));
            return content;
        }
    }

    private static String convertEmlToHtmlAdvanced(byte[] emlBytes, EmlToPdfRequest request) {
        EmailContent content = extractEmailContentAdvanced(emlBytes, request);
        return generateEnhancedEmailHtml(content, request);
    }

    private static String extractAttachmentInfo(String emlContent) {
        StringBuilder attachmentInfo = new StringBuilder();
        try {
            String[] lines = emlContent.split("\r?\n");
            boolean inHeaders = true;
            String currentContentType = "";
            String currentDisposition = "";
            String currentFilename = "";
            String currentEncoding = "";
            boolean inMultipart = false;
            String boundary = "";

            // First pass: find boundary for multipart messages
            for (String line : lines) {
                String lowerLine = line.toLowerCase().trim();
                if (lowerLine.startsWith("content-type:") && lowerLine.contains("multipart")) {
                    if (lowerLine.contains("boundary=")) {
                        int boundaryStart = lowerLine.indexOf("boundary=") + 9;
                        String boundaryPart = line.substring(boundaryStart).trim();
                        if (boundaryPart.startsWith("\"")) {
                            boundary = boundaryPart.substring(1, boundaryPart.indexOf("\"", 1));
                        } else {
                            int spaceIndex = boundaryPart.indexOf(" ");
                            boundary =
                                    spaceIndex > 0
                                            ? boundaryPart.substring(0, spaceIndex)
                                            : boundaryPart;
                        }
                        inMultipart = true;
                        break;
                    }
                }
                if (line.trim().isEmpty()) break;
            }

            // Second pass: extract attachment information
            for (String line : lines) {
                String lowerLine = line.toLowerCase().trim();

                // Check for boundary markers in multipart messages
                if (inMultipart && line.trim().startsWith("--" + boundary)) {
                    // Reset for new part
                    currentContentType = "";
                    currentDisposition = "";
                    currentFilename = "";
                    currentEncoding = "";
                    inHeaders = true;
                    continue;
                }

                if (inHeaders && line.trim().isEmpty()) {
                    inHeaders = false;

                    // Process accumulated attachment info
                    if (isAttachment(currentDisposition, currentFilename, currentContentType)) {
                        addAttachmentToInfo(
                                attachmentInfo,
                                currentFilename,
                                currentContentType,
                                currentEncoding);

                        // Reset for next attachment
                        currentContentType = "";
                        currentDisposition = "";
                        currentFilename = "";
                        currentEncoding = "";
                    }
                    continue;
                }

                if (!inHeaders) continue; // Skip body content

                // Parse headers
                if (lowerLine.startsWith("content-type:")) {
                    currentContentType = line.substring(13).trim();
                } else if (lowerLine.startsWith("content-disposition:")) {
                    currentDisposition = line.substring(20).trim();
                    // Extract filename if present
                    currentFilename = extractFilenameFromDisposition(currentDisposition);
                } else if (lowerLine.startsWith("content-transfer-encoding:")) {
                    currentEncoding = line.substring(26).trim();
                } else if (line.startsWith(" ") || line.startsWith("\t")) {
                    // Continuation of previous header
                    if (currentDisposition.contains("filename=")) {
                        currentDisposition += " " + line.trim();
                        currentFilename = extractFilenameFromDisposition(currentDisposition);
                    } else if (!currentContentType.isEmpty()) {
                        currentContentType += " " + line.trim();
                    }
                }
            }

            if (isAttachment(currentDisposition, currentFilename, currentContentType)) {
                addAttachmentToInfo(
                        attachmentInfo, currentFilename, currentContentType, currentEncoding);
            }

        } catch (RuntimeException e) {
            log.warn("Error extracting attachment info: {}", e.getMessage());
        }
        return attachmentInfo.toString();
    }

    private static boolean isAttachment(String disposition, String filename, String contentType) {
        return (disposition.toLowerCase().contains("attachment") && !filename.isEmpty())
                || (!filename.isEmpty() && !contentType.toLowerCase().startsWith("text/"))
                || (contentType.toLowerCase().contains("application/") && !filename.isEmpty());
    }

    private static String extractFilenameFromDisposition(String disposition) {
        if (disposition.contains("filename=")) {
            int filenameStart = disposition.toLowerCase().indexOf("filename=") + 9;
            int filenameEnd = disposition.indexOf(";", filenameStart);
            if (filenameEnd == -1) filenameEnd = disposition.length();
            String filename = disposition.substring(filenameStart, filenameEnd).trim();
            filename = filename.replaceAll("^\"|\"$", "");
            // Apply MIME decoding to handle encoded filenames
            return safeMimeDecode(filename);
        }
        return "";
    }

    private static void addAttachmentToInfo(
            StringBuilder attachmentInfo, String filename, String contentType, String encoding) {
        // Create attachment info with paperclip emoji before filename
        attachmentInfo
                .append("<div class=\"attachment-item\">")
                .append("<span class=\"attachment-icon\">")
                .append(MimeConstants.ATTACHMENT_MARKER)
                .append("</span> ")
                .append("<span class=\"attachment-name\">")
                .append(escapeHtml(filename))
                .append("</span>");

        // Add content type and encoding info
        if (!contentType.isEmpty() || !encoding.isEmpty()) {
            attachmentInfo.append(" <span class=\"attachment-details\">(");
            if (!contentType.isEmpty()) {
                attachmentInfo.append(escapeHtml(contentType));
            }
            if (!encoding.isEmpty()) {
                if (!contentType.isEmpty()) attachmentInfo.append(", ");
                attachmentInfo.append("encoding: ").append(escapeHtml(encoding));
            }
            attachmentInfo.append(")</span>");
        }
        attachmentInfo.append("</div>\n");
    }

    private static boolean isInvalidEmlFormat(byte[] emlBytes) {
        try {
            int checkLength = Math.min(emlBytes.length, StyleConstants.EML_CHECK_LENGTH);
            String content = new String(emlBytes, 0, checkLength, StandardCharsets.UTF_8);
            String lowerContent = content.toLowerCase();

            boolean hasFrom =
                    lowerContent.contains("from:") || lowerContent.contains("return-path:");
            boolean hasSubject = lowerContent.contains("subject:");
            boolean hasMessageId = lowerContent.contains("message-id:");
            boolean hasDate = lowerContent.contains("date:");
            boolean hasTo =
                    lowerContent.contains("to:")
                            || lowerContent.contains("cc:")
                            || lowerContent.contains("bcc:");
            boolean hasMimeStructure =
                    lowerContent.contains("multipart/")
                            || lowerContent.contains("text/plain")
                            || lowerContent.contains("text/html")
                            || lowerContent.contains("boundary=");

            int headerCount = 0;
            if (hasFrom) headerCount++;
            if (hasSubject) headerCount++;
            if (hasMessageId) headerCount++;
            if (hasDate) headerCount++;
            if (hasTo) headerCount++;

            return headerCount < StyleConstants.MIN_HEADER_COUNT_FOR_VALID_EML && !hasMimeStructure;

        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String extractBasicHeader(String emlContent, String headerName) {
        try {
            String[] lines = emlContent.split("\r?\n");
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i];
                if (line.toLowerCase().startsWith(headerName.toLowerCase())) {
                    StringBuilder value =
                            new StringBuilder(line.substring(headerName.length()).trim());
                    // Handle multi-line headers
                    for (int j = i + 1; j < lines.length; j++) {
                        if (lines[j].startsWith(" ") || lines[j].startsWith("\t")) {
                            value.append(" ").append(lines[j].trim());
                        } else {
                            break;
                        }
                    }
                    // Apply MIME header decoding
                    return safeMimeDecode(value.toString());
                }
                if (line.trim().isEmpty()) break;
            }
        } catch (RuntimeException e) {
            log.warn("Error extracting header '{}': {}", headerName, e.getMessage());
        }
        return "";
    }

    private static String extractHtmlBody(String emlContent) {
        try {
            String lowerContent = emlContent.toLowerCase();
            int htmlStart = lowerContent.indexOf("content-type: text/html");
            if (htmlStart == -1) return null;

            return getString(emlContent, htmlStart);

        } catch (Exception e) {
            return null;
        }
    }

    @Nullable
    private static String getString(String emlContent, int htmlStart) {
        int bodyStart = emlContent.indexOf("\r\n\r\n", htmlStart);
        if (bodyStart == -1) bodyStart = emlContent.indexOf("\n\n", htmlStart);
        if (bodyStart == -1) return null;

        bodyStart += (emlContent.charAt(bodyStart + 1) == '\r') ? 4 : 2;
        int bodyEnd = findPartEnd(emlContent, bodyStart);

        return emlContent.substring(bodyStart, bodyEnd).trim();
    }

    private static String extractTextBody(String emlContent) {
        try {
            String lowerContent = emlContent.toLowerCase();
            int textStart = lowerContent.indexOf("content-type: text/plain");
            if (textStart == -1) {
                int bodyStart = emlContent.indexOf("\r\n\r\n");
                if (bodyStart == -1) bodyStart = emlContent.indexOf("\n\n");
                if (bodyStart != -1) {
                    bodyStart += (emlContent.charAt(bodyStart + 1) == '\r') ? 4 : 2;
                    int bodyEnd = findPartEnd(emlContent, bodyStart);
                    return emlContent.substring(bodyStart, bodyEnd).trim();
                }
                return null;
            }

            return getString(emlContent, textStart);

        } catch (RuntimeException e) {
            return null;
        }
    }

    private static int findPartEnd(String content, int start) {
        String[] lines = content.substring(start).split("\r?\n");
        StringBuilder result = new StringBuilder();

        for (String line : lines) {
            if (line.startsWith("--") && line.length() > 10) break;
            result.append(line).append("\n");
        }

        return start + result.length();
    }

    private static String convertTextToHtml(String textBody) {
        if (textBody == null) return "";

        String html = escapeHtml(textBody);
        html = html.replace("\r\n", "\n").replace("\r", "\n");
        html = html.replace("\n", "<br>\n");

        html =
                html.replaceAll(
                        "(https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+)",
                        "<a href=\"$1\" style=\"color: #1a73e8; text-decoration: underline;\">$1</a>");

        html =
                html.replaceAll(
                        "([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,63})",
                        "<a href=\"mailto:$1\" style=\"color: #1a73e8; text-decoration: underline;\">$1</a>");

        return html;
    }

    private static String processEmailHtmlBody(String htmlBody) {
        if (htmlBody == null) return "";

        String processed = htmlBody;

        // Remove problematic CSS
        processed = processed.replaceAll("(?i)\\s*position\\s*:\\s*fixed[^;]*;?", "");
        processed = processed.replaceAll("(?i)\\s*position\\s*:\\s*absolute[^;]*;?", "");

        return processed;
    }

    private static void appendEnhancedStyles(StringBuilder html) {
        int fontSize = StyleConstants.DEFAULT_FONT_SIZE;
        String textColor = StyleConstants.DEFAULT_TEXT_COLOR;
        String backgroundColor = StyleConstants.DEFAULT_BACKGROUND_COLOR;
        String borderColor = StyleConstants.DEFAULT_BORDER_COLOR;

        html.append("body {\n");
        html.append("  font-family: ").append(StyleConstants.DEFAULT_FONT_FAMILY).append(";\n");
        html.append("  font-size: ").append(fontSize).append("px;\n");
        html.append("  line-height: ").append(StyleConstants.DEFAULT_LINE_HEIGHT).append(";\n");
        html.append("  color: ").append(textColor).append(";\n");
        html.append("  margin: 0;\n");
        html.append("  padding: 16px;\n");
        html.append("  background-color: ").append(backgroundColor).append(";\n");
        html.append("}\n\n");

        html.append(".email-container {\n");
        html.append("  width: 100%;\n");
        html.append("  max-width: 100%;\n");
        html.append("  margin: 0 auto;\n");
        html.append("}\n\n");

        html.append(".email-header {\n");
        html.append("  padding-bottom: 10px;\n");
        html.append("  border-bottom: 1px solid ").append(borderColor).append(";\n");
        html.append("  margin-bottom: 10px;\n");
        html.append("}\n\n");
        html.append(".email-header h1 {\n");
        html.append("  margin: 0 0 10px 0;\n");
        html.append("  font-size: ").append(fontSize + 4).append("px;\n");
        html.append("  font-weight: bold;\n");
        html.append("}\n\n");
        html.append(".email-meta div {\n");
        html.append("  margin-bottom: 2px;\n");
        html.append("  font-size: ").append(fontSize - 1).append("px;\n");
        html.append("}\n\n");

        html.append(".email-body {\n");
        html.append("  word-wrap: break-word;\n");
        html.append("}\n\n");

        html.append(".attachment-section {\n");
        html.append("  margin-top: 15px;\n");
        html.append("  padding: 10px;\n");
        html.append("  background-color: ")
                .append(StyleConstants.ATTACHMENT_BACKGROUND_COLOR)
                .append(";\n");
        html.append("  border: 1px solid ")
                .append(StyleConstants.ATTACHMENT_BORDER_COLOR)
                .append(";\n");
        html.append("  border-radius: 3px;\n");
        html.append("}\n\n");
        html.append(".attachment-section h3 {\n");
        html.append("  margin: 0 0 8px 0;\n");
        html.append("  font-size: ").append(fontSize + 1).append("px;\n");
        html.append("}\n\n");
        html.append(".attachment-item {\n");
        html.append("  padding: 5px 0;\n");
        html.append("}\n\n");
        html.append(".attachment-icon {\n");
        html.append("  margin-right: 5px;\n");
        html.append("}\n\n");
        html.append(".attachment-details, .attachment-type {\n");
        html.append("  font-size: ").append(fontSize - 2).append("px;\n");
        html.append("  color: #555555;\n");
        html.append("}\n\n");
        html.append(".attachment-inclusion-note, .attachment-info-note {\n");
        html.append("  margin-top: 8px;\n");
        html.append("  padding: 6px;\n");
        html.append("  font-size: ").append(fontSize - 2).append("px;\n");
        html.append("  border-radius: 3px;\n");
        html.append("}\n\n");
        html.append(".attachment-inclusion-note {\n");
        html.append("  background-color: #e6ffed;\n");
        html.append("  border: 1px solid #d4f7dc;\n");
        html.append("  color: #006420;\n");
        html.append("}\n\n");
        html.append(".attachment-info-note {\n");
        html.append("  background-color: #fff9e6;\n");
        html.append("  border: 1px solid #fff0c2;\n");
        html.append("  color: #664d00;\n");
        html.append("}\n\n");
        html.append(".attachment-link-container {\n");
        html.append("  display: flex;\n");
        html.append("  align-items: center;\n");
        html.append("  padding: 8px;\n");
        html.append("  background-color: #f8f9fa;\n");
        html.append("  border: 1px solid #dee2e6;\n");
        html.append("  border-radius: 4px;\n");
        html.append("  margin: 4px 0;\n");
        html.append("}\n\n");
        html.append(".attachment-link-container:hover {\n");
        html.append("  background-color: #e9ecef;\n");
        html.append("}\n\n");
        html.append(".attachment-note {\n");
        html.append("  font-size: ").append(fontSize - 3).append("px;\n");
        html.append("  color: #6c757d;\n");
        html.append("  font-style: italic;\n");
        html.append("  margin-left: 8px;\n");
        html.append("}\n\n");

        // Basic image styling: ensure images are responsive but not overly constrained.
        html.append("img {\n");
        html.append("  max-width: 100%;\n"); // Make images responsive to container width
        html.append("  height: auto;\n"); // Maintain aspect ratio
        html.append("  display: block;\n"); // Avoid extra space below images
        html.append("}\n\n");
    }

    private static String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private static stirling.software.common.model.api.converters.HTMLToPdfRequest createHtmlRequest(
            EmlToPdfRequest request) {
        stirling.software.common.model.api.converters.HTMLToPdfRequest htmlRequest =
                new stirling.software.common.model.api.converters.HTMLToPdfRequest();

        if (request != null) {
            htmlRequest.setFileInput(request.getFileInput());
        }

        // Set default zoom level
        htmlRequest.setZoom(Float.parseFloat(StyleConstants.DEFAULT_ZOOM));

        return htmlRequest;
    }

    private static EmailContent extractEmailContentAdvanced(
            Object message, EmlToPdfRequest request) {
        EmailContent content = new EmailContent();

        try {
            Class<?> messageClass = message.getClass();

            // Extract headers via reflection
            java.lang.reflect.Method getSubject = messageClass.getMethod("getSubject");
            String subject = (String) getSubject.invoke(message);
            content.setSubject(subject != null ? safeMimeDecode(subject) : "No Subject");

            java.lang.reflect.Method getFrom = messageClass.getMethod("getFrom");
            Object[] fromAddresses = (Object[]) getFrom.invoke(message);
            content.setFrom(
                    fromAddresses != null && fromAddresses.length > 0
                            ? safeMimeDecode(fromAddresses[0].toString())
                            : "");

            java.lang.reflect.Method getAllRecipients = messageClass.getMethod("getAllRecipients");
            Object[] recipients = (Object[]) getAllRecipients.invoke(message);
            content.setTo(
                    recipients != null && recipients.length > 0
                            ? safeMimeDecode(recipients[0].toString())
                            : "");

            java.lang.reflect.Method getSentDate = messageClass.getMethod("getSentDate");
            content.setDate((Date) getSentDate.invoke(message));

            // Extract content
            java.lang.reflect.Method getContent = messageClass.getMethod("getContent");
            Object messageContent = getContent.invoke(message);

            if (messageContent instanceof String stringContent) {
                java.lang.reflect.Method getContentType = messageClass.getMethod("getContentType");
                String contentType = (String) getContentType.invoke(message);
                if (contentType != null && contentType.toLowerCase().contains("text/html")) {
                    content.setHtmlBody(stringContent);
                } else {
                    content.setTextBody(stringContent);
                }
            } else {
                // Handle multipart content
                try {
                    Class<?> multipartClass = Class.forName("jakarta.mail.Multipart");
                    if (multipartClass.isInstance(messageContent)) {
                        processMultipartAdvanced(messageContent, content, request);
                    }
                } catch (Exception e) {
                    log.warn("Error processing content: {}", e.getMessage());
                }
            }

        } catch (Exception e) {
            content.setSubject("Email Conversion");
            content.setFrom("Unknown");
            content.setTo("Unknown");
            content.setTextBody("Email content could not be parsed with advanced processing");
        }

        return content;
    }

    private static void processMultipartAdvanced(
            Object multipart, EmailContent content, EmlToPdfRequest request) {
        try {
            Class<?> multipartClass = multipart.getClass();
            java.lang.reflect.Method getCount = multipartClass.getMethod("getCount");
            int count = (Integer) getCount.invoke(multipart);

            java.lang.reflect.Method getBodyPart =
                    multipartClass.getMethod("getBodyPart", int.class);

            for (int i = 0; i < count; i++) {
                Object part = getBodyPart.invoke(multipart, i);
                processPartAdvanced(part, content, request);
            }

        } catch (Exception e) {
            content.setTextBody("Email content could not be parsed with advanced processing");
        }
    }

    private static void processPartAdvanced(
            Object part, EmailContent content, EmlToPdfRequest request) {
        try {
            Class<?> partClass = part.getClass();
            java.lang.reflect.Method isMimeType = partClass.getMethod("isMimeType", String.class);
            java.lang.reflect.Method getContent = partClass.getMethod("getContent");
            java.lang.reflect.Method getDisposition = partClass.getMethod("getDisposition");
            java.lang.reflect.Method getFileName = partClass.getMethod("getFileName");
            java.lang.reflect.Method getContentType = partClass.getMethod("getContentType");
            java.lang.reflect.Method getHeader = partClass.getMethod("getHeader", String.class);

            Object disposition = getDisposition.invoke(part);
            String filename = (String) getFileName.invoke(part);
            String contentType = (String) getContentType.invoke(part);

            if ((Boolean) isMimeType.invoke(part, "text/plain") && disposition == null) {
                content.setTextBody((String) getContent.invoke(part));
            } else if ((Boolean) isMimeType.invoke(part, "text/html") && disposition == null) {
                content.setHtmlBody((String) getContent.invoke(part));
            } else if ("attachment".equalsIgnoreCase((String) disposition)
                    || (filename != null && !filename.trim().isEmpty())) {

                content.setAttachmentCount(content.getAttachmentCount() + 1);

                // Always extract basic attachment metadata for display
                if (filename != null && !filename.trim().isEmpty()) {
                    // Create attachment with metadata only
                    EmailAttachment attachment = new EmailAttachment();
                    // Apply MIME decoding to filename to handle encoded attachment names
                    attachment.setFilename(safeMimeDecode(filename));
                    attachment.setContentType(contentType);

                    // Check if it's an embedded image
                    String[] contentIdHeaders = (String[]) getHeader.invoke(part, "Content-ID");
                    if (contentIdHeaders != null && contentIdHeaders.length > 0) {
                        attachment.setEmbedded(true);
                    }

                    // Extract attachment data only if attachments should be included
                    if (request != null && request.isIncludeAttachments()) {
                        try {
                            Object attachmentContent = getContent.invoke(part);
                            byte[] attachmentData = null;

                            if (attachmentContent instanceof java.io.InputStream inputStream) {
                                try {
                                    attachmentData = inputStream.readAllBytes();
                                } catch (IOException e) {
                                    log.warn(
                                            "Failed to read InputStream attachment: {}",
                                            e.getMessage());
                                }
                            } else if (attachmentContent instanceof byte[] byteArray) {
                                attachmentData = byteArray;
                            } else if (attachmentContent instanceof String stringContent) {
                                attachmentData = stringContent.getBytes(StandardCharsets.UTF_8);
                            }

                            if (attachmentData != null) {
                                // Check size limit (use default 10MB if request is null)
                                long maxSizeMB = request.getMaxAttachmentSizeMB();
                                long maxSizeBytes = maxSizeMB * 1024 * 1024;

                                if (attachmentData.length <= maxSizeBytes) {
                                    attachment.setData(attachmentData);
                                    attachment.setSizeBytes(attachmentData.length);
                                } else {
                                    // Still show attachment info even if too large
                                    attachment.setSizeBytes(attachmentData.length);
                                }
                            }
                        } catch (Exception e) {
                            log.warn("Error extracting attachment data: {}", e.getMessage());
                        }
                    }

                    // Add attachment to the list for display (with or without data)
                    content.getAttachments().add(attachment);
                }
            } else if ((Boolean) isMimeType.invoke(part, "multipart/*")) {
                // Handle nested multipart content
                try {
                    Object multipartContent = getContent.invoke(part);
                    Class<?> multipartClass = Class.forName("jakarta.mail.Multipart");
                    if (multipartClass.isInstance(multipartContent)) {
                        processMultipartAdvanced(multipartContent, content, request);
                    }
                } catch (Exception e) {
                    log.warn("Error processing multipart content: {}", e.getMessage());
                }
            }

        } catch (Exception e) {
            log.warn("Error processing multipart part: {}", e.getMessage());
        }
    }

    private static String generateEnhancedEmailHtml(EmailContent content, EmlToPdfRequest request) {
        StringBuilder html = new StringBuilder();

        html.append("<!DOCTYPE html>\n");
        html.append("<html><head><meta charset=\"UTF-8\">\n");
        html.append("<title>").append(escapeHtml(content.getSubject())).append("</title>\n");
        html.append("<style>\n");
        appendEnhancedStyles(html);
        html.append("</style>\n");
        html.append("</head><body>\n");

        html.append("<div class=\"email-container\">\n");
        html.append("<div class=\"email-header\">\n");
        html.append("<h1>").append(escapeHtml(content.getSubject())).append("</h1>\n");
        html.append("<div class=\"email-meta\">\n");
        html.append("<div><strong>From:</strong> ")
                .append(escapeHtml(content.getFrom()))
                .append("</div>\n");
        html.append("<div><strong>To:</strong> ")
                .append(escapeHtml(content.getTo()))
                .append("</div>\n");

        if (content.getDate() != null) {
            html.append("<div><strong>Date:</strong> ")
                    .append(formatEmailDate(content.getDate()))
                    .append("</div>\n");
        }
        html.append("</div></div>\n");

        html.append("<div class=\"email-body\">\n");
        if (content.getHtmlBody() != null && !content.getHtmlBody().trim().isEmpty()) {
            html.append(processEmailHtmlBody(content.getHtmlBody()));
        } else if (content.getTextBody() != null && !content.getTextBody().trim().isEmpty()) {
            html.append("<div class=\"text-body\">");
            html.append(convertTextToHtml(content.getTextBody()));
            html.append("</div>");
        } else {
            html.append("<div class=\"no-content\">");
            html.append("<p><em>No content available</em></p>");
            html.append("</div>");
        }
        html.append("</div>\n");

        if (content.getAttachmentCount() > 0 || !content.getAttachments().isEmpty()) {
            html.append("<div class=\"attachment-section\">\n");
            int displayedAttachmentCount =
                    content.getAttachmentCount() > 0
                            ? content.getAttachmentCount()
                            : content.getAttachments().size();
            html.append("<h3>Attachments (").append(displayedAttachmentCount).append(")</h3>\n");

            if (!content.getAttachments().isEmpty()) {
                for (EmailAttachment attachment : content.getAttachments()) {
                    // Create attachment info with paperclip emoji before filename
                    String uniqueId = generateUniqueAttachmentId(attachment.getFilename());
                    attachment.setEmbeddedFilename(
                            attachment.getEmbeddedFilename() != null
                                    ? attachment.getEmbeddedFilename()
                                    : attachment.getFilename());

                    html.append("<div class=\"attachment-item\" id=\"")
                            .append(uniqueId)
                            .append("\">")
                            .append("<span class=\"attachment-icon\">")
                            .append(MimeConstants.ATTACHMENT_MARKER)
                            .append("</span> ")
                            .append("<span class=\"attachment-name\">")
                            .append(escapeHtml(safeMimeDecode(attachment.getFilename())))
                            .append("</span>");

                    String sizeStr = formatFileSize(attachment.getSizeBytes());
                    html.append(" <span class=\"attachment-details\">(").append(sizeStr);
                    if (attachment.getContentType() != null
                            && !attachment.getContentType().isEmpty()) {
                        html.append(", ").append(escapeHtml(attachment.getContentType()));
                    }
                    html.append(")</span></div>\n");
                }
            }

            if (request.isIncludeAttachments()) {
                html.append("<div class=\"attachment-info-note\">\n");
                html.append("<p><em>Attachments are embedded in the file.</em></p>\n");
                html.append("</div>\n");
            } else {
                html.append("<div class=\"attachment-info-note\">\n");
                html.append(
                        "<p><em>Attachment information displayed - files not included in PDF.</em></p>\n");
                html.append("</div>\n");
            }

            html.append("</div>\n");
        }

        html.append("</div>\n");
        html.append("</body></html>");

        return html.toString();
    }

    private static byte[] attachFilesToPdf(
            byte[] pdfBytes,
            List<EmailAttachment> attachments,
            stirling.software.common.service.CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(pdfBytes);
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {

            if (attachments == null || attachments.isEmpty()) {
                document.save(outputStream);
                return outputStream.toByteArray();
            }

            List<String> embeddedFiles = new ArrayList<>();

            // Set up the embedded files name tree once
            if (document.getDocumentCatalog().getNames() == null) {
                document.getDocumentCatalog()
                        .setNames(new PDDocumentNameDictionary(document.getDocumentCatalog()));
            }

            PDDocumentNameDictionary names = document.getDocumentCatalog().getNames();
            if (names.getEmbeddedFiles() == null) {
                names.setEmbeddedFiles(new PDEmbeddedFilesNameTreeNode());
            }

            PDEmbeddedFilesNameTreeNode efTree = names.getEmbeddedFiles();
            Map<String, PDComplexFileSpecification> efMap = efTree.getNames();
            if (efMap == null) {
                efMap = new HashMap<>();
            }

            // Embed each attachment directly into the PDF
            for (EmailAttachment attachment : attachments) {
                if (attachment.getData() == null || attachment.getData().length == 0) {
                    continue;
                }

                try {
                    // Generate unique filename
                    String filename = attachment.getFilename();
                    if (filename == null || filename.trim().isEmpty()) {
                        filename = "attachment_" + System.currentTimeMillis();
                        if (attachment.getContentType() != null
                                && attachment.getContentType().contains("/")) {
                            String[] parts = attachment.getContentType().split("/");
                            if (parts.length > 1) {
                                filename += "." + parts[1];
                            }
                        }
                    }

                    // Ensure unique filename
                    String uniqueFilename = getUniqueFilename(filename, embeddedFiles, efMap);

                    // Create embedded file
                    PDEmbeddedFile embeddedFile =
                            new PDEmbeddedFile(
                                    document, new ByteArrayInputStream(attachment.getData()));
                    embeddedFile.setSize(attachment.getData().length);
                    embeddedFile.setCreationDate(new GregorianCalendar());
                    if (attachment.getContentType() != null) {
                        embeddedFile.setSubtype(attachment.getContentType());
                    }

                    // Create file specification
                    PDComplexFileSpecification fileSpec = new PDComplexFileSpecification();
                    fileSpec.setFile(uniqueFilename);
                    fileSpec.setEmbeddedFile(embeddedFile);
                    if (attachment.getContentType() != null) {
                        fileSpec.setFileDescription("Email attachment: " + uniqueFilename);
                    }

                    // Add to the map (but don't set it yet)
                    efMap.put(uniqueFilename, fileSpec);
                    embeddedFiles.add(uniqueFilename);

                    // Store the filename for annotation creation
                    attachment.setEmbeddedFilename(uniqueFilename);

                } catch (Exception e) {
                    // Log error but continue with other attachments
                    log.warn("Failed to embed attachment: {}", attachment.getFilename(), e);
                }
            }

            // Set the complete map once at the end
            if (!efMap.isEmpty()) {
                efTree.setNames(efMap);

                // Set catalog viewer preferences to automatically show attachments pane
                setCatalogViewerPreferences(document);
            }

            // Add attachment annotations to the first page for each embedded file
            if (!embeddedFiles.isEmpty()) {
                addAttachmentAnnotationsToDocument(document, attachments);
            }

            document.save(outputStream);
            return outputStream.toByteArray();
        }
    }

    private static String getUniqueFilename(
            String filename,
            List<String> embeddedFiles,
            Map<String, PDComplexFileSpecification> efMap) {
        String uniqueFilename = filename;
        int counter = 1;
        while (embeddedFiles.contains(uniqueFilename) || efMap.containsKey(uniqueFilename)) {
            String extension = "";
            String baseName = filename;
            int lastDot = filename.lastIndexOf('.');
            if (lastDot > 0) {
                extension = filename.substring(lastDot);
                baseName = filename.substring(0, lastDot);
            }
            uniqueFilename = baseName + "_" + counter + extension;
            counter++;
        }
        return uniqueFilename;
    }

    private static void addAttachmentAnnotationsToDocument(
            PDDocument document, List<EmailAttachment> attachments) throws IOException {
        if (document.getNumberOfPages() == 0 || attachments == null || attachments.isEmpty()) {
            return;
        }

        // 1. Find the screen position of all attachment markers
        AttachmentMarkerPositionFinder finder = new AttachmentMarkerPositionFinder();
        finder.setSortByPosition(true); // Process pages in order
        finder.getText(document);
        List<MarkerPosition> markerPositions = finder.getPositions();

        // 2. Warn if the number of markers and attachments don't match
        if (markerPositions.size() != attachments.size()) {
            log.warn(
                    "Found {} attachment markers, but there are {} attachments. Annotation count may be incorrect.",
                    markerPositions.size(),
                    attachments.size());
        }

        // 3. Create an invisible annotation over each found marker
        int annotationsToAdd = Math.min(markerPositions.size(), attachments.size());
        for (int i = 0; i < annotationsToAdd; i++) {
            MarkerPosition position = markerPositions.get(i);
            EmailAttachment attachment = attachments.get(i);

            if (attachment.getEmbeddedFilename() != null) {
                PDPage page = document.getPage(position.getPageIndex());
                addAttachmentAnnotationToPage(
                        document, page, attachment, position.getX(), position.getY());
            }
        }
    }

    private static void addAttachmentAnnotationToPage(
            PDDocument document, PDPage page, EmailAttachment attachment, float x, float y)
            throws IOException {

        PDAnnotationFileAttachment fileAnnotation = new PDAnnotationFileAttachment();

        PDRectangle rect = getPdRectangle(page, x, y);
        fileAnnotation.setRectangle(rect);

        // Remove visual appearance while keeping clickable functionality
        try {
            PDAppearanceDictionary appearance = new PDAppearanceDictionary();
            PDAppearanceStream normalAppearance = new PDAppearanceStream(document);
            normalAppearance.setBBox(new PDRectangle(0, 0, 0, 0)); // Zero-size bounding box

            appearance.setNormalAppearance(normalAppearance);
            fileAnnotation.setAppearance(appearance);
        } catch (Exception e) {
            // If appearance manipulation fails, just set it to null
            fileAnnotation.setAppearance(null);
        }

        // Set invisibility flags but keep it functional
        fileAnnotation.setInvisible(true);
        fileAnnotation.setHidden(false); // Must be false to remain clickable
        fileAnnotation.setNoView(false); // Must be false to remain clickable
        fileAnnotation.setPrinted(false);

        PDEmbeddedFilesNameTreeNode efTree =
                document.getDocumentCatalog().getNames().getEmbeddedFiles();
        if (efTree != null) {
            Map<String, PDComplexFileSpecification> efMap = efTree.getNames();
            if (efMap != null) {
                PDComplexFileSpecification fileSpec = efMap.get(attachment.getEmbeddedFilename());
                if (fileSpec != null) {
                    fileAnnotation.setFile(fileSpec);
                }
            }
        }

        fileAnnotation.setContents("Click to open: " + attachment.getFilename());
        fileAnnotation.setAnnotationName("EmbeddedFile_" + attachment.getEmbeddedFilename());

        page.getAnnotations().add(fileAnnotation);

        log.info(
                "Added attachment annotation for '{}' on page {}",
                attachment.getFilename(),
                document.getPages().indexOf(page) + 1);
    }

    private static @NotNull PDRectangle getPdRectangle(PDPage page, float x, float y) {
        PDRectangle mediaBox = page.getMediaBox();
        float pdfY = mediaBox.getHeight() - y;

        float iconWidth =
                StyleConstants.ATTACHMENT_ICON_WIDTH; // Keep original size for clickability
        float iconHeight =
                StyleConstants.ATTACHMENT_ICON_HEIGHT; // Keep original size for clickability

        // Keep the full-size rectangle so it remains clickable
        return new PDRectangle(
                x + StyleConstants.ANNOTATION_X_OFFSET,
                pdfY - iconHeight + StyleConstants.ANNOTATION_Y_OFFSET,
                iconWidth,
                iconHeight);
    }

    private static String formatEmailDate(Date date) {
        if (date == null) return "";
        java.text.SimpleDateFormat formatter =
                new java.text.SimpleDateFormat("EEE, MMM d, yyyy 'at' h:mm a", Locale.ENGLISH);
        return formatter.format(date);
    }

    private static String formatFileSize(long bytes) {
        if (bytes < FileSizeConstants.BYTES_IN_KB) {
            return bytes + " B";
        } else if (bytes < FileSizeConstants.BYTES_IN_MB) {
            return String.format("%.1f KB", bytes / (double) FileSizeConstants.BYTES_IN_KB);
        } else if (bytes < FileSizeConstants.BYTES_IN_GB) {
            return String.format("%.1f MB", bytes / (double) FileSizeConstants.BYTES_IN_MB);
        } else {
            return String.format("%.1f GB", bytes / (double) FileSizeConstants.BYTES_IN_GB);
        }
    }

    private static void setCatalogViewerPreferences(PDDocument document) {
        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            if (catalog != null) {
                // Get the catalog's COS dictionary to work with low-level PDF objects
                COSDictionary catalogDict = catalog.getCOSObject();

                // Set PageMode to UseAttachments - this is the standard PDF specification approach
                // PageMode values: UseNone, UseOutlines, UseThumbs, FullScreen, UseOC,
                // UseAttachments
                catalogDict.setName(COSName.PAGE_MODE, "UseAttachments");

                // Also set viewer preferences for better attachment viewing experience
                COSDictionary viewerPrefs =
                        (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);
                if (viewerPrefs == null) {
                    viewerPrefs = new COSDictionary();
                    catalogDict.setItem(COSName.VIEWER_PREFERENCES, viewerPrefs);
                }

                // Set NonFullScreenPageMode to UseAttachments as fallback for viewers that support
                // it
                viewerPrefs.setName(COSName.getPDFName("NonFullScreenPageMode"), "UseAttachments");

                // Additional viewer preferences that may help with attachment display
                viewerPrefs.setBoolean(COSName.getPDFName("DisplayDocTitle"), true);

                log.info(
                        "Set PDF PageMode to UseAttachments to automatically show attachments pane");
            }
        } catch (Exception e) {
            // Log warning but don't fail the entire operation for viewer preferences
            log.warn("Failed to set catalog viewer preferences for attachments", e);
        }
    }

    // MIME header decoding functionality for RFC 2047 encoded headers - moved to constants
    private static String decodeMimeHeader(String encodedText) {
        if (encodedText == null || encodedText.trim().isEmpty()) {
            return encodedText;
        }

        try {
            StringBuilder result = new StringBuilder();
            Matcher matcher = MimeConstants.MIME_ENCODED_PATTERN.matcher(encodedText);
            int lastEnd = 0;

            while (matcher.find()) {
                // Add any text before the encoded part
                result.append(encodedText, lastEnd, matcher.start());

                String charset = matcher.group(1);
                String encoding = matcher.group(2).toUpperCase();
                String encodedValue = matcher.group(3);

                try {
                    String decodedValue;
                    if ("B".equals(encoding)) {
                        // Base64 decoding
                        byte[] decodedBytes = Base64.getDecoder().decode(encodedValue);
                        decodedValue = new String(decodedBytes, Charset.forName(charset));
                    } else if ("Q".equals(encoding)) {
                        // Quoted-printable decoding
                        decodedValue = decodeQuotedPrintable(encodedValue, charset);
                    } else {
                        // Unknown encoding, keep original
                        decodedValue = matcher.group(0);
                    }
                    result.append(decodedValue);
                } catch (Exception e) {
                    log.warn("Failed to decode MIME header part: {}", matcher.group(0), e);
                    // If decoding fails, keep the original encoded text
                    result.append(matcher.group(0));
                }

                lastEnd = matcher.end();
            }

            // Add any remaining text after the last encoded part
            result.append(encodedText.substring(lastEnd));

            return result.toString();
        } catch (Exception e) {
            log.warn("Error decoding MIME header: {}", encodedText, e);
            return encodedText; // Return original if decoding fails
        }
    }

    private static String decodeQuotedPrintable(String encodedText, String charset) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < encodedText.length(); i++) {
            char c = encodedText.charAt(i);
            switch (c) {
                case '=' -> {
                    if (i + 2 < encodedText.length()) {
                        String hex = encodedText.substring(i + 1, i + 3);
                        try {
                            int value = Integer.parseInt(hex, 16);
                            result.append((char) value);
                            i += 2; // Skip the hex digits
                        } catch (NumberFormatException e) {
                            // If hex parsing fails, keep the original character
                            result.append(c);
                        }
                    } else {
                        result.append(c);
                    }
                }
                case '_' -> // In RFC 2047, underscore represents space
                        result.append(' ');
                default -> result.append(c);
            }
        }

        // Convert bytes to proper charset
        byte[] bytes = result.toString().getBytes(StandardCharsets.ISO_8859_1);
        return new String(bytes, Charset.forName(charset));
    }

    private static String safeMimeDecode(String headerValue) {
        if (headerValue == null) {
            return "";
        }

        try {
            return decodeMimeHeader(headerValue.trim());
        } catch (Exception e) {
            log.warn("Failed to decode MIME header, using original: {}", headerValue, e);
            return headerValue;
        }
    }

    @Data
    public static class EmailContent {
        private String subject;
        private String from;
        private String to;
        private Date date;
        private String htmlBody;
        private String textBody;
        private int attachmentCount;
        private List<EmailAttachment> attachments = new ArrayList<>();

        public void setHtmlBody(String htmlBody) {
            this.htmlBody = htmlBody != null ? htmlBody.replaceAll("\r", "") : null;
        }

        public void setTextBody(String textBody) {
            this.textBody = textBody != null ? textBody.replaceAll("\r", "") : null;
        }
    }

    @Data
    public static class EmailAttachment {
        private String filename;
        private String contentType;
        private byte[] data;
        private boolean embedded;
        private String embeddedFilename;
        private long sizeBytes;

        // New fields for advanced processing
        private String contentId;
        private String disposition;
        private String transferEncoding;

        // Custom setter to maintain size calculation logic
        public void setData(byte[] data) {
            this.data = data;
            if (data != null) {
                this.sizeBytes = data.length;
            }
        }
    }

    @Data
    public static class MarkerPosition {
        private int pageIndex;
        private float x;
        private float y;
        private String character;

        public MarkerPosition(int pageIndex, float x, float y, String character) {
            this.pageIndex = pageIndex;
            this.x = x;
            this.y = y;
            this.character = character;
        }
    }

    public static class AttachmentMarkerPositionFinder
            extends org.apache.pdfbox.text.PDFTextStripper {
        @Getter private final List<MarkerPosition> positions = new ArrayList<>();
        private int currentPageIndex;
        protected boolean sortByPosition;
        private boolean isInAttachmentSection;
        private boolean attachmentSectionFound;

        public AttachmentMarkerPositionFinder() {
            super();
            this.currentPageIndex = 0;
            this.sortByPosition = false;
            this.isInAttachmentSection = false;
            this.attachmentSectionFound = false;
        }

        @Override
        protected void startPage(org.apache.pdfbox.pdmodel.PDPage page) throws IOException {
            super.startPage(page);
        }

        @Override
        protected void endPage(org.apache.pdfbox.pdmodel.PDPage page) throws IOException {
            currentPageIndex++;
            super.endPage(page);
        }

        @Override
        protected void writeString(
                String string, List<org.apache.pdfbox.text.TextPosition> textPositions)
                throws IOException {
            // Check if we are entering or exiting the attachment section
            String lowerString = string.toLowerCase();

            // Look for attachment section start marker
            if (lowerString.contains("attachments (")) {
                isInAttachmentSection = true;
                attachmentSectionFound = true;
            }

            // Look for attachment section end markers (common patterns that indicate end of
            // attachments)
            if (isInAttachmentSection
                    && (lowerString.contains("</body>")
                            || lowerString.contains("</html>")
                            || (attachmentSectionFound
                                    && lowerString.trim().isEmpty()
                                    && string.length() > 50))) {
                isInAttachmentSection = false;
            }

            // Only look for markers if we are in the attachment section
            if (isInAttachmentSection) {
                String attachmentMarker = MimeConstants.ATTACHMENT_MARKER;
                for (int i = 0; (i = string.indexOf(attachmentMarker, i)) != -1; i++) {
                    if (i < textPositions.size()) {
                        org.apache.pdfbox.text.TextPosition textPosition = textPositions.get(i);
                        MarkerPosition position =
                                new MarkerPosition(
                                        currentPageIndex,
                                        textPosition.getXDirAdj(),
                                        textPosition.getYDirAdj(),
                                        attachmentMarker);
                        positions.add(position);
                    }
                }
            }
            super.writeString(string, textPositions);
        }

        @Override
        public void setSortByPosition(boolean sortByPosition) {
            this.sortByPosition = sortByPosition;
        }
    }
}

package stirling.software.common.util;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;

import lombok.Synchronized;
import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;

@Slf4j
@UtilityClass
public class EmlProcessingUtils {

    // Style constants
    private final int DEFAULT_FONT_SIZE = 12;
    private final String DEFAULT_FONT_FAMILY = "Helvetica, sans-serif";
    private final float DEFAULT_LINE_HEIGHT = 1.4f;
    private final String DEFAULT_ZOOM = "1.0";
    private final String DEFAULT_TEXT_COLOR = "#202124";
    private final String DEFAULT_BACKGROUND_COLOR = "#ffffff";
    private final String DEFAULT_BORDER_COLOR = "#e8eaed";
    private final String ATTACHMENT_BACKGROUND_COLOR = "#f9f9f9";
    private final String ATTACHMENT_BORDER_COLOR = "#eeeeee";

    private final String CSS_RESOURCE_PATH = "templates/email-pdf-styles.css";
    private final int EML_CHECK_LENGTH = 8192;
    private final int MIN_HEADER_COUNT_FOR_VALID_EML = 2;
    // MSG file magic bytes (Compound File Binary Format / OLE2)
    // D0 CF 11 E0 A1 B1 1A E1
    private final byte[] MSG_MAGIC_BYTES = {
        (byte) 0xD0, (byte) 0xCF, (byte) 0x11, (byte) 0xE0,
        (byte) 0xA1, (byte) 0xB1, (byte) 0x1A, (byte) 0xE1
    };
    private final Map<String, String> EXTENSION_TO_MIME_TYPE =
            Map.of(
                    ".png", MediaType.IMAGE_PNG_VALUE,
                    ".jpg", MediaType.IMAGE_JPEG_VALUE,
                    ".jpeg", MediaType.IMAGE_JPEG_VALUE,
                    ".gif", MediaType.IMAGE_GIF_VALUE,
                    ".bmp", "image/bmp",
                    ".webp", "image/webp",
                    ".svg", "image/svg+xml",
                    ".ico", "image/x-icon",
                    ".tiff", "image/tiff",
                    ".tif", "image/tiff");
    private volatile String cachedCssContent = null;

    public void validateEmlInput(byte[] emlBytes) {
        if (emlBytes == null || emlBytes.length == 0) {
            throw ExceptionUtils.createEmlEmptyException();
        }

        if (isMsgFile(emlBytes)) {
            return; // Valid MSG file, no further EML validation needed
        }

        if (isInvalidEmlFormat(emlBytes)) {
            throw ExceptionUtils.createEmlInvalidFormatException();
        }
    }

    public boolean isMsgFile(byte[] fileBytes) {
        if (fileBytes == null || fileBytes.length < MSG_MAGIC_BYTES.length) {
            return false;
        }

        for (int i = 0; i < MSG_MAGIC_BYTES.length; i++) {
            if (fileBytes[i] != MSG_MAGIC_BYTES[i]) {
                return false;
            }
        }
        return true;
    }

    private boolean isInvalidEmlFormat(byte[] emlBytes) {
        try {
            int checkLength = Math.min(emlBytes.length, EML_CHECK_LENGTH);
            String content;

            try {
                content = new String(emlBytes, 0, checkLength, StandardCharsets.UTF_8);
                if (content.contains("\uFFFD")) {
                    content = new String(emlBytes, 0, checkLength, StandardCharsets.ISO_8859_1);
                }
            } catch (Exception e) {
                content = new String(emlBytes, 0, checkLength, StandardCharsets.ISO_8859_1);
            }

            String lowerContent = content.toLowerCase(Locale.ROOT);

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
                            || lowerContent.contains(MediaType.TEXT_PLAIN_VALUE)
                            || lowerContent.contains(MediaType.TEXT_HTML_VALUE)
                            || lowerContent.contains("boundary=");

            int headerCount = 0;
            if (hasFrom) headerCount++;
            if (hasSubject) headerCount++;
            if (hasMessageId) headerCount++;
            if (hasDate) headerCount++;
            if (hasTo) headerCount++;

            return headerCount < MIN_HEADER_COUNT_FOR_VALID_EML && !hasMimeStructure;

        } catch (RuntimeException e) {
            return false;
        }
    }

    public String generateEnhancedEmailHtml(
            EmlParser.EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer) {
        StringBuilder html = new StringBuilder();

        html.append(
                String.format(
                        Locale.ROOT,
                        """
                        <!DOCTYPE html>
                        <html lang="en"><head><meta charset="UTF-8">
                        <title>%s</title>
                        <style>
                        """,
                        sanitizeText(content.getSubject(), customHtmlSanitizer)));

        appendEnhancedStyles(html);

        html.append(
                """
                </style>
                </head><body>
                """);

        html.append(
                String.format(
                        Locale.ROOT,
                        """
                        <div class="email-container">
                        <div class="email-header">
                        <h1>%s</h1>
                        <div class="email-meta">
                        <div><strong>From:</strong> %s</div>
                        <div><strong>To:</strong> %s</div>
                        """,
                        sanitizeText(content.getSubject(), customHtmlSanitizer),
                        sanitizeText(content.getFrom(), customHtmlSanitizer),
                        sanitizeText(content.getTo(), customHtmlSanitizer)));

        if (content.getCc() != null && !content.getCc().trim().isEmpty()) {
            html.append(
                    String.format(
                            Locale.ROOT,
                            "<div><strong>CC:</strong> %s</div>%n",
                            sanitizeText(content.getCc(), customHtmlSanitizer)));
        }

        if (content.getBcc() != null && !content.getBcc().trim().isEmpty()) {
            html.append(
                    String.format(
                            Locale.ROOT,
                            "<div><strong>BCC:</strong> %s</div>%n",
                            sanitizeText(content.getBcc(), customHtmlSanitizer)));
        }

        if (content.getDate() != null) {
            html.append(
                    String.format(
                            Locale.ROOT,
                            "<div><strong>Date:</strong> %s</div>%n",
                            PdfAttachmentHandler.formatEmailDate(content.getDate())));
        } else if (content.getDateString() != null && !content.getDateString().trim().isEmpty()) {
            html.append(
                    String.format(
                            Locale.ROOT,
                            "<div><strong>Date:</strong> %s</div>%n",
                            sanitizeText(content.getDateString(), customHtmlSanitizer)));
        }

        html.append(String.format(Locale.ROOT, "</div></div>%n"));

        html.append(String.format(Locale.ROOT, "<div class=\"email-body\">%n"));
        if (content.getHtmlBody() != null && !content.getHtmlBody().trim().isEmpty()) {
            String processedHtml =
                    processEmailHtmlBody(content.getHtmlBody(), content, customHtmlSanitizer);
            html.append(processedHtml);
        } else if (content.getTextBody() != null && !content.getTextBody().trim().isEmpty()) {
            html.append(
                    String.format(
                            Locale.ROOT,
                            "<div class=\"text-body\">%s</div>",
                            convertTextToHtml(content.getTextBody(), customHtmlSanitizer)));
        } else {
            html.append("<div class=\"no-content\"><p><em>No content available</em></p></div>");
        }
        html.append(String.format(Locale.ROOT, "</div>%n"));

        if (content.getAttachmentCount() > 0 || !content.getAttachments().isEmpty()) {
            appendAttachmentsSection(html, content, request);
        }

        html.append(String.format(Locale.ROOT, "</div>%n</body></html>"));
        return html.toString();
    }

    public String processEmailHtmlBody(
            String htmlBody,
            EmlParser.EmailContent emailContent,
            CustomHtmlSanitizer customHtmlSanitizer) {
        if (htmlBody == null) return "";

        String processed =
                customHtmlSanitizer != null ? customHtmlSanitizer.sanitize(htmlBody) : htmlBody;

        processed =
                RegexPatternUtils.getInstance()
                        .getFixedPositionCssPattern()
                        .matcher(processed)
                        .replaceAll("");
        processed =
                RegexPatternUtils.getInstance()
                        .getAbsolutePositionCssPattern()
                        .matcher(processed)
                        .replaceAll("");

        if (emailContent != null && !emailContent.getAttachments().isEmpty()) {
            processed = PdfAttachmentHandler.processInlineImages(processed, emailContent);
        }

        return processed;
    }

    public String convertTextToHtml(String textBody, CustomHtmlSanitizer customHtmlSanitizer) {
        if (textBody == null) return "";

        String html =
                customHtmlSanitizer != null
                        ? customHtmlSanitizer.sanitize(textBody)
                        : escapeHtml(textBody);

        html = html.replace("\r\n", "\n").replace("\r", "\n");
        html = html.replace("\n", "<br>\n");

        html =
                RegexPatternUtils.getInstance()
                        .getUrlLinkPattern()
                        .matcher(html)
                        .replaceAll(
                                "<a href=\"$1\" style=\"color: #1a73e8; text-decoration:"
                                        + " underline;\">$1</a>");

        html =
                RegexPatternUtils.getInstance()
                        .getEmailLinkPattern()
                        .matcher(html)
                        .replaceAll(
                                "<a href=\"mailto:$1\" style=\"color: #1a73e8; text-decoration:"
                                        + " underline;\">$1</a>");

        return html;
    }

    private void appendEnhancedStyles(StringBuilder html) {
        html.append(
                String.format(
                        Locale.ROOT,
                        """
                        :root {
                          --font-family: %s;
                          --font-size: %dpx;
                          --line-height: %s;
                          --text-color: %s;
                          --bg-color: %s;
                          --border-color: %s;
                          --header-font-size: %dpx;
                          --meta-font-size: %dpx;
                          --attachment-bg: %s;
                          --attachment-border: %s;
                          --attachment-header-size: %dpx;
                          --attachment-detail-size: %dpx;
                          --note-font-size: %dpx;
                        }
                        """,
                        DEFAULT_FONT_FAMILY,
                        DEFAULT_FONT_SIZE,
                        DEFAULT_LINE_HEIGHT,
                        DEFAULT_TEXT_COLOR,
                        DEFAULT_BACKGROUND_COLOR,
                        DEFAULT_BORDER_COLOR,
                        DEFAULT_FONT_SIZE + 6,
                        DEFAULT_FONT_SIZE,
                        ATTACHMENT_BACKGROUND_COLOR,
                        ATTACHMENT_BORDER_COLOR,
                        DEFAULT_FONT_SIZE + 2,
                        DEFAULT_FONT_SIZE - 1,
                        DEFAULT_FONT_SIZE - 1));

        html.append(loadEmailStyles());
    }

    @Synchronized
    private String loadEmailStyles() {
        if (cachedCssContent != null) {
            return cachedCssContent;
        }

        try {
            ClassPathResource resource = new ClassPathResource(CSS_RESOURCE_PATH);
            try (InputStream inputStream = resource.getInputStream()) {
                cachedCssContent = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
                return cachedCssContent;
            }
        } catch (IOException e) {
            log.warn("Failed to load email CSS from resource, using fallback: {}", e.getMessage());
            cachedCssContent = getFallbackStyles(); // Cache fallback to avoid repeated attempts
            return cachedCssContent;
        }
    }

    private String getFallbackStyles() {
        return """
            /* Minimal fallback - main CSS resource failed to load */
            body {
                font-family: var(--font-family, Helvetica, sans-serif);
                font-size: var(--font-size, 12px);
                line-height: var(--line-height, 1.4);
                color: var(--text-color, #202124);
                margin: 0;
                padding: 20px;
                word-wrap: break-word;
            }
            .email-container { max-width: 100%; }
            .email-header { border-bottom: 1px solid #ccc; margin-bottom: 16px; padding-bottom: 12px; }
            .email-header h1 { margin: 0 0 8px 0; font-size: 18px; }
            .email-meta { font-size: 12px; color: #666; }
            .email-body { line-height: 1.6; }
            .attachment-section { margin-top: 20px; padding: 12px; background: #f5f5f5; border-radius: 4px; }
            .attachment-item { padding: 6px 0; border-bottom: 1px solid #ddd; }
            .no-content { padding: 20px; text-align: center; color: #888; font-style: italic; }
            img { max-width: 100%; height: auto; }
            """;
    }

    private void appendAttachmentsSection(
            StringBuilder html, EmlParser.EmailContent content, EmlToPdfRequest request) {
        html.append(String.format(Locale.ROOT, "<div class=\"attachment-section\">%n"));
        int displayedAttachmentCount =
                content.getAttachmentCount() > 0
                        ? content.getAttachmentCount()
                        : content.getAttachments().size();
        html.append(
                String.format(
                        Locale.ROOT, "<h3>Attachments (%d)</h3>%n", displayedAttachmentCount));

        if (!content.getAttachments().isEmpty()) {
            for (int i = 0; i < content.getAttachments().size(); i++) {
                EmlParser.EmailAttachment attachment = content.getAttachments().get(i);

                String embeddedFilename =
                        attachment.getFilename() != null
                                ? attachment.getFilename()
                                : ("attachment_" + i);
                attachment.setEmbeddedFilename(embeddedFilename);

                String sizeStr = GeneralUtils.formatBytes(attachment.getSizeBytes());
                String contentType =
                        attachment.getContentType() != null
                                        && !attachment.getContentType().isEmpty()
                                ? ", " + escapeHtml(attachment.getContentType())
                                : "";

                String attachmentId = "attachment_" + i;
                html.append(
                        String.format(
                                Locale.ROOT,
                                """
                                <div class="attachment-item" id="%s">
                                <span class="attachment-icon" data-filename="%s">@</span>
                                <span class="attachment-name">%s</span>
                                <span class="attachment-details">(%s%s)</span>
                                </div>
                                """,
                                attachmentId,
                                escapeHtml(embeddedFilename),
                                escapeHtml(EmlParser.safeMimeDecode(attachment.getFilename())),
                                sizeStr,
                                contentType));
            }
        }

        if (request != null && request.isIncludeAttachments()) {
            html.append(
                    """
                    <div class="attachment-info-note">
                    <p><em>Attachments are embedded in the file.</em></p>
                    </div>
                    """);
        } else {
            html.append(
                    """
                    <div class="attachment-info-note">
                    <p><em>Attachment information displayed - files not included in PDF.</em></p>
                    </div>
                    """);
        }
        html.append(String.format(Locale.ROOT, "</div>%n"));
    }

    public HTMLToPdfRequest createHtmlRequest(EmlToPdfRequest request) {
        HTMLToPdfRequest htmlRequest = new HTMLToPdfRequest();

        if (request != null) {
            htmlRequest.setFileInput(request.getFileInput());
        }

        htmlRequest.setZoom(Float.parseFloat(DEFAULT_ZOOM));
        return htmlRequest;
    }

    public String detectMimeType(String filename, String existingMimeType) {
        if (existingMimeType != null && !existingMimeType.isEmpty()) {
            return existingMimeType;
        }

        if (filename != null) {
            String lowerFilename = filename.toLowerCase(Locale.ROOT);
            for (Map.Entry<String, String> entry : EXTENSION_TO_MIME_TYPE.entrySet()) {
                if (lowerFilename.endsWith(entry.getKey())) {
                    return entry.getValue();
                }
            }
        }

        return MediaType.IMAGE_PNG_VALUE; // Default MIME type
    }

    public String decodeUrlEncoded(String encoded) {
        try {
            return java.net.URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return encoded; // Return original if decoding fails
        }
    }

    public String decodeMimeHeader(String encodedText) {
        if (encodedText == null || encodedText.trim().isEmpty()) {
            return encodedText;
        }

        try {
            StringBuilder result = new StringBuilder();
            Pattern concatenatedPattern =
                    Pattern.compile(
                            "(=\\?[^?]+\\?[BbQq]\\?[^?]*\\?=)(\\s*=\\?[^?]+\\?[BbQq]\\?[^?]*\\?=)+");
            Matcher concatenatedMatcher = concatenatedPattern.matcher(encodedText);
            String processedText =
                    concatenatedMatcher.replaceAll(
                            match ->
                                    RegexPatternUtils.getInstance()
                                            .getMimeHeaderWhitespacePattern()
                                            .matcher(match.group())
                                            .replaceAll(""));

            Pattern mimePattern = RegexPatternUtils.getInstance().getMimeEncodedWordPattern();
            Matcher matcher = mimePattern.matcher(processedText);
            int lastEnd = 0;

            while (matcher.find()) {
                result.append(processedText, lastEnd, matcher.start());

                String charset = matcher.group(1);
                String encoding = matcher.group(2).toUpperCase(Locale.ROOT);
                String encodedValue = matcher.group(3);

                try {
                    String decodedValue =
                            switch (encoding) {
                                case "B" -> {
                                    String cleanBase64 =
                                            RegexPatternUtils.getInstance()
                                                    .getWhitespacePattern()
                                                    .matcher(encodedValue)
                                                    .replaceAll("");
                                    byte[] decodedBytes = Base64.getDecoder().decode(cleanBase64);
                                    Charset targetCharset;
                                    try {
                                        targetCharset = Charset.forName(charset);
                                    } catch (Exception e) {
                                        targetCharset = StandardCharsets.UTF_8;
                                    }
                                    yield new String(decodedBytes, targetCharset);
                                }
                                case "Q" -> decodeQuotedPrintable(encodedValue, charset);
                                default -> matcher.group(0); // Return original if unknown encoding
                            };
                    result.append(decodedValue);
                } catch (RuntimeException e) {
                    result.append(matcher.group(0)); // Keep original on decode error
                }

                lastEnd = matcher.end();
            }

            result.append(processedText.substring(lastEnd));
            return result.toString();
        } catch (Exception e) {
            return encodedText; // Return original on any parsing error
        }
    }

    private String decodeQuotedPrintable(String encodedText, String charset) {
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
                            i += 2;
                        } catch (NumberFormatException e) {
                            result.append(c);
                        }
                    } else if (i + 1 == encodedText.length()
                            || (i + 2 == encodedText.length()
                                    && encodedText.charAt(i + 1) == '\n')) {
                        if (i + 1 < encodedText.length() && encodedText.charAt(i + 1) == '\n') {
                            i++; // Skip the newline too
                        }
                    } else {
                        result.append(c);
                    }
                }
                case '_' -> result.append(' '); // Space encoding in Q encoding
                default -> result.append(c);
            }
        }

        byte[] bytes = result.toString().getBytes(StandardCharsets.ISO_8859_1);
        try {
            Charset targetCharset = Charset.forName(charset);
            return new String(bytes, targetCharset);
        } catch (Exception e) {
            try {
                return new String(bytes, StandardCharsets.UTF_8);
            } catch (Exception fallbackException) {
                return new String(bytes, StandardCharsets.ISO_8859_1);
            }
        }
    }

    public String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    public String sanitizeText(String text, CustomHtmlSanitizer customHtmlSanitizer) {
        if (customHtmlSanitizer != null) {
            return customHtmlSanitizer.sanitize(text);
        } else {
            return escapeHtml(text);
        }
    }

    public String simplifyHtmlContent(String htmlContent) {
        String simplified =
                RegexPatternUtils.getInstance()
                        .getScriptTagPattern()
                        .matcher(htmlContent)
                        .replaceAll("");
        simplified =
                RegexPatternUtils.getInstance()
                        .getStyleTagPattern()
                        .matcher(simplified)
                        .replaceAll("");
        return simplified;
    }
}

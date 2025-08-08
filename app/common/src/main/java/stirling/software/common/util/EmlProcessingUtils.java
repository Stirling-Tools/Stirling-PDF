package stirling.software.common.util;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.experimental.UtilityClass;

import stirling.software.common.model.api.converters.EmlToPdfRequest;
import stirling.software.common.model.api.converters.HTMLToPdfRequest;

@UtilityClass
public class EmlProcessingUtils {

    // Style constants
    private static final int DEFAULT_FONT_SIZE = 12;
    private static final String DEFAULT_FONT_FAMILY = "Helvetica, sans-serif";
    private static final float DEFAULT_LINE_HEIGHT = 1.4f;
    private static final String DEFAULT_ZOOM = "1.0";
    private static final String DEFAULT_TEXT_COLOR = "#202124";
    private static final String DEFAULT_BACKGROUND_COLOR = "#ffffff";
    private static final String DEFAULT_BORDER_COLOR = "#e8eaed";
    private static final String ATTACHMENT_BACKGROUND_COLOR = "#f9f9f9";
    private static final String ATTACHMENT_BORDER_COLOR = "#eeeeee";

    private static final int EML_CHECK_LENGTH = 8192;
    private static final int MIN_HEADER_COUNT_FOR_VALID_EML = 2;

    // MIME type detection
    private static final Map<String, String> EXTENSION_TO_MIME_TYPE =
            Map.of(
                    ".png", "image/png",
                    ".jpg", "image/jpeg",
                    ".jpeg", "image/jpeg",
                    ".gif", "image/gif",
                    ".bmp", "image/bmp",
                    ".webp", "image/webp",
                    ".svg", "image/svg+xml",
                    ".ico", "image/x-icon",
                    ".tiff", "image/tiff",
                    ".tif", "image/tiff");

    public static void validateEmlInput(byte[] emlBytes) {
        if (emlBytes == null || emlBytes.length == 0) {
            throw new IllegalArgumentException("EML file is empty or null");
        }

        if (isInvalidEmlFormat(emlBytes)) {
            throw new IllegalArgumentException("Invalid EML file format");
        }
    }

    private static boolean isInvalidEmlFormat(byte[] emlBytes) {
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
                            || lowerContent.contains("text/plain")
                            || lowerContent.contains("text/html")
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

    public static String generateEnhancedEmailHtml(
            EmlParser.EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer) {
        StringBuilder html = new StringBuilder();

        html.append(
                String.format(
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
                            "<div><strong>CC:</strong> %s</div>\n",
                            sanitizeText(content.getCc(), customHtmlSanitizer)));
        }

        if (content.getBcc() != null && !content.getBcc().trim().isEmpty()) {
            html.append(
                    String.format(
                            "<div><strong>BCC:</strong> %s</div>\n",
                            sanitizeText(content.getBcc(), customHtmlSanitizer)));
        }

        if (content.getDate() != null) {
            html.append(
                    String.format(
                            "<div><strong>Date:</strong> %s</div>\n",
                            PdfAttachmentHandler.formatEmailDate(content.getDate())));
        } else if (content.getDateString() != null && !content.getDateString().trim().isEmpty()) {
            html.append(
                    String.format(
                            "<div><strong>Date:</strong> %s</div>\n",
                            sanitizeText(content.getDateString(), customHtmlSanitizer)));
        }

        html.append("</div></div>\n");

        html.append("<div class=\"email-body\">\n");
        if (content.getHtmlBody() != null && !content.getHtmlBody().trim().isEmpty()) {
            String processedHtml =
                    processEmailHtmlBody(content.getHtmlBody(), content, customHtmlSanitizer);
            html.append(processedHtml);
        } else if (content.getTextBody() != null && !content.getTextBody().trim().isEmpty()) {
            html.append(
                    String.format(
                            "<div class=\"text-body\">%s</div>",
                            convertTextToHtml(content.getTextBody(), customHtmlSanitizer)));
        } else {
            html.append("<div class=\"no-content\"><p><em>No content available</em></p></div>");
        }
        html.append("</div>\n");

        if (content.getAttachmentCount() > 0 || !content.getAttachments().isEmpty()) {
            appendAttachmentsSection(html, content, request, customHtmlSanitizer);
        }

        html.append("</div>\n</body></html>");
        return html.toString();
    }

    public static String processEmailHtmlBody(
            String htmlBody,
            EmlParser.EmailContent emailContent,
            CustomHtmlSanitizer customHtmlSanitizer) {
        if (htmlBody == null) return "";

        String processed =
                customHtmlSanitizer != null ? customHtmlSanitizer.sanitize(htmlBody) : htmlBody;

        processed = processed.replaceAll("(?i)\\s*position\\s*:\\s*fixed[^;]*;?", "");
        processed = processed.replaceAll("(?i)\\s*position\\s*:\\s*absolute[^;]*;?", "");

        if (emailContent != null && !emailContent.getAttachments().isEmpty()) {
            processed = PdfAttachmentHandler.processInlineImages(processed, emailContent);
        }

        return processed;
    }

    public static String convertTextToHtml(
            String textBody, CustomHtmlSanitizer customHtmlSanitizer) {
        if (textBody == null) return "";

        String html =
                customHtmlSanitizer != null
                        ? customHtmlSanitizer.sanitize(textBody)
                        : escapeHtml(textBody);

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

    private static void appendEnhancedStyles(StringBuilder html) {
        String css =
                String.format(
                        """
                body {
                  font-family: %s;
                  font-size: %dpx;
                  line-height: %s;
                  color: %s;
                  margin: 0;
                  padding: 16px;
                  background-color: %s;
                }

                .email-container {
                  width: 100%%;
                  max-width: 100%%;
                  margin: 0 auto;
                }

                .email-header {
                  padding-bottom: 10px;
                  border-bottom: 1px solid %s;
                  margin-bottom: 10px;
                }

                .email-header h1 {
                  margin: 0 0 10px 0;
                  font-size: %dpx;
                  font-weight: bold;
                }

                .email-meta div {
                  margin-bottom: 2px;
                  font-size: %dpx;
                }

                .email-body {
                  word-wrap: break-word;
                }

                .attachment-section {
                  margin-top: 15px;
                  padding: 10px;
                  background-color: %s;
                  border: 1px solid %s;
                  border-radius: 3px;
                }

                .attachment-section h3 {
                  margin: 0 0 8px 0;
                  font-size: %dpx;
                }

                .attachment-item {
                  padding: 5px 0;
                }

                .attachment-icon {
                  margin-right: 5px;
                }

                .attachment-details, .attachment-type {
                  font-size: %dpx;
                  color: #555555;
                }

                .attachment-inclusion-note, .attachment-info-note {
                  margin-top: 8px;
                  padding: 6px;
                  font-size: %dpx;
                  border-radius: 3px;
                }

                .attachment-inclusion-note {
                  background-color: #e6ffed;
                  border: 1px solid #d4f7dc;
                  color: #006420;
                }

                .attachment-info-note {
                  background-color: #fff9e6;
                  border: 1px solid #fff0c2;
                  color: #664d00;
                }

                .attachment-link-container {
                  display: flex;
                  align-items: center;
                  padding: 8px;
                  background-color: #f8f9fa;
                  border: 1px solid #dee2e6;
                  border-radius: 4px;
                  margin: 4px 0;
                }

                .attachment-link-container:hover {
                  background-color: #e9ecef;
                }

                .attachment-note {
                  font-size: %dpx;
                  color: #6c757d;
                  font-style: italic;
                  margin-left: 8px;
                }

                .no-content {
                  padding: 20px;
                  text-align: center;
                  color: #666;
                  font-style: italic;
                }

                .text-body {
                  white-space: pre-wrap;
                }

                img {
                  max-width: 100%%;
                  height: auto;
                  display: block;
                }
                """,
                        DEFAULT_FONT_FAMILY,
                        DEFAULT_FONT_SIZE,
                        DEFAULT_LINE_HEIGHT,
                        DEFAULT_TEXT_COLOR,
                        DEFAULT_BACKGROUND_COLOR,
                        DEFAULT_BORDER_COLOR,
                        DEFAULT_FONT_SIZE + 4,
                        DEFAULT_FONT_SIZE - 1,
                        ATTACHMENT_BACKGROUND_COLOR,
                        ATTACHMENT_BORDER_COLOR,
                        DEFAULT_FONT_SIZE + 1,
                        DEFAULT_FONT_SIZE - 2,
                        DEFAULT_FONT_SIZE - 2,
                        DEFAULT_FONT_SIZE - 3);

        html.append(css);
    }

    private static void appendAttachmentsSection(
            StringBuilder html,
            EmlParser.EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer) {
        html.append("<div class=\"attachment-section\">\n");
        int displayedAttachmentCount =
                content.getAttachmentCount() > 0
                        ? content.getAttachmentCount()
                        : content.getAttachments().size();
        html.append("<h3>Attachments (").append(displayedAttachmentCount).append(")</h3>\n");

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
        html.append("</div>\n");
    }

    public static HTMLToPdfRequest createHtmlRequest(EmlToPdfRequest request) {
        HTMLToPdfRequest htmlRequest = new HTMLToPdfRequest();

        if (request != null) {
            htmlRequest.setFileInput(request.getFileInput());
        }

        htmlRequest.setZoom(Float.parseFloat(DEFAULT_ZOOM));
        return htmlRequest;
    }

    public static String detectMimeType(String filename, String existingMimeType) {
        if (existingMimeType != null && !existingMimeType.isEmpty()) {
            return existingMimeType;
        }

        if (filename != null) {
            String lowerFilename = filename.toLowerCase();
            for (Map.Entry<String, String> entry : EXTENSION_TO_MIME_TYPE.entrySet()) {
                if (lowerFilename.endsWith(entry.getKey())) {
                    return entry.getValue();
                }
            }
        }

        return "image/png";
    }

    public static String decodeUrlEncoded(String encoded) {
        try {
            return java.net.URLDecoder.decode(encoded, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return encoded; // Return original if decoding fails
        }
    }

    public static String decodeMimeHeader(String encodedText) {
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
                            match -> match.group().replaceAll("\\s+(?==\\?)", ""));

            Pattern mimePattern = Pattern.compile("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=");
            Matcher matcher = mimePattern.matcher(processedText);
            int lastEnd = 0;

            while (matcher.find()) {
                result.append(processedText, lastEnd, matcher.start());

                String charset = matcher.group(1);
                String encoding = matcher.group(2).toUpperCase();
                String encodedValue = matcher.group(3);

                try {
                    String decodedValue =
                            switch (encoding) {
                                case "B" -> {
                                    String cleanBase64 = encodedValue.replaceAll("\\s", "");
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

    public static String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    public static String sanitizeText(String text, CustomHtmlSanitizer customHtmlSanitizer) {
        if (customHtmlSanitizer != null) {
            return customHtmlSanitizer.sanitize(text);
        } else {
            return escapeHtml(text);
        }
    }

    public static String simplifyHtmlContent(String htmlContent) {
        String simplified = htmlContent.replaceAll("(?i)<script[^>]*>.*?</script>", "");
        simplified = simplified.replaceAll("(?i)<style[^>]*>.*?</style>", "");
        return simplified;
    }
}

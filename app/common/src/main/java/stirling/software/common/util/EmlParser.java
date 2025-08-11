package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Properties;
import java.util.regex.Pattern;

import lombok.Data;
import lombok.experimental.UtilityClass;

import stirling.software.common.model.api.converters.EmlToPdfRequest;

@UtilityClass
public class EmlParser {

    private static volatile Boolean jakartaMailAvailable = null;
    private static volatile Method mimeUtilityDecodeTextMethod = null;
    private static volatile boolean mimeUtilityChecked = false;

    private static final Pattern MIME_ENCODED_PATTERN =
            Pattern.compile("=\\?([^?]+)\\?([BbQq])\\?([^?]*)\\?=");

    private static final String DISPOSITION_ATTACHMENT = "attachment";
    private static final String TEXT_PLAIN = "text/plain";
    private static final String TEXT_HTML = "text/html";
    private static final String MULTIPART_PREFIX = "multipart/";

    private static final String HEADER_CONTENT_TYPE = "content-type:";
    private static final String HEADER_CONTENT_DISPOSITION = "content-disposition:";
    private static final String HEADER_CONTENT_TRANSFER_ENCODING = "content-transfer-encoding:";
    private static final String HEADER_CONTENT_ID = "Content-ID";
    private static final String HEADER_SUBJECT = "Subject:";
    private static final String HEADER_FROM = "From:";
    private static final String HEADER_TO = "To:";
    private static final String HEADER_CC = "Cc:";
    private static final String HEADER_BCC = "Bcc:";
    private static final String HEADER_DATE = "Date:";

    private static synchronized boolean isJakartaMailAvailable() {
        if (jakartaMailAvailable == null) {
            try {
                Class.forName("jakarta.mail.internet.MimeMessage");
                Class.forName("jakarta.mail.Session");
                Class.forName("jakarta.mail.internet.MimeUtility");
                Class.forName("jakarta.mail.internet.MimePart");
                Class.forName("jakarta.mail.internet.MimeMultipart");
                Class.forName("jakarta.mail.Multipart");
                Class.forName("jakarta.mail.Part");
                jakartaMailAvailable = true;
            } catch (ClassNotFoundException e) {
                jakartaMailAvailable = false;
            }
        }
        return jakartaMailAvailable;
    }

    public static EmailContent extractEmailContent(
            byte[] emlBytes, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer)
            throws IOException {
        EmlProcessingUtils.validateEmlInput(emlBytes);

        if (isJakartaMailAvailable()) {
            return extractEmailContentAdvanced(emlBytes, request, customHtmlSanitizer);
        } else {
            return extractEmailContentBasic(emlBytes, request, customHtmlSanitizer);
        }
    }

    private static EmailContent extractEmailContentBasic(
            byte[] emlBytes, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer) {
        String emlContent = new String(emlBytes, StandardCharsets.UTF_8);
        EmailContent content = new EmailContent();

        content.setSubject(extractBasicHeader(emlContent, HEADER_SUBJECT));
        content.setFrom(extractBasicHeader(emlContent, HEADER_FROM));
        content.setTo(extractBasicHeader(emlContent, HEADER_TO));
        content.setCc(extractBasicHeader(emlContent, HEADER_CC));
        content.setBcc(extractBasicHeader(emlContent, HEADER_BCC));

        String dateStr = extractBasicHeader(emlContent, HEADER_DATE);
        if (!dateStr.isEmpty()) {
            content.setDateString(dateStr);
        }

        String htmlBody = extractHtmlBody(emlContent);
        if (htmlBody != null) {
            content.setHtmlBody(htmlBody);
        } else {
            String textBody = extractTextBody(emlContent);
            content.setTextBody(textBody != null ? textBody : "Email content could not be parsed");
        }

        content.getAttachments().addAll(extractAttachmentsBasic(emlContent));

        return content;
    }

    private static EmailContent extractEmailContentAdvanced(
            byte[] emlBytes, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer) {
        try {
            Class<?> sessionClass = Class.forName("jakarta.mail.Session");
            Class<?> mimeMessageClass = Class.forName("jakarta.mail.internet.MimeMessage");

            Method getDefaultInstance =
                    sessionClass.getMethod("getDefaultInstance", Properties.class);
            Object session = getDefaultInstance.invoke(null, new Properties());

            Class<?>[] constructorArgs = new Class<?>[] {sessionClass, InputStream.class};
            Constructor<?> mimeMessageConstructor =
                    mimeMessageClass.getConstructor(constructorArgs);
            Object message =
                    mimeMessageConstructor.newInstance(session, new ByteArrayInputStream(emlBytes));

            return extractFromMimeMessage(message, request, customHtmlSanitizer);

        } catch (ReflectiveOperationException e) {
            return extractEmailContentBasic(emlBytes, request, customHtmlSanitizer);
        }
    }

    private static EmailContent extractFromMimeMessage(
            Object message, EmlToPdfRequest request, CustomHtmlSanitizer customHtmlSanitizer) {
        EmailContent content = new EmailContent();

        try {
            Class<?> messageClass = message.getClass();

            Method getSubject = messageClass.getMethod("getSubject");
            String subject = (String) getSubject.invoke(message);
            content.setSubject(subject != null ? safeMimeDecode(subject) : "No Subject");

            Method getFrom = messageClass.getMethod("getFrom");
            Object[] fromAddresses = (Object[]) getFrom.invoke(message);
            content.setFrom(buildAddressString(fromAddresses));

            extractRecipients(message, messageClass, content);

            Method getSentDate = messageClass.getMethod("getSentDate");
            content.setDate((Date) getSentDate.invoke(message));

            Method getContent = messageClass.getMethod("getContent");
            Object messageContent = getContent.invoke(message);

            processMessageContent(message, messageContent, content, request, customHtmlSanitizer);

        } catch (ReflectiveOperationException | RuntimeException e) {
            content.setSubject("Email Conversion");
            content.setFrom("Unknown");
            content.setTo("Unknown");
            content.setCc("");
            content.setBcc("");
            content.setTextBody("Email content could not be parsed with advanced processing");
        }

        return content;
    }

    private static void extractRecipients(
            Object message, Class<?> messageClass, EmailContent content) {
        try {
            Method getRecipients =
                    messageClass.getMethod(
                            "getRecipients", Class.forName("jakarta.mail.Message$RecipientType"));
            Class<?> recipientTypeClass = Class.forName("jakarta.mail.Message$RecipientType");

            Object toType = recipientTypeClass.getField("TO").get(null);
            Object[] toRecipients = (Object[]) getRecipients.invoke(message, toType);
            content.setTo(buildAddressString(toRecipients));

            Object ccType = recipientTypeClass.getField("CC").get(null);
            Object[] ccRecipients = (Object[]) getRecipients.invoke(message, ccType);
            content.setCc(buildAddressString(ccRecipients));

            Object bccType = recipientTypeClass.getField("BCC").get(null);
            Object[] bccRecipients = (Object[]) getRecipients.invoke(message, bccType);
            content.setBcc(buildAddressString(bccRecipients));

        } catch (ReflectiveOperationException e) {
            try {
                Method getAllRecipients = messageClass.getMethod("getAllRecipients");
                Object[] recipients = (Object[]) getAllRecipients.invoke(message);
                content.setTo(buildAddressString(recipients));
                content.setCc("");
                content.setBcc("");
            } catch (ReflectiveOperationException ex) {
                content.setTo("");
                content.setCc("");
                content.setBcc("");
            }
        }
    }

    private static String buildAddressString(Object[] addresses) {
        if (addresses == null || addresses.length == 0) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < addresses.length; i++) {
            if (i > 0) builder.append(", ");
            builder.append(safeMimeDecode(addresses[i].toString()));
        }
        return builder.toString();
    }

    private static void processMessageContent(
            Object message,
            Object messageContent,
            EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer) {
        try {
            if (messageContent instanceof String stringContent) {
                Method getContentType = message.getClass().getMethod("getContentType");
                String contentType = (String) getContentType.invoke(message);

                if (contentType != null && contentType.toLowerCase().contains(TEXT_HTML)) {
                    content.setHtmlBody(stringContent);
                } else {
                    content.setTextBody(stringContent);
                }
            } else {
                Class<?> multipartClass = Class.forName("jakarta.mail.Multipart");
                if (multipartClass.isInstance(messageContent)) {
                    processMultipart(messageContent, content, request, customHtmlSanitizer, 0);
                }
            }
        } catch (ReflectiveOperationException | ClassCastException e) {
            content.setTextBody("Email content could not be parsed with advanced processing");
        }
    }

    private static void processMultipart(
            Object multipart,
            EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer,
            int depth) {

        final int MAX_MULTIPART_DEPTH = 10;
        if (depth > MAX_MULTIPART_DEPTH) {
            content.setHtmlBody("<div class=\"error\">Maximum multipart depth exceeded</div>");
            return;
        }

        try {
            Class<?> multipartClass = multipart.getClass();
            Method getCount = multipartClass.getMethod("getCount");
            int count = (Integer) getCount.invoke(multipart);

            Method getBodyPart = multipartClass.getMethod("getBodyPart", int.class);

            for (int i = 0; i < count; i++) {
                Object part = getBodyPart.invoke(multipart, i);
                processPart(part, content, request, customHtmlSanitizer, depth + 1);
            }

        } catch (ReflectiveOperationException | ClassCastException e) {
            content.setHtmlBody("<div class=\"error\">Error processing multipart content</div>");
        }
    }

    private static void processPart(
            Object part,
            EmailContent content,
            EmlToPdfRequest request,
            CustomHtmlSanitizer customHtmlSanitizer,
            int depth) {
        try {
            Class<?> partClass = part.getClass();

            Method isMimeType = partClass.getMethod("isMimeType", String.class);
            Method getContent = partClass.getMethod("getContent");
            Method getDisposition = partClass.getMethod("getDisposition");
            Method getFileName = partClass.getMethod("getFileName");
            Method getContentType = partClass.getMethod("getContentType");
            Method getHeader = partClass.getMethod("getHeader", String.class);

            Object disposition = getDisposition.invoke(part);
            String filename = (String) getFileName.invoke(part);
            String contentType = (String) getContentType.invoke(part);

            String normalizedDisposition =
                    disposition != null ? ((String) disposition).toLowerCase() : null;

            if ((Boolean) isMimeType.invoke(part, TEXT_PLAIN) && normalizedDisposition == null) {
                Object partContent = getContent.invoke(part);
                if (partContent instanceof String stringContent) {
                    content.setTextBody(stringContent);
                }
            } else if ((Boolean) isMimeType.invoke(part, TEXT_HTML)
                    && normalizedDisposition == null) {
                Object partContent = getContent.invoke(part);
                if (partContent instanceof String stringContent) {
                    String htmlBody =
                            customHtmlSanitizer != null
                                    ? customHtmlSanitizer.sanitize(stringContent)
                                    : stringContent;
                    content.setHtmlBody(htmlBody);
                }
            } else if ((normalizedDisposition != null
                            && normalizedDisposition.contains(DISPOSITION_ATTACHMENT))
                    || (filename != null && !filename.trim().isEmpty())) {

                processAttachment(
                        part, content, request, getHeader, getContent, filename, contentType);
            } else if ((Boolean) isMimeType.invoke(part, "multipart/*")) {
                Object multipartContent = getContent.invoke(part);
                if (multipartContent != null) {
                    Class<?> multipartClass = Class.forName("jakarta.mail.Multipart");
                    if (multipartClass.isInstance(multipartContent)) {
                        processMultipart(
                                multipartContent, content, request, customHtmlSanitizer, depth + 1);
                    }
                }
            }

        } catch (ReflectiveOperationException | RuntimeException e) {
            // Continue processing other parts if one fails
        }
    }

    private static void processAttachment(
            Object part,
            EmailContent content,
            EmlToPdfRequest request,
            Method getHeader,
            Method getContent,
            String filename,
            String contentType) {

        content.setAttachmentCount(content.getAttachmentCount() + 1);

        if (filename != null && !filename.trim().isEmpty()) {
            EmailAttachment attachment = new EmailAttachment();
            attachment.setFilename(safeMimeDecode(filename));
            attachment.setContentType(contentType);

            try {
                String[] contentIdHeaders = (String[]) getHeader.invoke(part, HEADER_CONTENT_ID);
                if (contentIdHeaders != null) {
                    for (String contentIdHeader : contentIdHeaders) {
                        if (contentIdHeader != null && !contentIdHeader.trim().isEmpty()) {
                            attachment.setEmbedded(true);
                            String contentId = contentIdHeader.trim().replaceAll("[<>]", "");
                            attachment.setContentId(contentId);
                            break;
                        }
                    }
                }
            } catch (ReflectiveOperationException e) {
            }

            if ((request != null && request.isIncludeAttachments()) || attachment.isEmbedded()) {
                extractAttachmentData(part, attachment, getContent, request);
            }

            content.getAttachments().add(attachment);
        }
    }

    private static void extractAttachmentData(
            Object part, EmailAttachment attachment, Method getContent, EmlToPdfRequest request) {
        try {
            Object attachmentContent = getContent.invoke(part);
            byte[] attachmentData = null;

            if (attachmentContent instanceof InputStream inputStream) {
                try (InputStream stream = inputStream) {
                    attachmentData = stream.readAllBytes();
                } catch (IOException e) {
                    if (attachment.isEmbedded()) {
                        attachmentData = new byte[0];
                    } else {
                        throw new RuntimeException(e);
                    }
                }
            } else if (attachmentContent instanceof byte[] byteArray) {
                attachmentData = byteArray;
            } else if (attachmentContent instanceof String stringContent) {
                attachmentData = stringContent.getBytes(StandardCharsets.UTF_8);
            }

            if (attachmentData != null) {
                long maxSizeMB = request != null ? request.getMaxAttachmentSizeMB() : 10L;
                long maxSizeBytes = maxSizeMB * 1024 * 1024;

                if (attachmentData.length <= maxSizeBytes || attachment.isEmbedded()) {
                    attachment.setData(attachmentData);
                    attachment.setSizeBytes(attachmentData.length);
                } else {
                    attachment.setSizeBytes(attachmentData.length);
                }
            }
        } catch (ReflectiveOperationException | RuntimeException e) {
            // Continue without attachment data
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
                    for (int j = i + 1; j < lines.length; j++) {
                        if (lines[j].startsWith(" ") || lines[j].startsWith("\t")) {
                            value.append(" ").append(lines[j].trim());
                        } else {
                            break;
                        }
                    }
                    return safeMimeDecode(value.toString());
                }
                if (line.trim().isEmpty()) break;
            }
        } catch (RuntimeException e) {
            // Ignore errors in header extraction
        }
        return "";
    }

    private static String extractHtmlBody(String emlContent) {
        try {
            String lowerContent = emlContent.toLowerCase();
            int htmlStart = lowerContent.indexOf(HEADER_CONTENT_TYPE + " " + TEXT_HTML);
            if (htmlStart == -1) return null;

            int bodyStart = emlContent.indexOf("\r\n\r\n", htmlStart);
            if (bodyStart == -1) bodyStart = emlContent.indexOf("\n\n", htmlStart);
            if (bodyStart == -1) return null;

            bodyStart += (emlContent.charAt(bodyStart + 1) == '\r') ? 4 : 2;
            int bodyEnd = findPartEnd(emlContent, bodyStart);

            return emlContent.substring(bodyStart, bodyEnd).trim();
        } catch (Exception e) {
            return null;
        }
    }

    private static String extractTextBody(String emlContent) {
        try {
            String lowerContent = emlContent.toLowerCase();
            int textStart = lowerContent.indexOf(HEADER_CONTENT_TYPE + " " + TEXT_PLAIN);
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

            int bodyStart = emlContent.indexOf("\r\n\r\n", textStart);
            if (bodyStart == -1) bodyStart = emlContent.indexOf("\n\n", textStart);
            if (bodyStart == -1) return null;

            bodyStart += (emlContent.charAt(bodyStart + 1) == '\r') ? 4 : 2;
            int bodyEnd = findPartEnd(emlContent, bodyStart);

            return emlContent.substring(bodyStart, bodyEnd).trim();
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

    private static List<EmailAttachment> extractAttachmentsBasic(String emlContent) {
        List<EmailAttachment> attachments = new ArrayList<>();
        try {
            String[] lines = emlContent.split("\r?\n");
            boolean inHeaders = true;
            String currentContentType = "";
            String currentDisposition = "";
            String currentFilename = "";
            String currentEncoding = "";

            for (String line : lines) {
                String lowerLine = line.toLowerCase().trim();

                if (line.trim().isEmpty()) {
                    inHeaders = false;
                    if (isAttachment(currentDisposition, currentFilename, currentContentType)) {
                        EmailAttachment attachment = new EmailAttachment();
                        attachment.setFilename(currentFilename);
                        attachment.setContentType(currentContentType);
                        attachment.setTransferEncoding(currentEncoding);
                        attachments.add(attachment);
                    }
                    currentContentType = "";
                    currentDisposition = "";
                    currentFilename = "";
                    currentEncoding = "";
                    inHeaders = true;
                    continue;
                }

                if (!inHeaders) continue;

                if (lowerLine.startsWith(HEADER_CONTENT_TYPE)) {
                    currentContentType = line.substring(HEADER_CONTENT_TYPE.length()).trim();
                } else if (lowerLine.startsWith(HEADER_CONTENT_DISPOSITION)) {
                    currentDisposition = line.substring(HEADER_CONTENT_DISPOSITION.length()).trim();
                    currentFilename = extractFilenameFromDisposition(currentDisposition);
                } else if (lowerLine.startsWith(HEADER_CONTENT_TRANSFER_ENCODING)) {
                    currentEncoding =
                            line.substring(HEADER_CONTENT_TRANSFER_ENCODING.length()).trim();
                }
            }
        } catch (RuntimeException e) {
            // Continue with empty list
        }
        return attachments;
    }

    private static boolean isAttachment(String disposition, String filename, String contentType) {
        return (disposition.toLowerCase().contains(DISPOSITION_ATTACHMENT) && !filename.isEmpty())
                || (!filename.isEmpty() && !contentType.toLowerCase().startsWith("text/"))
                || (contentType.toLowerCase().contains("application/") && !filename.isEmpty());
    }

    private static String extractFilenameFromDisposition(String disposition) {
        if (disposition == null || !disposition.contains("filename=")) {
            return "";
        }

        // Handle filename*= (RFC 2231 encoded filename)
        if (disposition.toLowerCase().contains("filename*=")) {
            int filenameStarStart = disposition.toLowerCase().indexOf("filename*=") + 10;
            int filenameStarEnd = disposition.indexOf(";", filenameStarStart);
            if (filenameStarEnd == -1) filenameStarEnd = disposition.length();
            String extendedFilename =
                    disposition.substring(filenameStarStart, filenameStarEnd).trim();
            extendedFilename = extendedFilename.replaceAll("^\"|\"$", "");

            if (extendedFilename.contains("'")) {
                String[] parts = extendedFilename.split("'", 3);
                if (parts.length == 3) {
                    return EmlProcessingUtils.decodeUrlEncoded(parts[2]);
                }
            }
        }

        // Handle regular filename=
        int filenameStart = disposition.toLowerCase().indexOf("filename=") + 9;
        int filenameEnd = disposition.indexOf(";", filenameStart);
        if (filenameEnd == -1) filenameEnd = disposition.length();
        String filename = disposition.substring(filenameStart, filenameEnd).trim();
        filename = filename.replaceAll("^\"|\"$", "");
        return safeMimeDecode(filename);
    }

    public static String safeMimeDecode(String headerValue) {
        if (headerValue == null || headerValue.trim().isEmpty()) {
            return "";
        }

        if (!mimeUtilityChecked) {
            synchronized (EmlParser.class) {
                if (!mimeUtilityChecked) {
                    initializeMimeUtilityDecoding();
                }
            }
        }

        if (mimeUtilityDecodeTextMethod != null) {
            try {
                return (String) mimeUtilityDecodeTextMethod.invoke(null, headerValue.trim());
            } catch (ReflectiveOperationException | RuntimeException e) {
                // Fall through to custom implementation
            }
        }

        return EmlProcessingUtils.decodeMimeHeader(headerValue.trim());
    }

    private static void initializeMimeUtilityDecoding() {
        try {
            Class<?> mimeUtilityClass = Class.forName("jakarta.mail.internet.MimeUtility");
            mimeUtilityDecodeTextMethod = mimeUtilityClass.getMethod("decodeText", String.class);
        } catch (ClassNotFoundException | NoSuchMethodException e) {
            mimeUtilityDecodeTextMethod = null;
        }
        mimeUtilityChecked = true;
    }

    @Data
    public static class EmailContent {
        private String subject;
        private String from;
        private String to;
        private String cc;
        private String bcc;
        private Date date;
        private String dateString; // For basic parsing fallback
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
        private String contentId;
        private String disposition;
        private String transferEncoding;

        public void setData(byte[] data) {
            this.data = data;
            if (data != null) {
                this.sizeBytes = data.length;
            }
        }
    }
}

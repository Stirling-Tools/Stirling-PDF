package stirling.software.common.util;

import static stirling.software.common.util.AttachmentUtils.setCatalogViewerPreferences;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PageMode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.jetbrains.annotations.NotNull;
import org.springframework.web.multipart.MultipartFile;

import lombok.Data;
import lombok.Getter;
import lombok.experimental.UtilityClass;

import stirling.software.common.service.CustomPDFDocumentFactory;

@UtilityClass
public class PdfAttachmentHandler {
    // Note: This class is designed for EML attachments, not general PDF attachments.

    private static final String ATTACHMENT_MARKER = "@";
    private static final float ATTACHMENT_ICON_WIDTH = 12f;
    private static final float ATTACHMENT_ICON_HEIGHT = 14f;
    private static final float ANNOTATION_X_OFFSET = 2f;
    private static final float ANNOTATION_Y_OFFSET = 10f;

    public static byte[] attachFilesToPdf(
            byte[] pdfBytes,
            List<EmlParser.EmailAttachment> attachments,
            CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {

        if (attachments == null || attachments.isEmpty()) {
            return pdfBytes;
        }

        try (PDDocument document = pdfDocumentFactory.load(pdfBytes);
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {

            List<MultipartFile> multipartAttachments = new ArrayList<>(attachments.size());
            for (int i = 0; i < attachments.size(); i++) {
                EmlParser.EmailAttachment attachment = attachments.get(i);
                if (attachment.getData() != null && attachment.getData().length > 0) {
                    String embeddedFilename =
                            attachment.getFilename() != null
                                    ? attachment.getFilename()
                                    : ("attachment_" + i);
                    attachment.setEmbeddedFilename(embeddedFilename);
                    multipartAttachments.add(createMultipartFile(attachment));
                }
            }

            if (!multipartAttachments.isEmpty()) {
                Map<Integer, String> indexToFilenameMap =
                        addAttachmentsToDocumentWithMapping(
                                document, multipartAttachments, attachments);
                setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);
                addAttachmentAnnotationsToDocumentWithMapping(
                        document, attachments, indexToFilenameMap);
            }

            document.save(outputStream);
            return outputStream.toByteArray();
        } catch (RuntimeException e) {
            throw new IOException(
                    "Invalid PDF structure or processing error: " + e.getMessage(), e);
        } catch (Exception e) {
            throw new IOException("Error attaching files to PDF: " + e.getMessage(), e);
        }
    }

    private static MultipartFile createMultipartFile(EmlParser.EmailAttachment attachment) {
        return new MultipartFile() {
            @Override
            public @NotNull String getName() {
                return "attachment";
            }

            @Override
            public String getOriginalFilename() {
                return attachment.getFilename() != null
                        ? attachment.getFilename()
                        : "attachment_" + System.currentTimeMillis();
            }

            @Override
            public String getContentType() {
                return attachment.getContentType() != null
                        ? attachment.getContentType()
                        : "application/octet-stream";
            }

            @Override
            public boolean isEmpty() {
                return attachment.getData() == null || attachment.getData().length == 0;
            }

            @Override
            public long getSize() {
                return attachment.getData() != null ? attachment.getData().length : 0;
            }

            @Override
            public byte @NotNull [] getBytes() {
                return attachment.getData() != null ? attachment.getData() : new byte[0];
            }

            @Override
            public @NotNull InputStream getInputStream() {
                byte[] data = attachment.getData();
                return new ByteArrayInputStream(data != null ? data : new byte[0]);
            }

            @Override
            public void transferTo(@NotNull File dest) throws IOException, IllegalStateException {
                try (FileOutputStream fos = new FileOutputStream(dest)) {
                    byte[] data = attachment.getData();
                    if (data != null) {
                        fos.write(data);
                    }
                }
            }
        };
    }

    private static String ensureUniqueFilename(String filename, Set<String> existingNames) {
        if (!existingNames.contains(filename)) {
            return filename;
        }

        String baseName;
        String extension = "";
        int lastDot = filename.lastIndexOf('.');
        if (lastDot > 0) {
            baseName = filename.substring(0, lastDot);
            extension = filename.substring(lastDot);
        } else {
            baseName = filename;
        }

        int counter = 1;
        String uniqueName;
        do {
            uniqueName = baseName + "_" + counter + extension;
            counter++;
        } while (existingNames.contains(uniqueName));

        return uniqueName;
    }

    private static @NotNull PDRectangle calculateAnnotationRectangle(
            PDPage page, float x, float y) {
        PDRectangle cropBox = page.getCropBox();

        // ISO 32000-1:2008 Section 8.3: PDF coordinate system transforms
        int rotation = page.getRotation();
        float pdfX = x;
        float pdfY = cropBox.getHeight() - y;

        switch (rotation) {
            case 90 -> {
                float temp = pdfX;
                pdfX = pdfY;
                pdfY = cropBox.getWidth() - temp;
            }
            case 180 -> {
                pdfX = cropBox.getWidth() - pdfX;
                pdfY = y;
            }
            case 270 -> {
                float temp = pdfX;
                pdfX = cropBox.getHeight() - pdfY;
                pdfY = temp;
            }
            default -> {}
        }

        float iconHeight = ATTACHMENT_ICON_HEIGHT;
        float paddingX = 2.0f;
        float paddingY = 2.0f;

        PDRectangle rect =
                new PDRectangle(
                        pdfX + ANNOTATION_X_OFFSET + paddingX,
                        pdfY - iconHeight + ANNOTATION_Y_OFFSET + paddingY,
                        ATTACHMENT_ICON_WIDTH,
                        iconHeight);

        PDRectangle mediaBox = page.getMediaBox();
        if (rect.getLowerLeftX() < mediaBox.getLowerLeftX()
                || rect.getLowerLeftY() < mediaBox.getLowerLeftY()
                || rect.getUpperRightX() > mediaBox.getUpperRightX()
                || rect.getUpperRightY() > mediaBox.getUpperRightY()) {

            float adjustedX =
                    Math.max(
                            mediaBox.getLowerLeftX(),
                            Math.min(
                                    rect.getLowerLeftX(),
                                    mediaBox.getUpperRightX() - rect.getWidth()));
            float adjustedY =
                    Math.max(
                            mediaBox.getLowerLeftY(),
                            Math.min(
                                    rect.getLowerLeftY(),
                                    mediaBox.getUpperRightY() - rect.getHeight()));
            rect = new PDRectangle(adjustedX, adjustedY, rect.getWidth(), rect.getHeight());
        }

        return rect;
    }

    public static String processInlineImages(
            String htmlContent, EmlParser.EmailContent emailContent) {
        if (htmlContent == null || emailContent == null) return htmlContent;

        Map<String, EmlParser.EmailAttachment> contentIdMap = new HashMap<>();
        for (EmlParser.EmailAttachment attachment : emailContent.getAttachments()) {
            if (attachment.isEmbedded()
                    && attachment.getContentId() != null
                    && attachment.getData() != null) {
                contentIdMap.put(attachment.getContentId(), attachment);
            }
        }

        if (contentIdMap.isEmpty()) return htmlContent;

        Pattern cidPattern =
                Pattern.compile(
                        "(?i)<img[^>]*\\ssrc\\s*=\\s*['\"]cid:([^'\"]+)['\"][^>]*>",
                        Pattern.CASE_INSENSITIVE);
        Matcher matcher = cidPattern.matcher(htmlContent);

        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            String contentId = matcher.group(1);
            EmlParser.EmailAttachment attachment = contentIdMap.get(contentId);

            if (attachment != null && attachment.getData() != null) {
                String mimeType =
                        EmlProcessingUtils.detectMimeType(
                                attachment.getFilename(), attachment.getContentType());

                String base64Data = Base64.getEncoder().encodeToString(attachment.getData());
                String dataUri = "data:" + mimeType + ";base64," + base64Data;

                String replacement =
                        matcher.group(0).replaceFirst("cid:" + Pattern.quote(contentId), dataUri);
                matcher.appendReplacement(result, Matcher.quoteReplacement(replacement));
            } else {
                matcher.appendReplacement(result, Matcher.quoteReplacement(matcher.group(0)));
            }
        }
        matcher.appendTail(result);

        return result.toString();
    }

    public static String formatEmailDate(Date date) {
        if (date == null) return "";

        SimpleDateFormat formatter =
                new SimpleDateFormat("EEE, MMM d, yyyy 'at' h:mm a z", Locale.ENGLISH);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(date);
    }

    @Data
    public static class MarkerPosition {
        private int pageIndex;
        private float x;
        private float y;
        private String character;
        private String filename;

        public MarkerPosition(int pageIndex, float x, float y, String character, String filename) {
            this.pageIndex = pageIndex;
            this.x = x;
            this.y = y;
            this.character = character;
            this.filename = filename;
        }
    }

    public static class AttachmentMarkerPositionFinder extends PDFTextStripper {
        @Getter private final List<MarkerPosition> positions = new ArrayList<>();
        private int currentPageIndex;
        protected boolean sortByPosition;
        private boolean isInAttachmentSection;
        private boolean attachmentSectionFound;
        private final StringBuilder currentText = new StringBuilder();

        private static final Pattern ATTACHMENT_SECTION_PATTERN =
                Pattern.compile("attachments\\s*\\(\\d+\\)", Pattern.CASE_INSENSITIVE);

        private static final Pattern FILENAME_PATTERN =
                Pattern.compile("@\\s*([^\\s\\(]+(?:\\.[a-zA-Z0-9]+)?)");

        public AttachmentMarkerPositionFinder() {
            super();
            this.currentPageIndex = 0;
            this.sortByPosition = false; // Disable sorting to preserve document order
            this.isInAttachmentSection = false;
            this.attachmentSectionFound = false;
        }

        @Override
        public String getText(PDDocument document) throws IOException {
            super.getText(document);

            if (sortByPosition) {
                positions.sort(
                        (a, b) -> {
                            int pageCompare = Integer.compare(a.getPageIndex(), b.getPageIndex());
                            if (pageCompare != 0) return pageCompare;
                            return Float.compare(
                                    b.getY(), a.getY()); // Descending Y per PDF coordinate system
                        });
            }

            return ""; // Return empty string as we only need positions
        }

        @Override
        protected void startPage(PDPage page) throws IOException {
            super.startPage(page);
        }

        @Override
        protected void endPage(PDPage page) throws IOException {
            currentPageIndex++;
            super.endPage(page);
        }

        @Override
        protected void writeString(String string, List<TextPosition> textPositions)
                throws IOException {
            String lowerString = string.toLowerCase();

            if (ATTACHMENT_SECTION_PATTERN.matcher(lowerString).find()) {
                isInAttachmentSection = true;
                attachmentSectionFound = true;
            }

            if (isInAttachmentSection
                    && (lowerString.contains("</body>")
                            || lowerString.contains("</html>")
                            || (attachmentSectionFound
                                    && lowerString.trim().isEmpty()
                                    && string.length() > 50))) {
                isInAttachmentSection = false;
            }

            if (isInAttachmentSection) {
                currentText.append(string);

                for (int i = 0; (i = string.indexOf(ATTACHMENT_MARKER, i)) != -1; i++) {
                    if (i < textPositions.size()) {
                        TextPosition textPosition = textPositions.get(i);

                        String filename = extractFilenameAfterMarker(string, i);

                        MarkerPosition position =
                                new MarkerPosition(
                                        currentPageIndex,
                                        textPosition.getXDirAdj(),
                                        textPosition.getYDirAdj(),
                                        ATTACHMENT_MARKER,
                                        filename);
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

        private String extractFilenameAfterMarker(String text, int markerIndex) {
            String afterMarker = text.substring(markerIndex + 1);

            Matcher matcher = FILENAME_PATTERN.matcher("@" + afterMarker);
            if (matcher.find()) {
                return matcher.group(1);
            }

            String[] parts = afterMarker.split("[\\s\\(\\)]+");
            for (String part : parts) {
                part = part.trim();
                if (part.length() > 3 && part.contains(".")) {
                    return part;
                }
            }

            return null;
        }
    }

    private static Map<Integer, String> addAttachmentsToDocumentWithMapping(
            PDDocument document,
            List<MultipartFile> attachments,
            List<EmlParser.EmailAttachment> originalAttachments)
            throws IOException {

        PDDocumentCatalog catalog = document.getDocumentCatalog();

        if (catalog == null) {
            throw new IOException("PDF document catalog is not accessible");
        }

        PDDocumentNameDictionary documentNames = catalog.getNames();
        if (documentNames == null) {
            documentNames = new PDDocumentNameDictionary(catalog);
            catalog.setNames(documentNames);
        }

        PDEmbeddedFilesNameTreeNode embeddedFilesTree = documentNames.getEmbeddedFiles();
        if (embeddedFilesTree == null) {
            embeddedFilesTree = new PDEmbeddedFilesNameTreeNode();
            documentNames.setEmbeddedFiles(embeddedFilesTree);
        }

        Map<String, PDComplexFileSpecification> existingNames = embeddedFilesTree.getNames();
        if (existingNames == null) {
            existingNames = new HashMap<>();
        }

        Map<Integer, String> indexToFilenameMap = new HashMap<>();

        for (int i = 0; i < attachments.size(); i++) {
            MultipartFile attachment = attachments.get(i);
            String filename = attachment.getOriginalFilename();
            if (filename == null || filename.trim().isEmpty()) {
                filename = "attachment_" + i;
            }

            String normalizedFilename =
                    isAscii(filename)
                            ? filename
                            : java.text.Normalizer.normalize(
                                    filename, java.text.Normalizer.Form.NFC);
            String uniqueFilename =
                    ensureUniqueFilename(normalizedFilename, existingNames.keySet());

            indexToFilenameMap.put(i, uniqueFilename);

            PDEmbeddedFile embeddedFile = new PDEmbeddedFile(document, attachment.getInputStream());
            embeddedFile.setSize((int) attachment.getSize());

            GregorianCalendar currentTime = new GregorianCalendar();
            embeddedFile.setCreationDate(currentTime);
            embeddedFile.setModDate(currentTime);

            String contentType = attachment.getContentType();
            if (contentType != null && !contentType.trim().isEmpty()) {
                embeddedFile.setSubtype(contentType);
            }

            PDComplexFileSpecification fileSpecification = new PDComplexFileSpecification();
            fileSpecification.setFile(uniqueFilename);
            fileSpecification.setFileUnicode(uniqueFilename);
            fileSpecification.setEmbeddedFile(embeddedFile);
            fileSpecification.setEmbeddedFileUnicode(embeddedFile);

            existingNames.put(uniqueFilename, fileSpecification);
        }

        embeddedFilesTree.setNames(existingNames);
        documentNames.setEmbeddedFiles(embeddedFilesTree);
        catalog.setNames(documentNames);

        return indexToFilenameMap;
    }

    private static void addAttachmentAnnotationsToDocumentWithMapping(
            PDDocument document,
            List<EmlParser.EmailAttachment> attachments,
            Map<Integer, String> indexToFilenameMap)
            throws IOException {

        if (document.getNumberOfPages() == 0 || attachments == null || attachments.isEmpty()) {
            return;
        }

        AttachmentMarkerPositionFinder finder = new AttachmentMarkerPositionFinder();
        finder.setSortByPosition(false); // Keep document order to maintain pairing
        finder.getText(document);
        List<MarkerPosition> markerPositions = finder.getPositions();

        int annotationsToAdd = Math.min(markerPositions.size(), attachments.size());

        for (int i = 0; i < annotationsToAdd; i++) {
            MarkerPosition position = markerPositions.get(i);

            String filenameNearMarker = position.getFilename();

            EmlParser.EmailAttachment matchingAttachment =
                    findAttachmentByFilename(attachments, filenameNearMarker);

            if (matchingAttachment != null) {
                String embeddedFilename =
                        findEmbeddedFilenameForAttachment(matchingAttachment, indexToFilenameMap);

                if (embeddedFilename != null) {
                    PDPage page = document.getPage(position.getPageIndex());
                    addAttachmentAnnotationToPageWithMapping(
                            document,
                            page,
                            matchingAttachment,
                            embeddedFilename,
                            position.getX(),
                            position.getY(),
                            i);
                } else {
                    // No embedded filename found for attachment
                }
            } else {
                // No matching attachment found for filename near marker
            }
        }
    }

    private static EmlParser.EmailAttachment findAttachmentByFilename(
            List<EmlParser.EmailAttachment> attachments, String targetFilename) {
        if (targetFilename == null || targetFilename.trim().isEmpty()) {
            return null;
        }

        String normalizedTarget = normalizeFilename(targetFilename);

        // First try exact match
        for (EmlParser.EmailAttachment attachment : attachments) {
            if (attachment.getFilename() != null) {
                String normalizedAttachment = normalizeFilename(attachment.getFilename());
                if (normalizedAttachment.equals(normalizedTarget)) {
                    return attachment;
                }
            }
        }

        // Then try contains match
        for (EmlParser.EmailAttachment attachment : attachments) {
            if (attachment.getFilename() != null) {
                String normalizedAttachment = normalizeFilename(attachment.getFilename());
                if (normalizedAttachment.contains(normalizedTarget)
                        || normalizedTarget.contains(normalizedAttachment)) {
                    return attachment;
                }
            }
        }

        return null;
    }

    private static String findEmbeddedFilenameForAttachment(
            EmlParser.EmailAttachment attachment, Map<Integer, String> indexToFilenameMap) {

        String attachmentFilename = attachment.getFilename();
        if (attachmentFilename == null) {
            return null;
        }

        for (Map.Entry<Integer, String> entry : indexToFilenameMap.entrySet()) {
            String embeddedFilename = entry.getValue();
            if (embeddedFilename != null
                    && (embeddedFilename.equals(attachmentFilename)
                            || embeddedFilename.contains(attachmentFilename)
                            || attachmentFilename.contains(embeddedFilename))) {
                return embeddedFilename;
            }
        }

        return null;
    }

    private static String normalizeFilename(String filename) {
        if (filename == null) return "";
        return filename.toLowerCase()
                .trim()
                .replaceAll("\\s+", " ")
                .replaceAll("[^a-zA-Z0-9._-]", "");
    }

    private static void addAttachmentAnnotationToPageWithMapping(
            PDDocument document,
            PDPage page,
            EmlParser.EmailAttachment attachment,
            String embeddedFilename,
            float x,
            float y,
            int attachmentIndex)
            throws IOException {

        PDAnnotationFileAttachment fileAnnotation = new PDAnnotationFileAttachment();

        PDRectangle rect = calculateAnnotationRectangle(page, x, y);
        fileAnnotation.setRectangle(rect);

        fileAnnotation.setPrinted(false);
        fileAnnotation.setHidden(false);
        fileAnnotation.setNoView(false);
        fileAnnotation.setNoZoom(true);
        fileAnnotation.setNoRotate(true);

        try {
            PDAppearanceDictionary appearance = new PDAppearanceDictionary();
            PDAppearanceStream normalAppearance = new PDAppearanceStream(document);
            normalAppearance.setBBox(new PDRectangle(0, 0, rect.getWidth(), rect.getHeight()));
            appearance.setNormalAppearance(normalAppearance);
            fileAnnotation.setAppearance(appearance);
        } catch (RuntimeException e) {
            fileAnnotation.setAppearance(null);
        }

        PDEmbeddedFilesNameTreeNode efTree =
                document.getDocumentCatalog().getNames().getEmbeddedFiles();
        if (efTree != null) {
            Map<String, PDComplexFileSpecification> efMap = efTree.getNames();
            if (efMap != null) {
                PDComplexFileSpecification fileSpec = efMap.get(embeddedFilename);
                if (fileSpec != null) {
                    fileAnnotation.setFile(fileSpec);
                } else {
                    // Could not find embedded file
                }
            }
        }

        fileAnnotation.setContents(
                "Attachment " + (attachmentIndex + 1) + ": " + attachment.getFilename());
        fileAnnotation.setAnnotationName(
                "EmbeddedFile_" + attachmentIndex + "_" + embeddedFilename);

        page.getAnnotations().add(fileAnnotation);
    }

    private static boolean isAscii(String str) {
        if (str == null) return true;
        for (int i = 0; i < str.length(); i++) {
            if (str.charAt(i) > 127) {
                return false;
            }
        }
        return true;
    }
}

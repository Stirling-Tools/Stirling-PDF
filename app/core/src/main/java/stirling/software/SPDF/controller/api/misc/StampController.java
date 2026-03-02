package stirling.software.SPDF.controller.api.misc;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.beans.PropertyEditorSupport;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.imageio.ImageIO;

import org.apache.commons.io.IOUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.AddStampRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class StampController {

    private static final Pattern NEWLINE_PATTERN = Pattern.compile("\\r?\\n");
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    private static final int MAX_DATE_FORMAT_LENGTH = 50;
    private static final Pattern SAFE_DATE_FORMAT_PATTERN =
            Pattern.compile("^[yMdHhmsS/\\-:\\s.,'+EGuwWDFzZXa]+$");
    private static final Pattern CUSTOM_DATE_PATTERN = Pattern.compile("@date\\{([^}]{1,50})\\}");
    // Placeholder for escaped @ symbol (using Unicode private use area)
    private static final String ESCAPED_AT_PLACEHOLDER = "\uE000ESCAPED_AT\uE000";

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/add-stamp")
    @Operation(
            summary = "Add stamp to a PDF file",
            description =
                    "This endpoint adds a stamp to a given PDF file. Users can specify the stamp"
                            + " type (text or image), rotation, opacity, width spacer, and height"
                            + " spacer. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> addStamp(@ModelAttribute AddStampRequest request)
            throws IOException, Exception {
        MultipartFile pdfFile = request.getFileInput();
        String pdfFileName = pdfFile.getOriginalFilename();
        if (pdfFileName.contains("..") || pdfFileName.startsWith("/")) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalid.filepath", "Invalid PDF file path: " + pdfFileName);
        }

        String stampType = request.getStampType();
        String stampText = request.getStampText();
        MultipartFile stampImage = request.getStampImage();
        if ("image".equalsIgnoreCase(stampType)) {
            if (stampImage == null) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.stamp.image.required",
                        "Stamp image file must be provided when stamp type is 'image'");
            }
            String stampImageName = stampImage.getOriginalFilename();
            if (stampImageName == null
                    || stampImageName.contains("..")
                    || stampImageName.startsWith("/")) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat",
                        "Invalid {0} format: {1}",
                        "stamp image file path",
                        stampImageName);
            }
        }
        String alphabet = request.getAlphabet();
        float fontSize = request.getFontSize();
        float rotation = request.getRotation();
        float opacity = request.getOpacity();
        int position = request.getPosition(); // Updated to use 1-9 positioning logic
        float overrideX = request.getOverrideX(); // New field for X override
        float overrideY = request.getOverrideY(); // New field for Y override

        String customColor = request.getCustomColor();
        float marginFactor =
                switch (request.getCustomMargin().toLowerCase(Locale.ROOT)) {
                    case "small" -> 0.02f;
                    case "medium" -> 0.035f;
                    case "large" -> 0.05f;
                    case "x-large" -> 0.075f;
                    default -> 0.035f;
                };

        // Load the input PDF
        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {

            List<Integer> pageNumbers = request.getPageNumbersList(document, true);

            for (int pageIndex : pageNumbers) {
                int zeroBasedIndex = pageIndex - 1;
                if (zeroBasedIndex >= 0 && zeroBasedIndex < document.getNumberOfPages()) {
                    PDPage page = document.getPage(zeroBasedIndex);
                    PDRectangle pageSize = page.getMediaBox();
                    float margin = marginFactor * (pageSize.getWidth() + pageSize.getHeight()) / 2;

                    PDPageContentStream contentStream =
                            new PDPageContentStream(
                                    document,
                                    page,
                                    PDPageContentStream.AppendMode.APPEND,
                                    true,
                                    true);

                    PDExtendedGraphicsState graphicsState = new PDExtendedGraphicsState();
                    graphicsState.setNonStrokingAlphaConstant(opacity);
                    contentStream.setGraphicsStateParameters(graphicsState);

                    if ("text".equalsIgnoreCase(stampType)) {
                        addTextStamp(
                                contentStream,
                                stampText,
                                document,
                                page,
                                rotation,
                                position,
                                fontSize,
                                alphabet,
                                overrideX,
                                overrideY,
                                margin,
                                customColor,
                                pageIndex,
                                pdfFileName);
                    } else if ("image".equalsIgnoreCase(stampType)) {
                        addImageStamp(
                                contentStream,
                                stampImage,
                                document,
                                page,
                                rotation,
                                position,
                                fontSize,
                                overrideX,
                                overrideY,
                                margin);
                    }

                    contentStream.close();
                }
            }
            // Return the stamped PDF as a response
            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(pdfFile.getOriginalFilename(), "_stamped.pdf"));
        }
    }

    private void addTextStamp(
            PDPageContentStream contentStream,
            String stampText,
            PDDocument document,
            PDPage page,
            float rotation,
            int position, // 1-9 positioning logic
            float fontSize,
            String alphabet,
            float overrideX, // X override
            float overrideY, // Y override
            float margin,
            String colorString,
            int currentPageNumber,
            String filename)
            throws IOException {
        String resourceDir;
        PDFont font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        resourceDir =
                switch (alphabet) {
                    case "arabic" -> "static/fonts/NotoSansArabic-Regular.ttf";
                    case "japanese" -> "static/fonts/Meiryo.ttf";
                    case "korean" -> "static/fonts/malgun.ttf";
                    case "chinese" -> "static/fonts/SimSun.ttf";
                    case "thai" -> "static/fonts/NotoSansThai-Regular.ttf";
                    case "roman" -> "static/fonts/NotoSans-Regular.ttf";
                    default -> "static/fonts/NotoSans-Regular.ttf";
                };

        ClassPathResource classPathResource = new ClassPathResource(resourceDir);
        String fileExtension = resourceDir.substring(resourceDir.lastIndexOf("."));

        // Use TempFile with try-with-resources for automatic cleanup
        try (TempFile tempFileWrapper = new TempFile(tempFileManager, fileExtension)) {
            File tempFile = tempFileWrapper.getFile();
            try (InputStream is = classPathResource.getInputStream();
                    FileOutputStream os = new FileOutputStream(tempFile)) {
                IOUtils.copy(is, os);
                font = PDType0Font.load(document, tempFile);
            }
        }

        Color redactColor;
        try {
            if (!colorString.startsWith("#")) {
                colorString = "#" + colorString;
            }
            redactColor = Color.decode(colorString);
        } catch (NumberFormatException e) {
            redactColor = Color.LIGHT_GRAY;
        }

        contentStream.setNonStrokingColor(redactColor);

        int pageCount = document.getNumberOfPages();

        String processedStampText =
                processStampText(stampText, currentPageNumber, pageCount, filename, document);

        String normalizedText =
                RegexPatternUtils.getInstance()
                        .getEscapedNewlinePattern()
                        .matcher(processedStampText)
                        .replaceAll("\n");
        String[] lines = NEWLINE_PATTERN.split(normalizedText);

        PDRectangle pageSize = page.getMediaBox();

        // Use fontSize directly (default 40 if not specified)
        float effectiveFontSize = fontSize > 0 ? fontSize : 40f;

        contentStream.setFont(font, effectiveFontSize);

        // Calculate dynamic line height based on font ascent and descent
        float ascent = font.getFontDescriptor().getAscent();
        float descent = font.getFontDescriptor().getDescent();
        float lineHeight = ((ascent - descent) / 1000) * effectiveFontSize;

        float maxLineWidth = 0;
        for (String line : lines) {
            float lineWidth = calculateTextWidth(line, font, effectiveFontSize);
            if (lineWidth > maxLineWidth) {
                maxLineWidth = lineWidth;
            }
        }

        float totalTextHeight = lines.length * lineHeight;

        float x, y;

        if (overrideX >= 0 && overrideY >= 0) {
            x = overrideX;
            y = overrideY;
        } else {
            x = calculatePositionX(pageSize, position, maxLineWidth, margin);
            y = calculatePositionY(pageSize, position, totalTextHeight, margin);
        }

        contentStream.beginText();
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            // Set the text matrix for each line with rotation
            contentStream.setTextMatrix(
                    Matrix.getRotateInstance(Math.toRadians(rotation), x, y - (i * lineHeight)));
            contentStream.showText(line);
        }
        contentStream.endText();
    }

    /**
     * Process stamp text by replacing all @commands with their actual values. Supported commands:
     *
     * <p>Date & Time:
     *
     * <ul>
     *   <li>@date - Current date (YYYY-MM-DD)
     *   <li>@time - Current time (HH:mm:ss)
     *   <li>@datetime - Current date and time (YYYY-MM-DD HH:mm:ss)
     *   <li>@date{format} - Custom date/time format (e.g., @date{dd/MM/yyyy})
     *   <li>@year - Current year (4 digits)
     *   <li>@month - Current month (01-12)
     *   <li>@day - Current day of month (01-31)
     * </ul>
     *
     * <p>Page Information:
     *
     * <ul>
     *   <li>@page_number or @page - Current page number
     *   <li>@total_pages or @page_count - Total number of pages
     * </ul>
     *
     * <p>File Information:
     *
     * <ul>
     *   <li>@filename - Original filename (without extension)
     *   <li>@filename_full - Original filename (with extension)
     * </ul>
     *
     * <p>Document Metadata:
     *
     * <ul>
     *   <li>@author - Document author (from PDF metadata)
     *   <li>@title - Document title (from PDF metadata)
     *   <li>@subject - Document subject (from PDF metadata)
     * </ul>
     *
     * <p>Other:
     *
     * <ul>
     *   <li>@uuid - Short unique identifier (8 characters)
     * </ul>
     */
    private String processStampText(
            String stampText,
            int currentPageNumber,
            int totalPages,
            String filename,
            PDDocument document) {
        if (stampText == null || stampText.isEmpty()) {
            return "";
        }

        // Handle escaped @@ sequences first - replace with placeholder to preserve literal @
        String result = stampText.replace("@@", ESCAPED_AT_PLACEHOLDER);

        LocalDateTime now = LocalDateTime.now();
        String currentDate = now.toLocalDate().toString();
        String currentTime = now.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm:ss"));
        String currentDateTime = now.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));

        String filenameWithoutExt = filename != null ? filename : "";
        if (filename != null && filename.contains(".")) {
            int lastDot = filename.lastIndexOf('.');
            if (lastDot > 0) { // Ensure there's actually a name before the dot
                filenameWithoutExt = filename.substring(0, lastDot);
            }
        }

        String author = "";
        String title = "";
        String subject = "";
        if (document != null && document.getDocumentInformation() != null) {
            var info = document.getDocumentInformation();
            author = info.getAuthor() != null ? info.getAuthor() : "";
            title = info.getTitle() != null ? info.getTitle() : "";
            subject = info.getSubject() != null ? info.getSubject() : "";
        }

        String uuid = UUID.randomUUID().toString().substring(0, 8);

        // Process @date{format} with custom format first (must be before simple @date)
        Matcher matcher = CUSTOM_DATE_PATTERN.matcher(result);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String format = matcher.group(1);
            String replacement = processCustomDateFormat(format, now);
            matcher.appendReplacement(sb, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(sb);
        result = sb.toString();

        result =
                result.replace("@datetime", currentDateTime)
                        .replace("@date", currentDate)
                        .replace("@time", currentTime)
                        .replace("@year", String.valueOf(now.getYear()))
                        .replace("@month", String.format("%02d", now.getMonthValue()))
                        .replace("@day", String.format("%02d", now.getDayOfMonth()))
                        .replace("@page_number", String.valueOf(currentPageNumber))
                        .replace(
                                "@page_count", String.valueOf(totalPages)) // Must come before @page
                        .replace("@total_pages", String.valueOf(totalPages))
                        .replace(
                                "@page",
                                String.valueOf(currentPageNumber)) // Must come after @page_count
                        .replace("@filename_full", filename != null ? filename : "")
                        .replace("@filename", filenameWithoutExt)
                        .replace("@author", author)
                        .replace("@title", title)
                        .replace("@subject", subject)
                        .replace("@uuid", uuid);

        result = result.replace(ESCAPED_AT_PLACEHOLDER, "@");

        return result;
    }

    private String processCustomDateFormat(String format, LocalDateTime now) {
        if (format == null || format.length() > MAX_DATE_FORMAT_LENGTH) {
            return "[invalid format: too long]";
        }

        if (!SAFE_DATE_FORMAT_PATTERN.matcher(format).matches()) {
            return "[invalid format]";
        }

        try {
            return now.format(DateTimeFormatter.ofPattern(format));
        } catch (IllegalArgumentException e) {
            return "[invalid format: " + format + "]";
        }
    }

    private void addImageStamp(
            PDPageContentStream contentStream,
            MultipartFile stampImage,
            PDDocument document,
            PDPage page,
            float rotation,
            int position, // 1-9 positioning logic
            float fontSize,
            float overrideX,
            float overrideY,
            float margin)
            throws IOException {

        // Load the stamp image
        BufferedImage image = ImageIO.read(stampImage.getInputStream());

        // Compute width based on original aspect ratio
        float aspectRatio = (float) image.getWidth() / (float) image.getHeight();

        // Desired physical height (in PDF points)
        float desiredPhysicalHeight = fontSize;

        // Desired physical width based on the aspect ratio
        float desiredPhysicalWidth = desiredPhysicalHeight * aspectRatio;

        // Convert the BufferedImage to PDImageXObject
        PDImageXObject xobject = LosslessFactory.createFromImage(document, image);

        PDRectangle pageSize = page.getMediaBox();
        float x, y;

        if (overrideX >= 0 && overrideY >= 0) {
            // Use override values if provided
            x = overrideX;
            y = overrideY;
        } else {
            x = calculatePositionX(pageSize, position, desiredPhysicalWidth, margin);
            y = calculatePositionY(pageSize, position, desiredPhysicalHeight, margin);
        }

        contentStream.saveGraphicsState();
        contentStream.transform(Matrix.getTranslateInstance(x, y));
        contentStream.transform(Matrix.getRotateInstance(Math.toRadians(rotation), 0, 0));
        contentStream.drawImage(xobject, 0, 0, desiredPhysicalWidth, desiredPhysicalHeight);
        contentStream.restoreGraphicsState();
    }

    private float calculatePositionX(
            PDRectangle pageSize, int position, float contentWidth, float margin) {
        return switch (position % 3) {
            case 1: // Left
                yield pageSize.getLowerLeftX() + margin;
            case 2: // Center
                yield (pageSize.getWidth() - contentWidth) / 2;
            case 0: // Right
                yield pageSize.getUpperRightX() - contentWidth - margin;
            default:
                yield 0;
        };
    }

    private float calculatePositionY(
            PDRectangle pageSize, int position, float height, float margin) {
        return switch ((position - 1) / 3) {
            case 0: // Top - first line near the top
                yield pageSize.getUpperRightY() - margin;
            case 1: // Middle - center of text block at page center
                yield (pageSize.getHeight() + height) / 2;
            case 2: // Bottom - first line positioned so last line is at bottom margin
                yield pageSize.getLowerLeftY() + margin + height;
            default:
                yield 0;
        };
    }

    private float calculateTextWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000 * fontSize;
    }
}

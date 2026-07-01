package stirling.software.common.util;

import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.foreign.Arena;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.web.multipart.MultipartFile;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.transform.PageOps;

import app.photofox.vipsffm.VImage;
import app.photofox.vipsffm.VipsOption;
import app.photofox.vipsffm.enums.VipsBandFormat;
import app.photofox.vipsffm.enums.VipsDirection;
import app.photofox.vipsffm.enums.VipsInterpretation;
import app.photofox.vipsffm.enums.VipsOperationRelational;

@Slf4j
@UtilityClass
public class PdfUtils {

    public byte[] convertFromPdf(
            Path pdfPath,
            String imageType,
            ImageType colorType,
            boolean singleImage,
            int DPI,
            String filename,
            boolean includeAnnotations)
            throws IOException {

        int maxSafeDpi = 600;
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            maxSafeDpi = properties.getSystem().getMaxDPI();
        }

        if (DPI > maxSafeDpi) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dpiTooHigh", "DPI value {0} is too high.", DPI, maxSafeDpi);
        }

        Path actualPdfPath = pdfPath;
        TempFile tempPdfFile = null;
        try {
            if (!includeAnnotations) {
                CustomPDFDocumentFactory pdfDocumentFactory =
                        ApplicationContextProvider.getBean(CustomPDFDocumentFactory.class);
                if (pdfDocumentFactory != null) {
                    try (PDDocument document = pdfDocumentFactory.load(pdfPath)) {
                        for (PDPage page : document.getPages()) {
                            page.getAnnotations().clear();
                        }
                        TempFileManager tempFileManager =
                                ApplicationContextProvider.getBean(TempFileManager.class);
                        if (tempFileManager != null) {
                            tempPdfFile = new TempFile(tempFileManager, ".pdf");
                            document.save(tempPdfFile.getFile());
                            actualPdfPath = tempPdfFile.getPath();
                        }
                    }
                }
            }

            if (singleImage) {
                try (Arena arena = Arena.ofConfined()) {
                    VImage combined;
                    try {
                        String pathStr = actualPdfPath.toAbsolutePath().toString();
                        if ("tiff".equalsIgnoreCase(imageType)
                                || "tif".equalsIgnoreCase(imageType)) {
                            combined =
                                    VImage.pdfload(
                                            arena,
                                            pathStr,
                                            VipsOption.Int("n", -1),
                                            VipsOption.Int("dpi", DPI),
                                            VipsOption.Double("background", 0.0));
                        } else {
                            combined = null;
                            int pageCount;
                            try (PdfDocument document = PdfDocument.open(actualPdfPath)) {
                                pageCount = document.pageCount();
                            }

                            for (int i = 0; i < pageCount; ++i) {
                                VImage pageVips =
                                        VImage.pdfload(
                                                arena,
                                                pathStr,
                                                VipsOption.Int("page", i),
                                                VipsOption.Int("dpi", DPI),
                                                VipsOption.Double("background", 0.0));
                                if (combined == null) {
                                    combined = pageVips;
                                } else {
                                    combined =
                                            combined.join(
                                                    pageVips, VipsDirection.DIRECTION_VERTICAL);
                                }
                            }
                        }
                        return RenderingUtils.vImageToBytes(combined, imageType);
                    } catch (Exception e) {
                        log.warn(
                                "Native libvips path-based pdfload failed, falling back to JPDFium",
                                e);
                        byte[] pdfBytes = Files.readAllBytes(actualPdfPath);
                        try (PdfDocument document = PdfDocument.open(pdfBytes)) {
                            return renderMultiPageWithJPDFium(
                                    document, document.pageCount(), DPI, imageType);
                        }
                    }
                }
            } else {
                try (PdfDocument document = PdfDocument.open(actualPdfPath);
                        ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    int pageCount = document.pageCount();
                    try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                        for (int i = 0; i < pageCount; ++i) {
                            byte[] imageBytes =
                                    RenderingUtils.renderPageToBytes(document, i, DPI, imageType);

                            zos.putNextEntry(
                                    new ZipEntry(
                                            String.format(
                                                    Locale.ROOT,
                                                    filename + "_%d.%s",
                                                    i + 1,
                                                    imageType.toLowerCase(Locale.ROOT))));
                            zos.write(imageBytes);
                        }
                    }
                    return baos.toByteArray();
                }
            }
        } finally {
            if (tempPdfFile != null) {
                tempPdfFile.close();
            }
        }
    }

    private byte[] renderMultiPageWithJPDFium(
            PdfDocument document, int pageCount, int DPI, String imageType) throws IOException {
        try (Arena arena = Arena.ofConfined()) {
            VImage combined = null;
            int firstPageHeight = 0;
            for (int i = 0; i < pageCount; ++i) {
                BufferedImage pageBi = PageOps.renderPage(document, i, DPI);
                if (i == 0) {
                    firstPageHeight = pageBi.getHeight();
                }
                VImage pageVips = RenderingUtils.bufferedImageToVImage(arena, pageBi);
                if (combined == null) {
                    combined = pageVips;
                } else {
                    combined = combined.join(pageVips, VipsDirection.DIRECTION_VERTICAL);
                }
            }

            if ("tiff".equalsIgnoreCase(imageType) || "tif".equalsIgnoreCase(imageType)) {
                return RenderingUtils.vImageToBytes(
                        combined, imageType, VipsOption.Int("page_height", firstPageHeight));
            }
            return RenderingUtils.vImageToBytes(combined, imageType);
        }
    }

    public PDDocument convertPdfToPdfImage(PDDocument document) throws IOException {
        PDDocument imageDocument = new PDDocument();
        TempFileManager tempFileManager = ApplicationContextProvider.getBean(TempFileManager.class);
        TempFile pdfTempFile = new TempFile(tempFileManager, ".pdf");
        document.save(pdfTempFile.getFile());

        int renderDpi = 300;
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            renderDpi = properties.getSystem().getMaxDPI();
        }
        final int dpi = renderDpi;

        try {
            int pageCount = document.getNumberOfPages();
            for (int page = 0; page < pageCount; ++page) {
                final int pageIndex = page;

                // Native rendering from disk to PNG bytes then to PDF object
                byte[] pngBytes;
                try (Arena arena = Arena.ofConfined()) {
                    VImage vimg =
                            RenderingUtils.renderPageToVImage(
                                    arena, pdfTempFile.getPath(), pageIndex, dpi);
                    pngBytes = RenderingUtils.vImageToBytes(vimg, "png");
                }

                PDImageXObject pdImage =
                        PDImageXObject.createFromByteArray(imageDocument, pngBytes, "img");
                PDPage pdPage =
                        new PDPage(new PDRectangle(pdImage.getWidth(), pdImage.getHeight()));
                imageDocument.addPage(pdPage);

                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                imageDocument,
                                pdPage,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true)) {
                    contentStream.drawImage(pdImage, 0, 0, pdImage.getWidth(), pdImage.getHeight());
                }
            }
            PDDocument result = imageDocument;
            imageDocument = null;
            return result;
        } catch (Exception e) {
            throw new IOException("Error converting PDF to PDF-Image", e);
        } finally {
            if (imageDocument != null) {
                try {
                    imageDocument.close();
                } catch (Exception e) {
                    log.error("Error closing image document", e);
                }
            }
            pdfTempFile.close();
        }
    }

    public byte[] imageToPdf(
            MultipartFile[] files,
            String fitOption,
            boolean autoRotate,
            String colorType,
            CustomPDFDocumentFactory pdfDocumentFactory)
            throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (MultipartFile file : files) {
                try (InputStream inputStream = file.getInputStream();
                        Arena arena = Arena.ofConfined()) {
                    // High-fidelity load via libvips/ImageMagick
                    VImage vimg = RenderingUtils.loadAnyImage(arena, inputStream);

                    if (!"fullcolor".equalsIgnoreCase(colorType)) {
                        if ("greyscale".equalsIgnoreCase(colorType)) {
                            vimg = vimg.colourspace(VipsInterpretation.INTERPRETATION_B_W);
                        } else if ("blackwhite".equalsIgnoreCase(colorType)) {
                            vimg =
                                    vimg.colourspace(VipsInterpretation.INTERPRETATION_B_W)
                                            .relationalConst(
                                                    VipsOperationRelational
                                                            .OPERATION_RELATIONAL_MORE,
                                                    List.of(128.0))
                                            .cast(VipsBandFormat.FORMAT_UCHAR);
                        }
                    }

                    byte[] pngBytes = RenderingUtils.vImageToBytes(vimg, "png");
                    PDImageXObject pdImage =
                            PDImageXObject.createFromByteArray(doc, pngBytes, "img");
                    addImageToDocument(doc, pdImage, fitOption, autoRotate);
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    public void addImageToDocument(
            PDDocument doc, PDImageXObject image, String fitOption, boolean autoRotate)
            throws IOException {
        boolean imageIsLandscape = image.getWidth() > image.getHeight();
        PDRectangle pageSize = PDRectangle.A4;

        if (autoRotate && imageIsLandscape) {
            pageSize = new PDRectangle(pageSize.getHeight(), pageSize.getWidth());
        }

        if ("fitDocumentToImage".equalsIgnoreCase(fitOption)) {
            pageSize = new PDRectangle(image.getWidth(), image.getHeight());
        }

        PDPage page = new PDPage(pageSize);
        doc.addPage(page);

        float pageWidth = page.getMediaBox().getWidth();
        float pageHeight = page.getMediaBox().getHeight();

        try (PDPageContentStream contentStream =
                new PDPageContentStream(
                        doc, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            if ("fillPage".equalsIgnoreCase(fitOption)
                    || "fitDocumentToImage".equalsIgnoreCase(fitOption)) {
                contentStream.drawImage(image, 0, 0, pageWidth, pageHeight);
            } else if ("maintainAspectRatio".equalsIgnoreCase(fitOption)) {
                float imageAspectRatio = (float) image.getWidth() / (float) image.getHeight();
                float pageAspectRatio = pageWidth / pageHeight;

                float scaleFactor;
                if (imageAspectRatio > pageAspectRatio) {
                    scaleFactor = pageWidth / image.getWidth();
                } else {
                    scaleFactor = pageHeight / image.getHeight();
                }

                float xPos = (pageWidth - (image.getWidth() * scaleFactor)) / 2;
                float yPos = (pageHeight - (image.getHeight() * scaleFactor)) / 2;
                contentStream.drawImage(
                        image,
                        xPos,
                        yPos,
                        image.getWidth() * scaleFactor,
                        image.getHeight() * scaleFactor);
            } else {
                contentStream.drawImage(image, 0, 0, image.getWidth(), image.getHeight());
            }
        }
    }

    public byte[] overlayImage(
            Path pdfPath, InputStream imageStream, float x, float y, boolean everyPage)
            throws IOException {
        try (PDDocument document = Loader.loadPDF(pdfPath.toFile())) {
            byte[] pngBytes;
            try (Arena arena = Arena.ofConfined()) {
                // High-fidelity load
                VImage vimg = RenderingUtils.loadAnyImage(arena, imageStream);
                pngBytes = RenderingUtils.vImageToBytes(vimg, "png");
            }

            PDImageXObject pdImage =
                    PDImageXObject.createFromByteArray(document, pngBytes, "overlay");

            int pageCount = document.getNumberOfPages();
            for (int i = 0; i < pageCount; i++) {
                if (!everyPage && i > 0) break;

                PDPage page = document.getPage(i);
                try (PDPageContentStream contentStream =
                        new PDPageContentStream(
                                document,
                                page,
                                PDPageContentStream.AppendMode.APPEND,
                                true,
                                true)) {
                    contentStream.drawImage(pdImage, x, y);
                }
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    public static PDRectangle textToPageSize(String pageSize) {
        if (pageSize.contains("x")) {
            String[] parts = pageSize.split("x");
            return new PDRectangle(Float.parseFloat(parts[0]), Float.parseFloat(parts[1]));
        }
        return switch (pageSize.toUpperCase(Locale.ROOT)) {
            case "A0" -> PDRectangle.A0;
            case "A1" -> PDRectangle.A1;
            case "A2" -> PDRectangle.A2;
            case "A3" -> PDRectangle.A3;
            case "A4" -> PDRectangle.A4;
            case "A5" -> PDRectangle.A5;
            case "A6" -> PDRectangle.A6;
            case "LETTER" -> PDRectangle.LETTER;
            case "LEGAL" -> PDRectangle.LEGAL;
            default -> throw new IllegalArgumentException("Unsupported page size: " + pageSize);
        };
    }

    public static boolean pageCount(PDDocument document, int count, String comparator) {
        int pages = document.getNumberOfPages();
        return switch (comparator.toLowerCase(Locale.ROOT)) {
            case "greater" -> pages > count;
            case "equal" -> pages == count;
            case "less" -> pages < count;
            default -> throw new IllegalArgumentException("Unsupported comparator: " + comparator);
        };
    }

    public static boolean pageSize(PDDocument document, String pageSize) {
        PDRectangle targetSize = textToPageSize(pageSize);
        for (PDPage page : document.getPages()) {
            PDRectangle size = page.getMediaBox();
            if (Math.abs(size.getWidth() - targetSize.getWidth()) > 1
                    || Math.abs(size.getHeight() - targetSize.getHeight()) > 1) {
                return false;
            }
        }
        return true;
    }

    public static boolean hasImages(PDDocument document, String pagesToCheck) throws IOException {
        int pageCount = document.getNumberOfPages();
        if ("all".equalsIgnoreCase(pagesToCheck)) {
            for (int i = 0; i < pageCount; i++) {
                if (hasImagesOnPage(document.getPage(i))) return true;
            }
        } else {
            if (hasImagesOnPage(document.getPage(0))) return true;
        }
        return false;
    }

    public static boolean hasText(PDDocument document, String pagesToCheck, String text)
            throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        return stripper.getText(document).contains(text);
    }

    public static boolean hasImagesOnPage(PDPage page) throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) return false;
        for (COSName name : resources.getXObjectNames()) {
            if (resources.isImageXObject(name)) return true;
        }
        return false;
    }

    public static boolean hasTextOnPage(PDPage page, String text) throws IOException {
        try (PDDocument tempDoc = new PDDocument()) {
            tempDoc.addPage(page);
            PDFTextStripper stripper = new PDFTextStripper();
            return stripper.getText(tempDoc).contains(text);
        }
    }

    public static List<RenderedImage> getAllImages(PDResources resources) throws IOException {
        List<RenderedImage> images = new ArrayList<>();
        if (resources == null) return images;
        for (COSName name : resources.getXObjectNames()) {
            if (resources.isImageXObject(name)) {
                images.add(
                        ((org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject)
                                        resources.getXObject(name))
                                .getImage());
            }
        }
        return images;
    }
}

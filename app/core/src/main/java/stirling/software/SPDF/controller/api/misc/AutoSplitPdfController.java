package stirling.software.SPDF.controller.api.misc;

import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.google.zxing.*;
import com.google.zxing.common.GlobalHistogramBinarizer;
import com.google.zxing.common.HybridBinarizer;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AutoSplitPdfController {

    private static final Set<String> VALID_QR_CONTENTS =
            Set.of(
                    "https://github.com/Stirling-Tools/Stirling-PDF",
                    "https://github.com/Frooodle/Stirling-PDF",
                    "https://stirlingpdf.com");

    private static final int MAX_IMAGES_FOR_DIRECT_EXTRACTION = 3;

    // 150 DPI is sufficient for QR code detection — higher wastes memory and CPU
    private static final int QR_DETECTION_DPI = 150;

    // Max total pixels before we downscale to avoid OOM on getRGB() allocation
    private static final long MAX_IMAGE_PIXELS = 100_000_000L; // ~10000x10000

    // Number of evenly-spaced pixel samples used for the blank image check
    private static final int BLANK_CHECK_SAMPLES = 20;

    private static final Map<DecodeHintType, Object> DECODE_HINTS;

    static {
        DECODE_HINTS = new EnumMap<>(DecodeHintType.class);
        DECODE_HINTS.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
        DECODE_HINTS.put(DecodeHintType.ALSO_INVERTED, Boolean.TRUE);
        DECODE_HINTS.put(DecodeHintType.POSSIBLE_FORMATS, List.of(BarcodeFormat.QR_CODE));
    }

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final ApplicationProperties applicationProperties;

    /**
     * Downscale an image if it exceeds the maximum pixel count. Scales uniformly based on the
     * pixel-count ratio so both portrait and landscape images are handled correctly.
     */
    private static BufferedImage downscaleIfNeeded(BufferedImage image) {
        long totalPixels = (long) image.getWidth() * image.getHeight();
        if (totalPixels <= MAX_IMAGE_PIXELS) {
            return image;
        }
        double scale = Math.sqrt((double) MAX_IMAGE_PIXELS / totalPixels);
        int newWidth = Math.max(1, (int) (image.getWidth() * scale));
        int newHeight = Math.max(1, (int) (image.getHeight() * scale));
        log.debug(
                "Downscaling image from {}x{} to {}x{} for QR detection",
                image.getWidth(),
                image.getHeight(),
                newWidth,
                newHeight);
        BufferedImage scaled = new BufferedImage(newWidth, newHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = scaled.createGraphics();
        g.drawImage(image, 0, 0, newWidth, newHeight, null);
        g.dispose();
        return scaled;
    }

    /**
     * Quick check whether an image appears to be blank (single solid colour). Samples pixels at
     * evenly-spaced positions — if all samples match the first pixel the image is almost certainly
     * blank (e.g. a masked image that returned solid white).
     */
    private static boolean isBlankImage(int[] pixels) {
        if (pixels.length == 0) return true;
        int first = pixels[0];
        int step = Math.max(1, pixels.length / BLANK_CHECK_SAMPLES);
        for (int i = step; i < pixels.length; i += step) {
            if (pixels[i] != first) {
                return false;
            }
        }
        return true;
    }

    /**
     * Try to decode a QR code from pre-extracted RGB pixel data using multiple binarization
     * strategies. Returns the decoded text or null.
     *
     * <p>Strategy 1: HybridBinarizer — good for variable brightness (digital PDFs).
     *
     * <p>Strategy 2: GlobalHistogramBinarizer — better for scanned/noisy images with uniform
     * lighting, and for QR codes with embedded logos that confuse the hybrid approach.
     */
    private static String tryDecodeQR(int[] pixels, int width, int height) {
        RGBLuminanceSource source = new RGBLuminanceSource(width, height, pixels);
        MultiFormatReader reader = new MultiFormatReader();

        // Strategy 1: HybridBinarizer — good for variable brightness (digital PDFs)
        try {
            BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(source));
            Result result = reader.decode(bitmap, DECODE_HINTS);
            log.debug("QR detected via HybridBinarizer: '{}'", result.getText());
            return result.getText();
        } catch (NotFoundException e) {
            // continue
        }

        // Strategy 2: GlobalHistogramBinarizer — better for scanned/noisy images
        try {
            BinaryBitmap bitmap = new BinaryBitmap(new GlobalHistogramBinarizer(source));
            Result result = reader.decode(bitmap, DECODE_HINTS);
            log.debug("QR detected via GlobalHistogramBinarizer: '{}'", result.getText());
            return result.getText();
        } catch (NotFoundException e) {
            return null;
        }
    }

    /**
     * Attempt to decode a QR code from a BufferedImage. Handles downscaling for oversized images
     * and skips blank images early.
     */
    private static String decodeQRCode(BufferedImage bufferedImage) {
        bufferedImage = downscaleIfNeeded(bufferedImage);

        int width = bufferedImage.getWidth();
        int height = bufferedImage.getHeight();
        int[] pixels = new int[width * height];
        bufferedImage.getRGB(0, 0, width, height, pixels, 0, width);

        // Skip blank images early (e.g. masked images that decode to solid white)
        if (isBlankImage(pixels)) {
            log.debug("Skipping blank {}x{} image", width, height);
            return null;
        }

        return tryDecodeQR(pixels, width, height);
    }

    /** Count the number of images embedded in a page's resources. */
    private static int countPageImages(PDPage page) {
        if (page.getResources() == null || page.getResources().getXObjectNames() == null) {
            return 0;
        }
        int count = 0;
        for (COSName name : page.getResources().getXObjectNames()) {
            if (page.getResources().isImageXObject(name)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Extract images directly from a page's resources and check each for a QR code. Returns the QR
     * code text if found, null otherwise.
     */
    private static String checkPageImagesDirect(PDPage page) throws IOException {
        if (page.getResources() == null || page.getResources().getXObjectNames() == null) {
            return null;
        }
        for (COSName name : page.getResources().getXObjectNames()) {
            if (!page.getResources().isImageXObject(name)) {
                continue;
            }
            PDImageXObject imageObject = (PDImageXObject) page.getResources().getXObject(name);

            BufferedImage image;
            try {
                image = imageObject.getImage();
            } catch (OutOfMemoryError e) {
                log.warn(
                        "Skipping oversized embedded image '{}' ({}x{}) - out of memory",
                        name.getName(),
                        imageObject.getWidth(),
                        imageObject.getHeight());
                continue;
            }

            String result = decodeQRCode(image);
            if (result != null) {
                return result;
            }
        }
        return null;
    }

    /**
     * Render the full page to an image and scan it for a QR code. Tries a low DPI first (fast, low
     * memory) and only retries at the system's maxDPI if detection fails. The first rendered image
     * is released before the retry to allow GC to reclaim it.
     */
    private String checkPageByRendering(PDFRenderer pdfRenderer, int pageNum) throws IOException {
        log.debug("Rendering page {} at {} DPI for QR detection", pageNum + 1, QR_DETECTION_DPI);

        BufferedImage bim =
                ExceptionUtils.handleOomRendering(
                        pageNum + 1,
                        QR_DETECTION_DPI,
                        () -> pdfRenderer.renderImageWithDPI(pageNum, QR_DETECTION_DPI));
        String result = decodeQRCode(bim);
        bim = null; // allow GC before potential high-DPI retry

        if (result == null) {
            int maxDpi = getSystemMaxDpi();
            if (maxDpi > QR_DETECTION_DPI) {
                log.debug(
                        "Retrying page {} at {} DPI (low-DPI detection failed)",
                        pageNum + 1,
                        maxDpi);
                BufferedImage highRes =
                        ExceptionUtils.handleOomRendering(
                                pageNum + 1,
                                maxDpi,
                                () -> pdfRenderer.renderImageWithDPI(pageNum, maxDpi));
                result = decodeQRCode(highRes);
            }
        }
        return result;
    }

    private int getSystemMaxDpi() {
        if (applicationProperties != null && applicationProperties.getSystem() != null) {
            return applicationProperties.getSystem().getMaxDPI();
        }
        return QR_DETECTION_DPI;
    }

    @AutoJobPostMapping(value = "/auto-split-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @MultiFileResponse
    @Operation(
            summary = "Auto split PDF pages into separate documents",
            description =
                    "This endpoint accepts a PDF file, scans each page for a specific QR code, and"
                            + " splits the document at the QR code boundaries. The output is a zip"
                            + " file containing each separate PDF document. Input:PDF Output:ZIP-PDF"
                            + " Type:SISO")
    public ResponseEntity<StreamingResponseBody> autoSplitPdf(
            @ModelAttribute AutoSplitPdfRequest request) throws IOException {
        MultipartFile file = request.getFileInput();
        boolean duplexMode = Boolean.TRUE.equals(request.getDuplexMode());

        log.info(
                "Auto-split starting: filename='{}', size={} bytes, duplexMode={}",
                file.getOriginalFilename(),
                file.getSize(),
                duplexMode);

        List<PDDocument> splitDocuments = new ArrayList<>();
        TempFile outputTempFile = new TempFile(tempFileManager, ".zip");
        try (PDDocument document = pdfDocumentFactory.load(file.getInputStream())) {
            int totalPages = document.getNumberOfPages();
            log.info("PDF loaded, totalPages={}", totalPages);

            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);

            for (int page = 0; page < totalPages; ++page) {
                PDPage pdPage = document.getPage(page);
                int imageCount = countPageImages(pdPage);

                String qrResult;
                if (imageCount > 0 && imageCount <= MAX_IMAGES_FOR_DIRECT_EXTRACTION) {
                    // Try extracting images directly from the PDF (faster, avoids rendering)
                    qrResult = checkPageImagesDirect(pdPage);
                    if (qrResult == null) {
                        // Fall back to rendering — the image may use masking/compositing
                        // that getImage() doesn't resolve, or the QR may be vector-drawn
                        qrResult = checkPageByRendering(pdfRenderer, page);
                    }
                } else {
                    // Too many images or no images — render the full page
                    qrResult = checkPageByRendering(pdfRenderer, page);
                }

                boolean isValidQrCode = qrResult != null && VALID_QR_CONTENTS.contains(qrResult);
                if (isValidQrCode) {
                    log.info(
                            "Page {}/{} contains QR divider ('{}')",
                            page + 1,
                            totalPages,
                            qrResult);
                }

                if (isValidQrCode && page != 0) {
                    splitDocuments.add(new PDDocument());
                }

                if (!splitDocuments.isEmpty() && !isValidQrCode) {
                    splitDocuments.get(splitDocuments.size() - 1).addPage(document.getPage(page));
                } else if (page == 0) {
                    PDDocument firstDocument = new PDDocument();
                    firstDocument.addPage(document.getPage(page));
                    splitDocuments.add(firstDocument);
                }

                if (duplexMode && isValidQrCode) {
                    page++; // skip back of divider page
                }
            }

            splitDocuments.removeIf(pdDocument -> pdDocument.getNumberOfPages() == 0);
            log.info("Split complete, {} output documents", splitDocuments.size());

            String filename =
                    GeneralUtils.removeExtension(
                            Filenames.toSimpleFileName(file.getOriginalFilename()));

            // Stream split documents directly into zip — avoids holding all PDFs in memory
            try (OutputStream fileOut = Files.newOutputStream(outputTempFile.getPath());
                    ZipOutputStream zipOut = new ZipOutputStream(fileOut)) {
                for (int i = 0; i < splitDocuments.size(); i++) {
                    String fileName = filename + "_" + (i + 1) + ".pdf";
                    zipOut.putNextEntry(new ZipEntry(fileName));
                    splitDocuments.get(i).save(zipOut);
                    zipOut.closeEntry();
                }
            }

            return WebResponseUtils.zipFileToWebResponse(outputTempFile, filename + ".zip");

        } catch (Exception e) {
            outputTempFile.close();
            log.error("Error in auto split", e);
            throw e;
        } finally {
            for (PDDocument splitDoc : splitDocuments) {
                try {
                    splitDoc.close();
                } catch (IOException e) {
                    log.error("Error closing split PDDocument", e);
                }
            }
        }
    }
}

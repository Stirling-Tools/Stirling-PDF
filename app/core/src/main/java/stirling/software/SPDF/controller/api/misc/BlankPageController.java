package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.misc.RemoveBlankPagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class BlankPageController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    public static boolean isBlankImage(
            BufferedImage image, int threshold, double whitePercent, int blurSize) {
        if (image == null) {
            log.info("Error: Image is null");
            return false;
        }

        // Convert to binary image based on the threshold
        int whitePixels = 0;
        int width = image.getWidth();
        int height = image.getHeight();
        int[] pixels = new int[width * height];

        image.getRGB(0, 0, width, height, pixels, 0, width);

        for (int pixel : pixels) {
            int blue = pixel & 0xFF;
            if (blue >= 255 - threshold) {
                whitePixels++;
            }
        }

        double whitePixelPercentage = (whitePixels / (double) (width * height)) * 100;
        log.info(
                String.format(
                        Locale.ROOT,
                        "Page has white pixel percent of %.2f%%",
                        whitePixelPercentage));

        return whitePixelPercentage >= whitePercent;
    }

    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/remove-blanks")
    @Operation(
            summary = "Remove blank pages from a PDF file",
            description =
                    "This endpoint removes blank pages from a given PDF file. Users can specify the"
                            + " threshold and white percentage to tune the detection of blank pages."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<Resource> removeBlankPages(
            @ModelAttribute RemoveBlankPagesRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        int threshold = request.getThreshold();
        float whitePercent = request.getWhitePercent();

        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDFTextStripper textStripper = new PDFTextStripper();

            List<PDPage> nonBlankPages = new ArrayList<>();
            List<PDPage> blankPages = new ArrayList<>();
            int pageIndex = 0;

            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            for (PDPage page : pages) {
                log.info("checking page {}", pageIndex);
                textStripper.setStartPage(pageIndex + 1);
                textStripper.setEndPage(pageIndex + 1);
                String pageText = textStripper.getText(document);
                boolean hasText = !pageText.trim().isEmpty();

                boolean blank = true;
                if (hasText) {
                    log.info("page {} has text, not blank", pageIndex);
                    blank = false;
                } else {
                    boolean hasImages = PdfUtils.hasImagesOnPage(page);
                    if (hasImages) {
                        log.info("page {} has image, running blank detection", pageIndex);
                        // Render image and save as temp file
                        BufferedImage image;

                        // Use global maximum DPI setting
                        int renderDpi = 30; // Default fallback
                        ApplicationProperties properties =
                                ApplicationContextProvider.getBean(ApplicationProperties.class);
                        if (properties != null && properties.getSystem() != null) {
                            renderDpi = properties.getSystem().getMaxDPI();
                        }
                        final int dpi = renderDpi;
                        final int currentPageIndex = pageIndex;

                        image =
                                ExceptionUtils.handleOomRendering(
                                        currentPageIndex + 1,
                                        dpi,
                                        () ->
                                                pdfRenderer.renderImageWithDPI(
                                                        currentPageIndex, dpi));
                        blank = isBlankImage(image, threshold, whitePercent, threshold);
                    }
                }

                if (blank) {
                    log.info("Skipping, Image was  blank for page #{}", pageIndex);
                    blankPages.add(page);
                } else {
                    log.info("page {} has image which is not blank", pageIndex);
                    nonBlankPages.add(page);
                }

                pageIndex++;
            }

            String filename =
                    GeneralUtils.removeExtension(
                            Filenames.toSimpleFileName(inputFile.getOriginalFilename()));

            TempFile tempOut = tempFileManager.createManagedTempFile(".zip");
            try (OutputStream fos = Files.newOutputStream(tempOut.getFile().toPath());
                    ZipOutputStream zos = new ZipOutputStream(fos)) {
                if (!nonBlankPages.isEmpty()) {
                    createZipEntry(zos, nonBlankPages, filename + "_nonBlankPages.pdf");
                } else {
                    createZipEntry(zos, blankPages, filename + "_allBlankPages.pdf");
                }

                if (!nonBlankPages.isEmpty() && !blankPages.isEmpty()) {
                    createZipEntry(zos, blankPages, filename + "_blankPages.pdf");
                }
            } catch (IOException e) {
                tempOut.close();
                throw e;
            }

            log.info("Returning ZIP file: {}", filename + "_processed.zip");
            return WebResponseUtils.zipFileToWebResponse(tempOut, filename + "_processed.zip");

        } catch (ExceptionUtils.OutOfMemoryDpiException e) {
            throw e;
        } catch (IOException e) {
            log.error("exception", e);
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    public void createZipEntry(ZipOutputStream zos, List<PDPage> pages, String entryName)
            throws IOException {
        try (PDDocument document = pdfDocumentFactory.createNewDocument()) {

            for (PDPage page : pages) {
                document.addPage(page);
            }

            ZipEntry zipEntry = new ZipEntry(entryName);
            zos.putNextEntry(zipEntry);
            document.save(zos);
            zos.closeEntry();
        }
    }
}

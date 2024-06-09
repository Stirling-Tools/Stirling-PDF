package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.misc.RemoveBlankPagesRequest;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class BlankPageController {

    private static final Logger logger = LoggerFactory.getLogger(BlankPageController.class);

    @PostMapping(consumes = "multipart/form-data", value = "/remove-blanks")
    @Operation(
            summary = "Remove blank pages from a PDF file",
            description =
                    "This endpoint removes blank pages from a given PDF file. Users can specify the threshold and white percentage to tune the detection of blank pages. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> removeBlankPages(@ModelAttribute RemoveBlankPagesRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        int threshold = request.getThreshold();
        float whitePercent = request.getWhitePercent();

        PDDocument document = null;
        try {
            document = Loader.loadPDF(inputFile.getBytes());
            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDFTextStripper textStripper = new PDFTextStripper();

            List<Integer> pagesToKeepIndex = new ArrayList<>();
            int pageIndex = 0;
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            pdfRenderer.setSubsamplingAllowed(true);
            for (PDPage page : pages) {
                logger.info("checking page " + pageIndex);
                textStripper.setStartPage(pageIndex + 1);
                textStripper.setEndPage(pageIndex + 1);
                String pageText = textStripper.getText(document);
                boolean hasText = !pageText.trim().isEmpty();

                Boolean blank = true;
                if (hasText) {
                    logger.info("page " + pageIndex + " has text, not blank");
                    blank = false;
                } else {
                    boolean hasImages = PdfUtils.hasImagesOnPage(page);
                    if (hasImages) {
                        logger.info("page " + pageIndex + " has image, running blank detection");
                        // Render image and save as temp file
                        BufferedImage image = pdfRenderer.renderImageWithDPI(pageIndex, 30);
                        blank = isBlankImage(image, threshold, whitePercent, threshold);
                    }
                }

                if (blank) {
                    logger.info("Skipping, Image was  blank for page #" + pageIndex);
                } else {
                    logger.info("page " + pageIndex + " has image which is not blank");
                    pagesToKeepIndex.add(pageIndex);
                }

                pageIndex++;
            }
            // Remove pages not present in pagesToKeepIndex
            List<Integer> pageIndices =
                    IntStream.range(0, pages.getCount()).boxed().collect(Collectors.toList());
            Collections.reverse(pageIndices); // Reverse to prevent index shifting during removal
            for (Integer i : pageIndices) {
                if (!pagesToKeepIndex.contains(i)) {
                    pages.remove(i);
                }
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_blanksRemoved.pdf");
        } catch (IOException e) {
            logger.error("exception", e);
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        } finally {
            if (document != null) document.close();
        }
    }

    public static boolean isBlankImage(
            BufferedImage image, int threshold, double whitePercent, int blurSize) {
        if (image == null) {
            logger.info("Error: Image is null");
            return false;
        }

        // Convert to binary image based on the threshold
        int whitePixels = 0;
        int totalPixels = image.getWidth() * image.getHeight();

        for (int i = 0; i < image.getHeight(); i++) {
            for (int j = 0; j < image.getWidth(); j++) {
                int color = image.getRGB(j, i) & 0xFF;
                if (color >= 255 - threshold) {
                    whitePixels++;
                }
            }
        }

        double whitePixelPercentage = (whitePixels / (double) totalPixels) * 100;
        logger.info(String.format("Page has white pixel percent of %.2f%%", whitePixelPercentage));

        return whitePixelPercentage >= whitePercent;
    }
}

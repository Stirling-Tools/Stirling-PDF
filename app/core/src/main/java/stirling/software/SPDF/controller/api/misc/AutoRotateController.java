package stirling.software.SPDF.controller.api.misc;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.AutoRotateAnalysisResult;
import stirling.software.SPDF.model.api.misc.AutoRotateAnalysisResult.PageResult;
import stirling.software.SPDF.model.api.misc.AutoRotatePdfRequest;
import stirling.software.SPDF.utils.AutoRotateDetection;
import stirling.software.SPDF.utils.AutoRotateDetection.OsdResult;
import stirling.software.SPDF.utils.AutoRotateDetection.TextDirection;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class AutoRotateController {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    // OSD only needs to recognise script orientation, but sparse or small text still benefits
    // from OCR-grade resolution; matches the DPI the OCR tool renders at by default.
    private static final int OSD_RENDER_DPI = 300;

    private static final String METHOD_TEXT = "text";
    private static final String METHOD_OSD = "osd";
    private static final String METHOD_NONE = "none";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;
    private final RuntimePathConfig runtimePathConfig;
    private final ApplicationProperties applicationProperties;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/auto-rotate-pdf",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @Operation(
            summary = "Detect and fix the orientation of every page",
            description =
                    "Detects each page's orientation (embedded-text direction first, Tesseract OSD"
                            + " for scanned pages) and sets the page rotation so the content"
                            + " displays upright. With dryRun=true, returns a JSON per-page report"
                            + " instead of the PDF. With pageRotations set, applies the given"
                            + " corrections without running detection."
                            + " Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<?> autoRotatePdf(@ModelAttribute AutoRotatePdfRequest request)
            throws IOException, InterruptedException {
        String mode =
                request.getDetectionMode() == null
                        ? "auto"
                        : request.getDetectionMode().toLowerCase(Locale.ROOT);
        if (!"auto".equals(mode) && !"text".equals(mode) && !"osd".equals(mode)) {
            throw ExceptionUtils.createIllegalArgumentException(
                    ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                    "detectionMode",
                    "must be one of auto, text, osd");
        }

        try (PDDocument document = pdfDocumentFactory.load(request)) {
            if (request.getPageRotations() != null && !request.getPageRotations().isBlank()) {
                applyExplicitRotations(document, request.getPageRotations());
                return pdfResponse(document, request);
            }

            AutoRotateAnalysisResult analysis = analyse(document, mode, request);
            if (request.isDryRun()) {
                return ResponseEntity.ok(analysis);
            }
            for (PageResult pageResult : analysis.getPages()) {
                if (pageResult.isApply()) {
                    PDPage page = document.getPage(pageResult.getPageNumber() - 1);
                    page.setRotation(
                            Math.floorMod(page.getRotation() + pageResult.getCorrection(), 360));
                }
            }
            return pdfResponse(document, request);
        }
    }

    private AutoRotateAnalysisResult analyse(
            PDDocument document, String mode, AutoRotatePdfRequest request)
            throws IOException, InterruptedException {
        double threshold =
                request.getConfidenceThreshold() == null ? 14.0 : request.getConfidenceThreshold();
        boolean tesseractAvailable = endpointConfiguration.isGroupEnabled("tesseract");
        boolean useText = !"osd".equals(mode);
        boolean useOsd = !"text".equals(mode);

        List<PageResult> results = new ArrayList<>();
        List<Integer> osdCandidates = new ArrayList<>();

        int pageCount = document.getNumberOfPages();
        for (int i = 0; i < pageCount; i++) {
            int currentRotation = Math.floorMod(document.getPage(i).getRotation(), 360);
            PageResult result =
                    PageResult.builder()
                            .pageNumber(i + 1)
                            .currentRotation(currentRotation)
                            .method(METHOD_NONE)
                            .build();

            if (useText) {
                TextDirection direction = AutoRotateDetection.detectTextDirection(document, i);
                if (direction.isConclusive()) {
                    int correction =
                            AutoRotateDetection.correctionFromTextDirection(
                                    direction.dominantDirection(), currentRotation);
                    result.setMethod(METHOD_TEXT);
                    result.setCorrection(correction);
                    result.setConfidence(direction.dominance() * 100);
                    result.setApply(correction != 0);
                } else if (!useOsd) {
                    result.setNote(
                            direction.glyphCount() < AutoRotateDetection.MIN_GLYPHS
                                    ? "tooFewGlyphs"
                                    : "noDominantDirection");
                }
            }

            if (useOsd && METHOD_NONE.equals(result.getMethod())) {
                if (tesseractAvailable) {
                    osdCandidates.add(i);
                } else {
                    result.setNote("tesseractUnavailable");
                }
            }
            results.add(result);
        }

        if (!osdCandidates.isEmpty()) {
            runOsdOnPages(document, osdCandidates, results, threshold);
        }

        return summarise(results, pageCount);
    }

    private void runOsdOnPages(
            PDDocument document,
            List<Integer> pageIndexes,
            List<PageResult> results,
            double threshold)
            throws IOException, InterruptedException {
        String tessDataPath = runtimePathConfig.getTessDataPath();
        boolean haveOsdData =
                tessDataPath != null && new File(tessDataPath, "osd.traineddata").exists();

        int dpi = OSD_RENDER_DPI;
        if (applicationProperties != null && applicationProperties.getSystem() != null) {
            dpi = Math.min(OSD_RENDER_DPI, applicationProperties.getSystem().getMaxDPI());
        }
        final int renderDpi = dpi;

        try (TempDirectory tempDir = new TempDirectory(tempFileManager)) {
            PDFRenderer renderer = new PDFRenderer(document);
            renderer.setSubsamplingAllowed(true);

            for (int pageIndex : pageIndexes) {
                PageResult result = results.get(pageIndex);
                try {
                    // Rendering honours the page's current /Rotate, so OSD sees the page exactly
                    // as a viewer would and its verdict is always an additive correction.
                    var image =
                            ExceptionUtils.handleOomRendering(
                                    pageIndex + 1,
                                    renderDpi,
                                    () ->
                                            renderer.renderImageWithDPI(
                                                    pageIndex, renderDpi, ImageType.GRAY));
                    File imageFile =
                            new File(
                                    tempDir.getPath().toFile(),
                                    String.format(Locale.ROOT, "page_%d.png", pageIndex));
                    ImageIO.write(image, "png", imageFile);

                    List<String> command = new ArrayList<>();
                    command.add("tesseract");
                    command.add(imageFile.getAbsolutePath());
                    command.add("stdout");
                    command.add("--psm");
                    command.add("0");
                    if (haveOsdData) {
                        command.add("--tessdata-dir");
                        command.add(tessDataPath);
                    }

                    ProcessExecutorResult processResult =
                            ProcessExecutor.getInstance(ProcessExecutor.Processes.TESSERACT)
                                    .runCommandWithOutputHandling(command);

                    Optional<OsdResult> osd =
                            AutoRotateDetection.parseOsd(processResult.getMessages());
                    if (osd.isEmpty()) {
                        result.setNote("osdNoVerdict");
                        continue;
                    }
                    result.setConfidence(osd.get().confidence());
                    result.setCorrection(osd.get().rotate());
                    if (osd.get().confidence() >= threshold) {
                        result.setMethod(METHOD_OSD);
                        result.setApply(osd.get().rotate() != 0);
                    } else {
                        result.setNote("belowThreshold");
                    }
                } catch (IOException e) {
                    // Blank or textless pages make Tesseract exit non-zero; skip, never guess.
                    log.debug("OSD failed for page {}: {}", pageIndex + 1, e.getMessage());
                    result.setNote("osdFailed");
                }
            }
        }
    }

    private void applyExplicitRotations(PDDocument document, String pageRotationsJson)
            throws IOException {
        Map<Integer, Integer> rotations;
        try {
            rotations =
                    OBJECT_MAPPER.readValue(
                            pageRotationsJson, new TypeReference<Map<Integer, Integer>>() {});
        } catch (IOException e) {
            throw ExceptionUtils.createIllegalArgumentException(
                    ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                    "pageRotations",
                    "must be a JSON object of page number to angle");
        }
        int pageCount = document.getNumberOfPages();
        for (Map.Entry<Integer, Integer> entry : rotations.entrySet()) {
            int pageNumber = entry.getKey();
            int angle = entry.getValue();
            if (pageNumber < 1 || pageNumber > pageCount || angle % 90 != 0) {
                throw ExceptionUtils.createIllegalArgumentException(
                        ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                        "pageRotations",
                        "page numbers must exist and angles must be multiples of 90");
            }
            PDPage page = document.getPage(pageNumber - 1);
            page.setRotation(Math.floorMod(page.getRotation() + angle, 360));
        }
    }

    private AutoRotateAnalysisResult summarise(List<PageResult> results, int pageCount) {
        int toRotate = 0;
        int byText = 0;
        int byOsd = 0;
        int undetected = 0;
        for (PageResult result : results) {
            if (result.isApply()) {
                toRotate++;
            }
            switch (result.getMethod()) {
                case METHOD_TEXT -> byText++;
                case METHOD_OSD -> byOsd++;
                default -> undetected++;
            }
        }
        return AutoRotateAnalysisResult.builder()
                .pages(results)
                .totalPages(pageCount)
                .pagesToRotate(toRotate)
                .detectedByText(byText)
                .detectedByOsd(byOsd)
                .undetected(undetected)
                .build();
    }

    private ResponseEntity<?> pdfResponse(PDDocument document, AutoRotatePdfRequest request)
            throws IOException {
        String originalName =
                request.getFileInput() != null
                        ? request.getFileInput().getOriginalFilename()
                        : "document.pdf";
        return WebResponseUtils.pdfDocToWebResponse(
                document,
                GeneralUtils.generateFilename(originalName, "_auto_rotated.pdf"),
                tempFileManager);
    }
}

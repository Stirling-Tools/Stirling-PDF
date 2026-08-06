package stirling.software.SPDF.controller.api.misc;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.AutoRotateAnalysisResult;
import stirling.software.SPDF.model.api.misc.AutoRotateAnalysisResult.PageResult;
import stirling.software.SPDF.model.api.misc.AutoRotatePdfRequest;
import stirling.software.SPDF.model.api.misc.PageRotation;
import stirling.software.SPDF.utils.AutoRotateDetection;
import stirling.software.SPDF.utils.AutoRotateDetection.OsdResult;
import stirling.software.SPDF.utils.AutoRotateDetection.TextDirection;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
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

    // OSD decides orientation from script shape, not character identity, so it does not need
    // OCR-grade resolution. 150 DPI is ample for that and a quarter of the pixels of 300.
    private static final int OSD_RENDER_DPI = 150;

    private static final String METHOD_TEXT = "text";
    private static final String METHOD_OSD = "osd";
    private static final String METHOD_INFERRED = "inferred";
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
    @ToolIO(
            produces = ToolFormat.PDF,
            cases =
                    @ToolIOCase(
                            when = @ToolIOWhen(param = "dryRun", matches = "true"),
                            produces = ToolFormat.JSON,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Detect and fix the orientation of every page",
            description =
                    "Detects each page's orientation (embedded-text direction first, Tesseract OSD"
                            + " for scanned pages) and sets the page rotation so the content"
                            + " displays upright. With dryRun=true, returns a JSON per-page report"
                            + " instead of the PDF. With pageRotations set, applies the given"
                            + " corrections without running detection.")
    public ResponseEntity<?> autoRotatePdf(@Valid @ModelAttribute AutoRotatePdfRequest request)
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
            if (request.getPageRotations() != null && !request.getPageRotations().isEmpty()) {
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
        // One walk of the document for all pages, rather than one walk per page.
        List<TextDirection> textDirections =
                useText ? AutoRotateDetection.detectTextDirections(document) : List.of();

        for (int i = 0; i < pageCount; i++) {
            int currentRotation = Math.floorMod(document.getPage(i).getRotation(), 360);
            PageResult result =
                    PageResult.builder()
                            .pageNumber(i + 1)
                            .currentRotation(currentRotation)
                            .method(METHOD_NONE)
                            .build();

            if (useText) {
                TextDirection direction = textDirections.get(i);
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

        if (request.isInferUndetected()) {
            inferUndetectedPages(results);
        }

        return summarise(results, pageCount);
    }

    /**
     * Fill in pages that no signal could decide, using the pages that could. When every decided
     * page sharing an undecided page's current rotation agrees on one correction, that correction
     * is the document's consensus for that rotation and is applied to the undecided page. This is
     * the common "whole document rotated uniformly, but a cover or near-blank page has too little
     * text to detect on its own" case. If decided pages disagree, nothing is inferred.
     */
    private void inferUndetectedPages(List<PageResult> results) {
        // rotation -> the single agreed correction, or null once a conflict is seen
        Map<Integer, Integer> consensus = new HashMap<>();
        Set<Integer> conflicted = new HashSet<>();
        for (PageResult result : results) {
            if (METHOD_NONE.equals(result.getMethod())) {
                continue;
            }
            int rotation = result.getCurrentRotation();
            if (conflicted.contains(rotation)) {
                continue;
            }
            Integer existing = consensus.get(rotation);
            if (existing == null) {
                consensus.put(rotation, result.getCorrection());
            } else if (existing != result.getCorrection()) {
                conflicted.add(rotation);
                consensus.remove(rotation);
            }
        }

        for (PageResult result : results) {
            if (!METHOD_NONE.equals(result.getMethod())) {
                continue;
            }
            Integer correction = consensus.get(result.getCurrentRotation());
            if (correction == null) {
                continue;
            }
            result.setMethod(METHOD_INFERRED);
            result.setCorrection(correction);
            result.setConfidence(null);
            result.setApply(correction != 0);
            result.setNote("inferredFromDocument");
        }
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
            // One reused path, deleted after every page: the images are throwaway input for
            // Tesseract, so a long document must not accumulate one file per page on disk.
            File imageFile = new File(tempDir.getPath().toFile(), "osd-page.bmp");

            for (int pageIndex : pageIndexes) {
                PageResult result = results.get(pageIndex);
                try {
                    // Rendering honours the page's current /Rotate, so OSD sees the page exactly
                    // as a viewer would and its verdict is always an additive correction.
                    BufferedImage image =
                            ExceptionUtils.handleOomRendering(
                                    pageIndex + 1,
                                    renderDpi,
                                    () ->
                                            renderer.renderImageWithDPI(
                                                    pageIndex, renderDpi, ImageType.GRAY));

                    if (AutoRotateDetection.isBlankRender(image)) {
                        // Nothing for OSD to read; skip the process spawn entirely.
                        result.setNote("blankPage");
                        continue;
                    }

                    // BMP, not PNG: the file is deleted straight after Tesseract reads it, so
                    // paying for compression only to discard the result is wasted work.
                    ImageIO.write(image, "bmp", imageFile);

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
                    // Textless pages make Tesseract exit non-zero; skip, never guess.
                    log.debug("OSD failed for page {}: {}", pageIndex + 1, e.getMessage());
                    result.setNote("osdFailed");
                } finally {
                    Files.deleteIfExists(imageFile.toPath());
                }
            }
        }
    }

    private void applyExplicitRotations(PDDocument document, List<PageRotation> rotations) {
        int pageCount = document.getNumberOfPages();
        Set<Integer> seen = new HashSet<>();
        for (PageRotation entry : rotations) {
            Integer pageNumber = entry.getPageNumber();
            Integer angle = entry.getRotation();
            if (pageNumber == null
                    || angle == null
                    || pageNumber < 1
                    || pageNumber > pageCount
                    || angle % 90 != 0) {
                throw ExceptionUtils.createIllegalArgumentException(
                        ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                        "pageRotations",
                        "page numbers must exist and rotations must be multiples of 90");
            }
            // Rotations are additive, so a repeated page would be turned twice; reject rather
            // than silently pick a winner.
            if (!seen.add(pageNumber)) {
                throw ExceptionUtils.createIllegalArgumentException(
                        ExceptionUtils.ErrorCode.INVALID_ARGUMENT,
                        "pageRotations",
                        "page " + pageNumber + " is listed more than once");
            }
            PDPage page = document.getPage(pageNumber - 1);
            page.setRotation(Math.floorMod(page.getRotation() + angle, 360));
        }
    }

    private AutoRotateAnalysisResult summarise(List<PageResult> results, int pageCount) {
        int toRotate = 0;
        int byText = 0;
        int byOsd = 0;
        int byInference = 0;
        int undetected = 0;
        for (PageResult result : results) {
            if (result.isApply()) {
                toRotate++;
            }
            switch (result.getMethod()) {
                case METHOD_TEXT -> byText++;
                case METHOD_OSD -> byOsd++;
                case METHOD_INFERRED -> byInference++;
                default -> undetected++;
            }
        }
        return AutoRotateAnalysisResult.builder()
                .pages(results)
                .totalPages(pageCount)
                .pagesToRotate(toRotate)
                .detectedByText(byText)
                .detectedByOsd(byOsd)
                .inferred(byInference)
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

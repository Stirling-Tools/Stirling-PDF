package stirling.software.SPDF.controller.api.converters;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.converters.PdfToVideoRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempDirectory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
@Slf4j
public class ConvertPdfToVideoController {

    private static final Set<String> SUPPORTED_FORMATS = Set.of("mp4", "webm");
    private static final Map<String, String> RESOLUTION_FILTERS =
            Map.of(
                    "ORIGINAL", "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1",
                    "1080P", "scale=-2:1080,setsar=1",
                    "720P", "scale=-2:720,setsar=1",
                    "480P", "scale=-2:480,setsar=1");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/video")
    @Operation(
            summary = "Convert PDF to video",
            description =
                    "This endpoint converts a PDF document into a slideshow-style video."
                            + " Input:PDF Output:Video Type:SISO")
    public ResponseEntity<byte[]> convertPdfToVideo(@ModelAttribute PdfToVideoRequest request)
            throws Exception {
        if (!CheckProgramInstall.isFfmpegAvailable()) {
            throw ExceptionUtils.createFfmpegRequiredException();
        }

        MultipartFile inputFile = request.getFileInput();
        if (inputFile == null || inputFile.isEmpty()) {
            throw ExceptionUtils.createPdfFileRequiredException();
        }
        if (!MediaType.APPLICATION_PDF_VALUE.equals(inputFile.getContentType())) {
            return new ResponseEntity<>(HttpStatus.BAD_REQUEST);
        }

        String format = normalizeFormat(request.getVideoFormat());
        int secondsPerPage = request.getSecondsPerPage() != null ? request.getSecondsPerPage() : 3;
        if (secondsPerPage <= 0) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat",
                    "Invalid {0} format: {1}",
                    "secondsPerPage",
                    secondsPerPage);
        }
        int dpi = request.getDpi() != null ? request.getDpi() : 150;
        int maxDpi = getMaxDpi();
        if (dpi > maxDpi) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.dpiExceedsLimit",
                    "DPI value {0} exceeds maximum safe limit of {1}.",
                    dpi,
                    maxDpi);
        }
        if (dpi < 72) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.invalidFormat", "Invalid {0} format: {1}", "dpi", dpi);
        }

        String resolution =
                request.getResolution() != null
                        ? request.getResolution().toUpperCase(Locale.ROOT)
                        : "ORIGINAL";
        if (!RESOLUTION_FILTERS.containsKey(resolution)) {
            resolution = "ORIGINAL";
        }

        String originalPdfFileName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalPdfFileName == null || originalPdfFileName.isBlank()) {
            originalPdfFileName = "document.pdf";
        }
        String pdfBaseName =
                originalPdfFileName.contains(".")
                        ? originalPdfFileName.substring(0, originalPdfFileName.lastIndexOf('.'))
                        : originalPdfFileName;

        try (TempFile inputTempFile = new TempFile(tempFileManager, ".pdf");
                TempDirectory framesDirectory = new TempDirectory(tempFileManager);
                TempFile outputVideo = new TempFile(tempFileManager, "." + format)) {

            inputFile.transferTo(inputTempFile.getFile());

            generateFrames(inputTempFile.getPath(), framesDirectory.getPath(), dpi);

            DecimalFormat decimalFormat =
                    new DecimalFormat("0.######", DecimalFormatSymbols.getInstance(Locale.ROOT));
            String frameRate = decimalFormat.format(1.0d / secondsPerPage);
            List<String> command = buildFfmpegCommand(format, resolution, frameRate, outputVideo);

            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.FFMPEG)
                            .runCommandWithOutputHandling(
                                    command, framesDirectory.getPath().toFile());
            log.info("FFmpeg conversion logs: {}", result.getMessages());

            byte[] videoBytes = Files.readAllBytes(outputVideo.getPath());
            MediaType mediaType = getMediaType(format);
            String outputName = pdfBaseName + "-video." + format;
            return WebResponseUtils.bytesToWebResponse(videoBytes, outputName, mediaType);
        }
    }

    private void generateFrames(Path inputPdf, Path outputDir, int dpi) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(inputPdf.toFile())) {
            PDFRenderer renderer = new PDFRenderer(document);
            renderer.setSubsamplingAllowed(true);
            int pageCount = document.getNumberOfPages();
            if (pageCount == 0) {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat", "Invalid {0} format: {1}", "PDF", "no pages");
            }
            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                BufferedImage image = renderer.renderImageWithDPI(pageIndex, dpi, ImageType.RGB);
                Path framePath =
                        outputDir.resolve(
                                String.format(Locale.ROOT, "frame_%05d.png", pageIndex + 1));
                ImageIO.write(image, "png", framePath.toFile());
            }
        }
    }

    private List<String> buildFfmpegCommand(
            String format, String resolution, String frameRate, TempFile outputVideo) {
        List<String> command = new ArrayList<>();
        command.add("ffmpeg");
        command.add("-y");
        command.add("-framerate");
        command.add(frameRate);
        command.add("-i");
        command.add("frame_%05d.png");
        command.add("-vf");
        command.add(
                RESOLUTION_FILTERS.getOrDefault(resolution, RESOLUTION_FILTERS.get("ORIGINAL")));
        if ("mp4".equals(format)) {
            command.addAll(
                    List.of("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"));
        } else if ("webm".equals(format)) {
            command.addAll(List.of("-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30"));
        }
        command.add(outputVideo.getFile().getName());
        return command;
    }

    private String normalizeFormat(String requestedFormat) {
        String format = requestedFormat != null ? requestedFormat.toLowerCase(Locale.ROOT) : "mp4";
        if (!SUPPORTED_FORMATS.contains(format)) {
            format = "mp4";
        }
        return format;
    }

    private int getMaxDpi() {
        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        if (properties != null && properties.getSystem() != null) {
            return properties.getSystem().getMaxDPI();
        }
        return 500;
    }

    private MediaType getMediaType(String format) {
        return switch (format) {
            case "webm" -> MediaType.valueOf("video/webm");
            default -> MediaType.valueOf("video/mp4");
        };
    }
}

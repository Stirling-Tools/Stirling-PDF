package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.apache.commons.io.FilenameUtils;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.PdfVectorExportRequest;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Slf4j
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
public class PdfVectorExportController {

    private static final MediaType PDF_MEDIA_TYPE = MediaType.APPLICATION_PDF;
    private static final Set<String> GHOSTSCRIPT_INPUTS =
            Set.of("ps", "eps", "epsf"); // PCL/PXL/XPS require GhostPDL (gpcl6/gxps)

    private final TempFileManager tempFileManager;
    private final EndpointConfiguration endpointConfiguration;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/vector/pdf")
    @Operation(
            summary = "Convert PostScript formats to PDF",
            description =
                    "Converts PostScript vector inputs (PS, EPS, EPSF) to PDF using Ghostscript."
                            + " Input:PS/EPS Output:PDF Type:SISO")
    public ResponseEntity<byte[]> convertGhostscriptInputsToPdf(
            @Valid @ModelAttribute PdfVectorExportRequest request) throws Exception {

        String originalName =
                request.getFileInput() != null
                        ? request.getFileInput().getOriginalFilename()
                        : null;
        String extension =
                originalName != null
                        ? FilenameUtils.getExtension(originalName).toLowerCase(Locale.ROOT)
                        : "";

        try (TempFile inputTemp =
                        new TempFile(tempFileManager, extension.isEmpty() ? "" : "." + extension);
                TempFile outputTemp = new TempFile(tempFileManager, ".pdf")) {

            request.getFileInput().transferTo(inputTemp.getFile());

            if (GHOSTSCRIPT_INPUTS.contains(extension)) {
                boolean prepress = request.getPrepress() != null && request.getPrepress();
                runGhostscriptToPdf(inputTemp.getPath(), outputTemp.getPath(), prepress);
            } else if ("pdf".equals(extension)) {
                Files.copy(
                        inputTemp.getPath(),
                        outputTemp.getPath(),
                        StandardCopyOption.REPLACE_EXISTING);
            } else {
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat",
                        "Unsupported Ghostscript input format {0}",
                        extension);
            }

            byte[] pdfBytes = Files.readAllBytes(outputTemp.getPath());
            String outputName = GeneralUtils.generateFilename(originalName, "_converted.pdf");
            return WebResponseUtils.bytesToWebResponse(pdfBytes, outputName, PDF_MEDIA_TYPE);
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/vector")
    @Operation(
            summary = "Convert PDF to vector format",
            description =
                    "Converts PDF to Ghostscript vector formats (EPS, PS, PCL, or XPS)."
                            + " Input:PDF Output:VECTOR Type:SISO")
    public ResponseEntity<byte[]> convertPdfToVector(
            @Valid @ModelAttribute PdfVectorExportRequest request) throws Exception {

        String originalName =
                request.getFileInput() != null
                        ? request.getFileInput().getOriginalFilename()
                        : null;

        String outputFormat = request.getOutputFormat();
        if (outputFormat == null || outputFormat.isEmpty()) {
            outputFormat = "eps";
        }
        outputFormat = outputFormat.toLowerCase(Locale.ROOT);

        try (TempFile inputTemp = new TempFile(tempFileManager, ".pdf");
                TempFile outputTemp = new TempFile(tempFileManager, "." + outputFormat)) {

            request.getFileInput().transferTo(inputTemp.getFile());

            runGhostscriptPdfToVector(inputTemp.getPath(), outputTemp.getPath(), outputFormat);

            byte[] vectorBytes = Files.readAllBytes(outputTemp.getPath());
            String outputName =
                    GeneralUtils.generateFilename(originalName, "_converted." + outputFormat);

            MediaType mediaType;
            switch (outputFormat.toLowerCase(Locale.ROOT)) {
                case "eps":
                case "ps":
                    mediaType = MediaType.parseMediaType("application/postscript");
                    break;
                case "pcl":
                    mediaType = MediaType.parseMediaType("application/vnd.hp-PCL");
                    break;
                case "xps":
                    mediaType = MediaType.parseMediaType("application/vnd.ms-xpsdocument");
                    break;
                default:
                    mediaType = MediaType.APPLICATION_OCTET_STREAM;
            }

            return WebResponseUtils.bytesToWebResponse(vectorBytes, outputName, mediaType);
        }
    }

    private void runGhostscriptPdfToVector(Path inputPath, Path outputPath, String outputFormat)
            throws IOException, InterruptedException {
        if (!endpointConfiguration.isGroupEnabled("Ghostscript")) {
            throw ExceptionUtils.createGhostscriptConversionException(outputFormat);
        }

        List<String> command = new ArrayList<>();
        command.add("gs");

        // Set device based on output format
        String device;
        switch (outputFormat.toLowerCase(Locale.ROOT)) {
            case "eps":
                device = "eps2write";
                break;
            case "ps":
                device = "ps2write";
                break;
            case "pcl":
                device = "pxlcolor"; // PCL XL color
                break;
            case "xps":
                device = "xpswrite";
                break;
            default:
                throw ExceptionUtils.createIllegalArgumentException(
                        "error.invalidFormat", "Unsupported output format: {0}", outputFormat);
        }

        command.add("-sDEVICE=" + device);
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-dSAFER");
        command.add("-sOutputFile=" + outputPath.toAbsolutePath());
        command.add(inputPath.toAbsolutePath().toString());

        log.debug("Executing Ghostscript command: {}", String.join(" ", command));

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(command);

        if (result.getRc() != 0) {
            log.error(
                    "Ghostscript PDF to {} conversion failed with rc={} and messages={}. Command: {}",
                    outputFormat.toUpperCase(),
                    result.getRc(),
                    result.getMessages(),
                    String.join(" ", command));
            throw ExceptionUtils.createGhostscriptConversionException(outputFormat);
        }
    }

    private void runGhostscriptToPdf(Path inputPath, Path outputPath, boolean prepress)
            throws IOException, InterruptedException {
        if (!endpointConfiguration.isGroupEnabled("Ghostscript")) {
            throw ExceptionUtils.createGhostscriptConversionException("pdfwrite");
        }

        List<String> command = new ArrayList<>();
        command.add("gs");
        command.add("-sDEVICE=pdfwrite");
        command.add("-dNOPAUSE");
        command.add("-dBATCH");
        command.add("-dSAFER");
        command.add("-dCompatibilityLevel=1.4");

        if (prepress) {
            command.add("-dPDFSETTINGS=/prepress");
        }

        command.add("-sOutputFile=" + outputPath.toAbsolutePath());
        command.add(inputPath.toAbsolutePath().toString());

        log.debug("Executing Ghostscript PostScript-to-PDF command: {}", String.join(" ", command));

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(command);

        if (result.getRc() != 0) {
            log.error(
                    "Ghostscript PostScript-to-PDF conversion failed with rc={} and messages={}. Command: {}",
                    result.getRc(),
                    result.getMessages(),
                    String.join(" ", command));
            throw ExceptionUtils.createGhostscriptConversionException("pdfwrite");
        }
    }
}

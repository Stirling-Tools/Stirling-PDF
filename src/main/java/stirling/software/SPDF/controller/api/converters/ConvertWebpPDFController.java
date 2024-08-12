package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.commons.io.FileUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;

@RestController
@Slf4j
@RequestMapping("/api/v1/convert")
public class ConvertWebpPDFController {

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/webp")
    public ResponseEntity<byte[]> convertToWebp(@ModelAttribute ConvertToImageRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        String dpi = request.getDpi();
        String quality = request.getQuality();

        String fileName =
                Filenames.toSimpleFileName(file.getOriginalFilename())
                        .replaceFirst("[.][^.]+$", "");

        // Save the uploaded PDF to a temporary file
        Path tempPdfPath = Files.createTempFile("temp_pdf", ".pdf");
        file.transferTo(tempPdfPath.toFile());

        // Create a temporary directory for the output WebP files
        Path tempOutputDir = Files.createTempDirectory("webp_output");
        String pythonVersion = "python3";
        try {
            ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                    .runCommandWithOutputHandling(Arrays.asList("python3", "--version"));
        } catch (IOException e) {
            ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                    .runCommandWithOutputHandling(Arrays.asList("python", "--version"));
            pythonVersion = "python";
        }
        // Run the Python script to convert PDF to WebP
        List<String> command =
                Arrays.asList(
                        pythonVersion,
                        "./scripts/png_to_webp.py", // Python script to handle the conversion
                        tempPdfPath.toString(),
                        tempOutputDir.toString(),
                        "--quality",
                        quality,
                        "--dpi",
                        dpi);

        ProcessExecutorResult result =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV)
                        .runCommandWithOutputHandling(command);

        // Find all WebP files in the output directory
        List<Path> webpFiles =
                Files.walk(tempOutputDir)
                        .filter(path -> path.toString().endsWith(".webp"))
                        .collect(Collectors.toList());

        if (webpFiles.isEmpty()) {
            log.error("No WebP files were created in: {}", tempOutputDir.toString());
            throw new IOException("No WebP files were created.");
        }

        HttpHeaders headers = new HttpHeaders();

        byte[] bodyBytes = new byte[0];

        if (webpFiles.size() == 1) {
            // Return the single WebP file directly
            Path webpFilePath = webpFiles.get(0);
            bodyBytes = Files.readAllBytes(webpFilePath);
            headers.add(
                    HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + fileName + ".webp\"");
        } else {
            // Create a ZIP file containing all WebP images
            ByteArrayOutputStream zipOutputStream = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(zipOutputStream)) {
                for (Path webpFile : webpFiles) {
                    zos.putNextEntry(new ZipEntry(webpFile.getFileName().toString()));
                    Files.copy(webpFile, zos);
                    zos.closeEntry();
                }
            }
            bodyBytes = zipOutputStream.toByteArray();
            headers.add(
                    HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"" + fileName + "_webp.zip\"");
        }
        // Clean up the temporary files
        Files.deleteIfExists(tempPdfPath);
        if (tempOutputDir != null) FileUtils.deleteDirectory(tempOutputDir.toFile());
        return ResponseEntity.ok().headers(headers).body(bodyBytes);
    }
}

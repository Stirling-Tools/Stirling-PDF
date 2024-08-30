package stirling.software.SPDF.controller.api.misc;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.springframework.beans.factory.annotation.Autowired;
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

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
public class OCRController {

    @Autowired ApplicationProperties applicationProperties;

    public List<String> getAvailableTesseractLanguages() {
        String tessdataDir = applicationProperties.getSystem().getTessdataDir();
        File[] files = new File(tessdataDir).listFiles();
        if (files == null) {
            return Collections.emptyList();
        }
        return Arrays.stream(files)
                .filter(file -> file.getName().endsWith(".traineddata"))
                .map(file -> file.getName().replace(".traineddata", ""))
                .filter(lang -> !lang.equalsIgnoreCase("osd"))
                .collect(Collectors.toList());
    }

    @PostMapping(consumes = "multipart/form-data", value = "/ocr-pdf")
    @Operation(
            summary = "Process a PDF file with OCR",
            description =
                    "This endpoint processes a PDF file using OCR (Optical Character Recognition). Users can specify languages, sidecar, deskew, clean, cleanFinal, ocrType, ocrRenderType, and removeImagesAfter options. Input:PDF Output:PDF Type:SI-Conditional")
    public ResponseEntity<byte[]> processPdfWithOCR(
            @ModelAttribute ProcessPdfWithOcrRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        List<String> selectedLanguages = request.getLanguages();
        Boolean sidecar = request.isSidecar();
        Boolean deskew = request.isDeskew();
        Boolean clean = request.isClean();
        Boolean cleanFinal = request.isCleanFinal();
        String ocrType = request.getOcrType();
        String ocrRenderType = request.getOcrRenderType();
        Boolean removeImagesAfter = request.isRemoveImagesAfter();
        // --output-type pdfa
        if (selectedLanguages == null || selectedLanguages.isEmpty()) {
            throw new IOException("Please select at least one language.");
        }

        if (!"hocr".equals(ocrRenderType) && !"sandwich".equals(ocrRenderType)) {
            throw new IOException("ocrRenderType wrong");
        }

        // Get available Tesseract languages
        List<String> availableLanguages = getAvailableTesseractLanguages();

        // Validate selected languages
        selectedLanguages =
                selectedLanguages.stream().filter(availableLanguages::contains).toList();

        if (selectedLanguages.isEmpty()) {
            throw new IOException("None of the selected languages are valid.");
        }
        // Save the uploaded file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");
        Path sidecarTextPath = null;

        try {
            inputFile.transferTo(tempInputFile.toFile());

            // Run OCR Command
            String languageOption = String.join("+", selectedLanguages);

            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    "ocrmypdf",
                                    "--verbose",
                                    "2",
                                    "--output-type",
                                    "pdf",
                                    "--pdf-renderer",
                                    ocrRenderType));

            if (sidecar != null && sidecar) {
                sidecarTextPath = Files.createTempFile("sidecar", ".txt");
                command.add("--sidecar");
                command.add(sidecarTextPath.toString());
            }

            if (deskew != null && deskew) {
                command.add("--deskew");
            }
            if (clean != null && clean) {
                command.add("--clean");
            }
            if (cleanFinal != null && cleanFinal) {
                command.add("--clean-final");
            }
            if (ocrType != null && !"".equals(ocrType)) {
                if ("skip-text".equals(ocrType)) {
                    command.add("--skip-text");
                } else if ("force-ocr".equals(ocrType)) {
                    command.add("--force-ocr");
                } else if ("Normal".equals(ocrType)) {

                }
            }

            command.addAll(
                    Arrays.asList(
                            "--language",
                            languageOption,
                            tempInputFile.toString(),
                            tempOutputFile.toString()));

            // Run CLI command
            ProcessExecutorResult result =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                            .runCommandWithOutputHandling(command);
            if (result.getRc() != 0
                    && result.getMessages().contains("multiprocessing/synchronize.py")
                    && result.getMessages()
                            .contains("OSError: [Errno 38] Function not implemented")) {
                command.add("--jobs");
                command.add("1");
                result =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                                .runCommandWithOutputHandling(command);
            }

            // Remove images from the OCR processed PDF if the flag is set to true
            if (removeImagesAfter != null && removeImagesAfter) {
                Path tempPdfWithoutImages = Files.createTempFile("output_", "_no_images.pdf");

                List<String> gsCommand =
                        Arrays.asList(
                                "gs",
                                "-sDEVICE=pdfwrite",
                                "-dFILTERIMAGE",
                                "-o",
                                tempPdfWithoutImages.toString(),
                                tempOutputFile.toString());

                ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT)
                        .runCommandWithOutputHandling(gsCommand);
                tempOutputFile = tempPdfWithoutImages;
            }
            // Read the OCR processed PDF file
            byte[] pdfBytes = Files.readAllBytes(tempOutputFile);

            // Return the OCR processed PDF as a response
            String outputFilename =
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_OCR.pdf";

            if (sidecar != null && sidecar) {
                // Create a zip file containing both the PDF and the text file
                String outputZipFilename =
                        Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                        .replaceFirst("[.][^.]+$", "")
                                + "_OCR.zip";
                Path tempZipFile = Files.createTempFile("output_", ".zip");

                try (ZipOutputStream zipOut =
                        new ZipOutputStream(new FileOutputStream(tempZipFile.toFile()))) {
                    // Add PDF file to the zip
                    ZipEntry pdfEntry = new ZipEntry(outputFilename);
                    zipOut.putNextEntry(pdfEntry);
                    Files.copy(tempOutputFile, zipOut);
                    zipOut.closeEntry();

                    // Add text file to the zip
                    ZipEntry txtEntry = new ZipEntry(outputFilename.replace(".pdf", ".txt"));
                    zipOut.putNextEntry(txtEntry);
                    Files.copy(sidecarTextPath, zipOut);
                    zipOut.closeEntry();
                }

                byte[] zipBytes = Files.readAllBytes(tempZipFile);

                // Clean up the temporary zip file
                Files.deleteIfExists(tempZipFile);
                Files.deleteIfExists(tempOutputFile);
                Files.deleteIfExists(sidecarTextPath);

                // Return the zip file containing both the PDF and the text file
                return WebResponseUtils.bytesToWebResponse(
                        zipBytes, outputZipFilename, MediaType.APPLICATION_OCTET_STREAM);
            } else {
                // Return the OCR processed PDF as a response
                Files.deleteIfExists(tempOutputFile);
                return WebResponseUtils.bytesToWebResponse(pdfBytes, outputFilename);
            }
        } finally {
            // Clean up the temporary files
            Files.deleteIfExists(tempOutputFile);
            // Comment out as transferTo makes multipart handle cleanup
            // Files.deleteIfExists(tempInputFile);
            if (sidecarTextPath != null) {
                Files.deleteIfExists(sidecarTextPath);
            }
        }
    }
}

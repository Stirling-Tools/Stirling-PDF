package stirling.software.SPDF.controller.api.converters;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
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

import stirling.software.SPDF.config.RuntimePathConfig;
import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Convert", description = "Convert APIs")
@RequestMapping("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertOfficeController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final RuntimePathConfig runtimePathConfig;

    public File convertToPdf(MultipartFile inputFile) throws IOException, InterruptedException {
        // Check for valid file extension
        String originalFilename = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        if (originalFilename == null
                || !isValidFileExtension(FilenameUtils.getExtension(originalFilename))) {
            throw new IllegalArgumentException("Invalid file extension");
        }

        // Save the uploaded file to a temporary location
        Path tempInputFile =
                Files.createTempFile("input_", "." + FilenameUtils.getExtension(originalFilename));
        inputFile.transferTo(tempInputFile);

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        try {
            // Run the LibreOffice command
            List<String> command =
                    new ArrayList<>(
                            Arrays.asList(
                                    runtimePathConfig.getUnoConvertPath(),
                                    "--port",
                                    "2003",
                                    "--convert-to",
                                    "pdf",
                                    tempInputFile.toString(),
                                    tempOutputFile.toString()));
            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE)
                            .runCommandWithOutputHandling(command);

            // Read the converted PDF file
            return tempOutputFile.toFile();
        } finally {
            // Clean up the temporary files
            if (tempInputFile != null) Files.deleteIfExists(tempInputFile);
        }
    }

    private boolean isValidFileExtension(String fileExtension) {
        String extensionPattern = "^(?i)[a-z0-9]{2,4}$";
        return fileExtension.matches(extensionPattern);
    }

    @PostMapping(consumes = "multipart/form-data", value = "/file/pdf")
    @Operation(
            summary = "Convert a file to a PDF using LibreOffice",
            description =
                    "This endpoint converts a given file to a PDF using LibreOffice API  Input:ANY"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> processFileToPDF(@ModelAttribute GeneralFile generalFile)
            throws Exception {
        MultipartFile inputFile = generalFile.getFileInput();
        // unused but can start server instance if startup time is to long
        // LibreOfficeListener.getInstance().start();
        File file = null;
        try {
            file = convertToPdf(inputFile);

            PDDocument doc = pdfDocumentFactory.load(file);
            return WebResponseUtils.pdfDocToWebResponse(
                    doc,
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                    .replaceFirst("[.][^.]+$", "")
                            + "_convertedToPDF.pdf");
        } finally {
            if (file != null) file.delete();
        }
    }
}

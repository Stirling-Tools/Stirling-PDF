package stirling.software.SPDF.controller.api.converters;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import stirling.software.SPDF.model.api.converters.PdfToBookRequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

// @RestController
// @Tag(name = "Convert", description = "Convert APIs")
// @RequestMapping("/api/v1/convert")
public class ConvertPDFToBookController {

    @Qualifier("bookAndHtmlFormatsInstalled")
    private final boolean bookAndHtmlFormatsInstalled;

    public ConvertPDFToBookController(
            @Qualifier("bookAndHtmlFormatsInstalled") boolean bookAndHtmlFormatsInstalled) {
        this.bookAndHtmlFormatsInstalled = bookAndHtmlFormatsInstalled;
    }

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/book")
    @Operation(
            summary =
                    "Convert a PDF to a Book/comic (*.epub | *.mobi | *.azw3 | *.fb2 | *.txt | *.docx .. (others to include by chatgpt) to PDF",
            description =
                    "(Requires bookAndHtmlFormatsInstalled flag and Calibre installed) This endpoint Convert a PDF to a Book/comic (*.epub | *.mobi | *.azw3 | *.fb2 | *.txt | *.docx .. (others to include by chatgpt) to PDF")
    public ResponseEntity<byte[]> HtmlToPdf(@ModelAttribute PdfToBookRequest request)
            throws Exception {
        MultipartFile fileInput = request.getFileInput();
        if (!bookAndHtmlFormatsInstalled) {
            throw new IllegalArgumentException(
                    "bookAndHtmlFormatsInstalled flag is False, this functionality is not available");
        }
        if (fileInput == null) {
            throw new IllegalArgumentException("Please provide a file for conversion.");
        }
        // Validate the output format
        String outputFormat = request.getOutputFormat().toLowerCase();
        List<String> allowedFormats =
                Arrays.asList(
                        "epub", "mobi", "azw3", "docx", "rtf", "txt", "html", "lit", "fb2", "pdb",
                        "lrf");
        if (!allowedFormats.contains(outputFormat)) {
            throw new IllegalArgumentException("Invalid output format: " + outputFormat);
        }
        byte[] outputFileBytes;
        List<String> command = new ArrayList<>();
        Path tempOutputFile =
                Files.createTempFile(
                        "output_", // Use the output format for the file extension
                        "." + outputFormat);
        Path tempInputFile = null;
        try {
            // Create temp input file from the provided PDF
            // Assuming input is always PDF
            tempInputFile = Files.createTempFile("input_", ".pdf");
            Files.write(tempInputFile, fileInput.getBytes());
            command.add("ebook-convert");
            command.add(tempInputFile.toString());
            command.add(tempOutputFile.toString());
            ProcessExecutorResult returnCode =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                            .runCommandWithOutputHandling(command);
            outputFileBytes = Files.readAllBytes(tempOutputFile);
        } finally {
            // Clean up temporary files
            if (tempInputFile != null) {
                Files.deleteIfExists(tempInputFile);
            }
            Files.deleteIfExists(tempOutputFile);
        }
        String outputFilename =
                Filenames.toSimpleFileName(fileInput.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "."
                        + // Remove file extension and append .pdf
                        outputFormat;
        return WebResponseUtils.bytesToWebResponse(outputFileBytes, outputFilename);
    }
}

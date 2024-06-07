package stirling.software.SPDF.controller.api.converters;

import java.io.ByteArrayOutputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDField;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.utils.ProcessExecutor;
import stirling.software.SPDF.utils.ProcessExecutor.ProcessExecutorResult;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertPDFToPDFA {

    private static final Logger logger = LoggerFactory.getLogger(ConvertPDFToPDFA.class);

    @PostMapping(consumes = "multipart/form-data", value = "/pdf/pdfa")
    @Operation(
            summary = "Convert a PDF to a PDF/A",
            description =
                    "This endpoint converts a PDF file to a PDF/A file. PDF/A is a format designed for long-term archiving of digital documents. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> pdfToPdfA(@ModelAttribute PdfToPdfARequest request)
            throws Exception {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();

        // Convert MultipartFile to byte[]
        byte[] pdfBytes = inputFile.getBytes();

        // Load the PDF document
        PDDocument document = Loader.loadPDF(pdfBytes);

        // Get the document catalog
        PDDocumentCatalog catalog = document.getDocumentCatalog();

        // Get the AcroForm
        PDAcroForm acroForm = catalog.getAcroForm();
        if (acroForm != null) {
            // Remove signature fields safely
            List<PDField> fieldsToRemove =
                    acroForm.getFields().stream()
                            .filter(field -> field instanceof PDSignatureField)
                            .collect(Collectors.toList());

            if (!fieldsToRemove.isEmpty()) {
                acroForm.flatten(fieldsToRemove, false);

                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                document.save(baos);
                pdfBytes = baos.toByteArray();
            }
        }
        document.close();

        // Save the uploaded (and possibly modified) file to a temporary location
        Path tempInputFile = Files.createTempFile("input_", ".pdf");
        try (OutputStream outputStream = new FileOutputStream(tempInputFile.toFile())) {
            outputStream.write(pdfBytes);
        }

        // Prepare the output file path
        Path tempOutputFile = Files.createTempFile("output_", ".pdf");

        // Prepare the OCRmyPDF command
        List<String> command = new ArrayList<>();
        command.add("ocrmypdf");
        command.add("--skip-text");
        command.add("--tesseract-timeout=0");
        command.add("--output-type");
        command.add(outputFormat.toString());
        command.add(tempInputFile.toString());
        command.add(tempOutputFile.toString());

        ProcessExecutorResult returnCode =
                ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF)
                        .runCommandWithOutputHandling(command);

        // Read the optimized PDF file
        byte[] optimizedPdfBytes = Files.readAllBytes(tempOutputFile);

        // Clean up the temporary files
        Files.deleteIfExists(tempInputFile);
        Files.deleteIfExists(tempOutputFile);

        // Return the optimized PDF as a response
        String outputFilename =
                Filenames.toSimpleFileName(inputFile.getOriginalFilename())
                                .replaceFirst("[.][^.]+$", "")
                        + "_PDFA.pdf";
        return WebResponseUtils.bytesToWebResponse(optimizedPdfBytes, outputFilename);
    }
}

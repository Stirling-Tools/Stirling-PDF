package stirling.software.SPDF.controller.api;

import java.beans.PropertyEditorSupport;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.service.PdfImageRemovalService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

/**
 * Controller class for handling PDF image removal requests. Provides an endpoint to remove images
 * from a PDF file to reduce its size.
 */
@GeneralApi
@RequiredArgsConstructor
public class PdfImageRemovalController {

    // Service for removing images from PDFs
    private final PdfImageRemovalService pdfImageRemovalService;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final FileStorage fileStorage;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinder(WebDataBinder binder) {
        binder.registerCustomEditor(
                MultipartFile.class,
                new PropertyEditorSupport() {
                    @Override
                    public void setAsText(String text) throws IllegalArgumentException {
                        setValue(null);
                    }
                });
    }

    /**
     * Endpoint to remove images from a PDF file.
     *
     * <p>This method processes the uploaded PDF file, removes all images, and returns the modified
     * PDF file with a new name indicating that images were removed.
     *
     * @param file The PDF file with images to be removed.
     * @return ResponseEntity containing the modified PDF file as byte array with appropriate
     *     content type and filename.
     * @throws IOException If an error occurs while processing the PDF file.
     */
    @AutoJobPostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/remove-image-pdf")
    @StandardPdfResponse
    @Operation(
            summary = "Remove images from file to reduce the file size.",
            description =
                    "This endpoint remove images from file to reduce the file size.Input:PDF"
                            + " Output:PDF Type:SISO")
    public ResponseEntity<byte[]> removeImages(@Valid @ModelAttribute PDFFile request)
            throws IOException {
        // Validate input
        MultipartFile inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);
        // Load the PDF document
        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {

            // Remove images from the PDF document using the service
            PDDocument modifiedDocument = pdfImageRemovalService.removeImagesFromPdf(document);

            // Create a ByteArrayOutputStream to hold the modified PDF data
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();

            // Save the modified PDF document to the output stream
            modifiedDocument.save(outputStream);
            modifiedDocument.close();

            // Generate a new filename for the modified PDF
            String mergedFileName =
                    GeneralUtils.generateFilename(
                            inputFile.getOriginalFilename(), "_images_removed.pdf");

            // Convert the byte array to a web response and return it
            return WebResponseUtils.bytesToWebResponse(outputStream.toByteArray(), mergedFileName);
        }
    }
}

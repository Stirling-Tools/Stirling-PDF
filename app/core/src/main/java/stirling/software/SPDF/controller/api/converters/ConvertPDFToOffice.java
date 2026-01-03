package stirling.software.SPDF.controller.api.converters;

import java.beans.PropertyEditorSupport;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.WebDataBinder;
import org.springframework.web.bind.annotation.InitBinder;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.FileStorage;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
@RequiredArgsConstructor
public class ConvertPDFToOffice {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;
    private final FileStorage fileStorage;

    /**
     * Initialize data binder for multipart file uploads. This method registers a custom editor for
     * MultipartFile to handle file uploads. It sets the MultipartFile to null if the uploaded file
     * is empty. This is necessary to avoid binding errors when the file is not present.
     */
    @InitBinder
    public void initBinderForPDFFile(WebDataBinder binder, WebRequest webRequest) {
        if (binder.getTarget() instanceof PDFFile) {
            binder.registerCustomEditor(
                    MultipartFile.class,
                    new PropertyEditorSupport() {
                        @Override
                        public void setAsText(String text) throws IllegalArgumentException {
                            setValue(null);
                        }
                    });
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/presentation")
    @Operation(
            summary = "Convert PDF to Presentation format",
            description =
                    "This endpoint converts a given PDF file to a Presentation format. Input:PDF"
                            + " Output:PPT Type:SISO")
    public ResponseEntity<byte[]> processPdfToPresentation(
            @ModelAttribute PdfToPresentationRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "impress_pdf_import");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/text")
    @Operation(
            summary = "Convert PDF to Text or RTF format",
            description =
                    "This endpoint converts a given PDF file to Text or RTF format. Input:PDF"
                            + " Output:TXT Type:SISO")
    public ResponseEntity<byte[]> processPdfToRTForTXT(
            @ModelAttribute PdfToTextOrRTFRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();
        if ("txt".equals(request.getOutputFormat())) {
            try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
                PDFTextStripper stripper = new PDFTextStripper();
                String text = stripper.getText(document);
                return WebResponseUtils.bytesToWebResponse(
                        text.getBytes(),
                        GeneralUtils.generateFilename(inputFile.getOriginalFilename(), ".txt"),
                        MediaType.TEXT_PLAIN);
            }
        } else {
            PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
            return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
        }
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/word")
    @Operation(
            summary = "Convert PDF to Word document",
            description =
                    "This endpoint converts a given PDF file to a Word document format. Input:PDF"
                            + " Output:WORD Type:SISO")
    public ResponseEntity<byte[]> processPdfToWord(@ModelAttribute PdfToWordRequest request)
            throws IOException, InterruptedException {
        MultipartFile inputFile = request.getFileInput();
        String outputFormat = request.getOutputFormat();
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(inputFile, outputFormat, "writer_pdf_import");
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE, value = "/pdf/xml")
    @Operation(
            summary = "Convert PDF to XML",
            description =
                    "This endpoint converts a PDF file to an XML file. Input:PDF Output:XML"
                            + " Type:SISO")
    public ResponseEntity<byte[]> processPdfToXML(@Valid @ModelAttribute PDFFile request)
            throws Exception {
        MultipartFile inputFile;
        // Validate input
        inputFile = request.resolveFile(fileStorage);
        if (inputFile == null) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.pdfRequired", "PDF file is required");
        }
        request.validatePdfFile(inputFile);

        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(inputFile, "xml", "writer_pdf_import");
    }
}

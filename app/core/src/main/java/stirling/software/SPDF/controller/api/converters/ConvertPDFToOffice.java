package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.model.tool.ToolIOCase;
import stirling.software.common.model.tool.ToolIOWhen;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ConvertApi
@RequiredArgsConstructor
public class ConvertPDFToOffice {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;
    private final OfficeConversionService officeConversionService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/presentation",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.PPT)
    @Operation(
            summary = "Convert PDF to Presentation format",
            description = "This endpoint converts a given PDF file to a Presentation format.")
    public ResponseEntity<Resource> processPdfToPresentation(
            @ModelAttribute PdfToPresentationRequest request) throws IOException {
        return convert(
                request.getFileInput(),
                request.getOutputFormat(),
                Set.of("ppt", "pptx", "odp"),
                MediaType.APPLICATION_OCTET_STREAM);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/text",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @ToolIO(
            produces = ToolFormat.TEXT,
            cases =
                    @ToolIOCase(
                            when = @ToolIOWhen(param = "outputFormat", matches = "rtf"),
                            produces = ToolFormat.WORD,
                            arity = ToolArity.SISO))
    @Operation(
            summary = "Convert PDF to Text or RTF format",
            description = "This endpoint converts a given PDF file to Text or RTF format.")
    public ResponseEntity<Resource> processPdfToRTForTXT(
            @ModelAttribute PdfToTextOrRTFRequest request) throws IOException {
        String format = request.getOutputFormat();
        return convert(
                request.getFileInput(),
                format,
                Set.of("rtf", "txt"),
                "txt".equals(format) ? MediaType.TEXT_PLAIN : MediaType.APPLICATION_OCTET_STREAM);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/word",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.WORD)
    @Operation(
            summary = "Convert PDF to Word document",
            description = "This endpoint converts a given PDF file to a Word document format.")
    public ResponseEntity<Resource> processPdfToWord(@ModelAttribute PdfToWordRequest request)
            throws IOException {
        return convert(
                request.getFileInput(),
                request.getOutputFormat(),
                Set.of("doc", "docx", "odt"),
                MediaType.APPLICATION_OCTET_STREAM);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/pdf/xml",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.XML)
    @Operation(
            summary = "Convert PDF to XML",
            description = "This endpoint converts a PDF file to an XML file.")
    public ResponseEntity<Resource> processPdfToXML(@ModelAttribute PDFFile file) throws Exception {
        MultipartFile inputFile = file.getFileInput();

        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(inputFile, "xml", "writer_pdf_import");
    }

    private ResponseEntity<Resource> convert(
            MultipartFile input, String format, Set<String> formats, MediaType type)
            throws IOException {
        // Text reads any upload; every other format takes only an upload typed as a PDF.
        boolean pdf = MediaType.APPLICATION_PDF_VALUE.equals(input.getContentType());
        if (!formats.contains(format) || !pdf && !"txt".equals(format)) {
            return ResponseEntity.badRequest().build();
        }
        TempFile out = tempFileManager.createManagedTempFile("." + format);
        try (PDDocument document = pdfDocumentFactory.load(input)) {
            officeConversionService.convert(
                    document, out.getPath(), format, officeConversionService.settings());
        } catch (Exception e) {
            out.close();
            throw e;
        }
        String fileName = GeneralUtils.generateFilename(input.getOriginalFilename(), "." + format);
        return WebResponseUtils.fileToWebResponse(out, fileName, type);
    }
}

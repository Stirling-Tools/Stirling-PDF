package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
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
@ApplicationScoped
@Path("/api/v1/convert")
@RequiredArgsConstructor
public class ConvertPDFToOffice {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;

    @POST
    @Path("/pdf/presentation")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/presentation",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.PPT)
    @Operation(
            summary = "Convert PDF to Presentation format",
            description = "This endpoint converts a given PDF file to a Presentation format.")
    public Response processPdfToPresentation(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PdfToPresentationRequest request = new PdfToPresentationRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setOutputFormat(outputFormat);
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(
                request.getFileInput(), request.getOutputFormat(), "impress_pdf_import");
    }

    @POST
    @Path("/pdf/text")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
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
    public Response processPdfToRTForTXT(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setOutputFormat(outputFormat);
        var inputFile = request.getFileInput();
        if ("txt".equals(request.getOutputFormat())) {
            String fileName =
                    GeneralUtils.generateFilename(inputFile.getOriginalFilename(), ".txt");
            TempFile finalOut = tempFileManager.createManagedTempFile(".txt");
            try (PDDocument document = pdfDocumentFactory.load(inputFile)) {
                PDFTextStripper stripper = new PDFTextStripper();
                String text = stripper.getText(document);
                Files.writeString(finalOut.getPath(), text, StandardCharsets.UTF_8);
            } catch (Exception e) {
                finalOut.close();
                throw e;
            }
            return WebResponseUtils.fileToWebResponse(
                    finalOut, fileName, MediaType.TEXT_PLAIN_TYPE);
        } else {
            PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
            return pdfToFile.processPdfToOfficeFormat(
                    inputFile, request.getOutputFormat(), "writer_pdf_import");
        }
    }

    @POST
    @Path("/pdf/word")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/word",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.WORD)
    @Operation(
            summary = "Convert PDF to Word document",
            description = "This endpoint converts a given PDF file to a Word document format.")
    public Response processPdfToWord(
            @RestForm("fileInput") FileUpload fileInput,
            @RestForm("outputFormat") String outputFormat)
            throws IOException, InterruptedException {
        PdfToWordRequest request = new PdfToWordRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileInput));
        request.setOutputFormat(outputFormat);
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(
                request.getFileInput(), request.getOutputFormat(), "writer_pdf_import");
    }

    @POST
    @Path("/pdf/xml")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/xml",
            resourceWeight = ResourceWeight.LARGE_WEIGHT)
    @ToolIO(produces = ToolFormat.XML)
    @Operation(
            summary = "Convert PDF to XML",
            description = "This endpoint converts a PDF file to an XML file.")
    public Response processPdfToXML(@RestForm("fileInput") FileUpload fileInput) throws Exception {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileInput));
        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToOfficeFormat(file.getFileInput(), "xml", "writer_pdf_import");
    }
}

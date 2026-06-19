package stirling.software.SPDF.model.api.converters;

import java.nio.charset.StandardCharsets;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.MarkdownConversionResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.pdf.PdfMarkdownConverter;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;

// @Path comes from @ConvertApi javadoc: controllers using it must declare /api/v1/convert.
@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@RequiredArgsConstructor
public class ConvertPDFToMarkdown {

    private final TempFileManager tempFileManager;

    @POST
    @Path("/pdf/markdown")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/markdown",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MarkdownConversionResponse
    @Operation(
            summary = "Convert PDF to Markdown",
            description =
                    "This endpoint converts a PDF file to Markdown format. Input:PDF Output:Markdown Type:SISO")
    public Response processPdfToMarkdown(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws Exception {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileUpload));
        file.setFileId(fileId);

        stirling.software.common.model.MultipartFile inputFile = file.getFileInput();

        String originalName = Filenames.toSimpleFileName(inputFile.getOriginalFilename());
        String baseName =
                originalName.contains(".")
                        ? originalName.substring(0, originalName.lastIndexOf('.'))
                        : originalName;

        String markdown;
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf")) {
            inputFile.transferTo(tempInput.getFile());
            try (PdfDocument doc = PdfDocument.open(tempInput.getPath())) {
                markdown = new PdfMarkdownConverter().convert(doc);
            }
        }

        return WebResponseUtils.bytesToWebResponse(
                markdown.getBytes(StandardCharsets.UTF_8),
                baseName + ".md",
                MediaType.valueOf("text/markdown"));
    }
}

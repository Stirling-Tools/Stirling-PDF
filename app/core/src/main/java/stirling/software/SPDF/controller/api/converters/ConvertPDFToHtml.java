package stirling.software.SPDF.controller.api.converters;

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

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.ConvertApi;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.PDFToFile;
import stirling.software.common.util.TempFileManager;

@ConvertApi
@Path("/api/v1/convert")
@ApplicationScoped
@RequiredArgsConstructor
public class ConvertPDFToHtml {

    private final TempFileManager tempFileManager;
    private final RuntimePathConfig runtimePathConfig;

    @POST
    @Path("/pdf/html")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/pdf/html",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Convert PDF to HTML",
            description =
                    "This endpoint converts a PDF file to HTML format. Input:PDF Output:HTML Type:SISO")
    public Response processPdfToHTML(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws Exception {
        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileUpload));
        file.setFileId(fileId);

        PDFToFile pdfToFile = new PDFToFile(tempFileManager, runtimePathConfig);
        return pdfToFile.processPdfToHtml(file.getFileInput());
    }
}

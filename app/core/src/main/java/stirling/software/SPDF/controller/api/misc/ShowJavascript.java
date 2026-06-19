package stirling.software.SPDF.controller.api.misc;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionJavaScript;
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

import stirling.software.SPDF.config.swagger.JavaScriptResponse;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@ApplicationScoped
@Path("/api/v1/misc")
@RequiredArgsConstructor
public class ShowJavascript {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/show-javascript")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/show-javascript",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @JavaScriptResponse
    @Operation(
            summary = "Grabs all JS from a PDF and returns a single JS file with all code",
            description = "desc. Input:PDF Output:JS Type:SISO")
    public Response extractHeader(
            @RestForm("fileInput") FileUpload fileUpload, @RestForm("fileId") String fileId)
            throws Exception {

        PDFFile file = new PDFFile();
        file.setFileInput(FileUploadMultipartFile.of(fileUpload));
        file.setFileId(fileId);

        MultipartFile inputFile = file.getFileInput();
        StringBuilder script = new StringBuilder();
        boolean foundScript = false;

        try (PDDocument document = pdfDocumentFactory.load(inputFile)) {

            if (document.getDocumentCatalog() != null
                    && document.getDocumentCatalog().getNames() != null) {
                PDNameTreeNode<PDActionJavaScript> jsTree =
                        document.getDocumentCatalog().getNames().getJavaScript();

                if (jsTree != null) {
                    Map<String, PDActionJavaScript> jsEntries = jsTree.getNames();

                    for (Map.Entry<String, PDActionJavaScript> entry : jsEntries.entrySet()) {
                        String name = entry.getKey();
                        PDActionJavaScript jsAction = entry.getValue();
                        String jsCodeStr = jsAction.getAction();

                        if (jsCodeStr != null && !jsCodeStr.trim().isEmpty()) {
                            script.append("// File: ")
                                    .append(
                                            Filenames.toSimpleFileName(
                                                    inputFile.getOriginalFilename()))
                                    .append(", Script: ")
                                    .append(name)
                                    .append("\n")
                                    .append(jsCodeStr)
                                    .append("\n");
                            foundScript = true;
                        }
                    }
                }
            }

            if (!foundScript) {
                script =
                        new StringBuilder("PDF '")
                                .append(Filenames.toSimpleFileName(inputFile.getOriginalFilename()))
                                .append("' does not contain Javascript");
            }

            TempFile tempOut = tempFileManager.createManagedTempFile(".js");
            try {
                Files.write(
                        tempOut.getFile().toPath(),
                        script.toString().getBytes(StandardCharsets.UTF_8));
            } catch (Exception e) {
                tempOut.close();
                throw e;
            }
            return WebResponseUtils.fileToWebResponse(
                    tempOut,
                    Filenames.toSimpleFileName(inputFile.getOriginalFilename()) + ".js",
                    MediaType.TEXT_PLAIN_TYPE);
        }
    }
}

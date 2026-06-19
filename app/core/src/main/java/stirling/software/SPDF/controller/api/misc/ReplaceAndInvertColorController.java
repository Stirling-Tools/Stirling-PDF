package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

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

import stirling.software.SPDF.model.api.misc.ReplaceAndInvertColorRequest;
import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.misc.HighContrastColorCombination;
import stirling.software.common.model.api.misc.ReplaceAndInvert;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Path("/api/v1/misc")
@ApplicationScoped
@RequiredArgsConstructor
public class ReplaceAndInvertColorController {

    private final ReplaceAndInvertColorService replaceAndInvertColorService;
    private final TempFileManager tempFileManager;

    @POST
    @Path("/replace-invert-pdf")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA,
            value = "/replace-invert-pdf",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Replace-Invert Color PDF",
            description =
                    "This endpoint accepts a PDF file and provides options to invert all colors, replace"
                            + " text and background colors, or convert to CMYK color space for printing. Input:PDF Output:PDF Type:SISO")
    public Response replaceAndInvertColor(
            @RestForm("fileInput") FileUpload fileUpload,
            @RestForm("fileId") String fileId,
            @RestForm("replaceAndInvertOption") ReplaceAndInvert replaceAndInvertOption,
            @RestForm("highContrastColorCombination")
                    HighContrastColorCombination highContrastColorCombination,
            @RestForm("backGroundColor") String backGroundColor,
            @RestForm("textColor") String textColor)
            throws IOException {

        ReplaceAndInvertColorRequest request = new ReplaceAndInvertColorRequest();
        request.setFileInput(FileUploadMultipartFile.of(fileUpload));
        request.setFileId(fileId);
        request.setReplaceAndInvertOption(replaceAndInvertOption);
        request.setHighContrastColorCombination(highContrastColorCombination);
        request.setBackGroundColor(backGroundColor);
        request.setTextColor(textColor);

        InputStreamResource resource =
                replaceAndInvertColorService.replaceAndInvertColor(
                        request.getFileInput(),
                        request.getReplaceAndInvertOption(),
                        request.getHighContrastColorCombination(),
                        request.getBackGroundColor(),
                        request.getTextColor());

        // Return the modified PDF as a downloadable file
        String filename =
                GeneralUtils.generateFilename(
                        request.getFileInput().getOriginalFilename(), "_inverted.pdf");

        TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
        try (InputStream in = resource.getInputStream()) {
            Files.copy(in, tempOut.getFile().toPath(), StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            tempOut.close();
            throw e;
        }

        return WebResponseUtils.pdfFileToWebResponse(tempOut, filename);
    }
}

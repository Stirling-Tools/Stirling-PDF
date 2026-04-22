package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.ReplaceAndInvertColorRequest;
import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class ReplaceAndInvertColorController {

    private final ReplaceAndInvertColorService replaceAndInvertColorService;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/replace-invert-pdf")
    @Operation(
            summary = "Replace-Invert Color PDF",
            description =
                    "This endpoint accepts a PDF file and provides options to invert all colors, replace"
                            + " text and background colors, or convert to CMYK color space for printing. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<StreamingResponseBody> replaceAndInvertColor(
            @ModelAttribute ReplaceAndInvertColorRequest request) throws IOException {

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

package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.AdjustColorsRequest;
import stirling.software.SPDF.service.toolscore.ColorAdjustments;
import stirling.software.SPDF.service.toolscore.ToolsCoreLibrary;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class AdjustColorsRustController {

    private final ToolsCoreLibrary toolsCore;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/adjust-colors-rust",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Adjust colours and contrast with the shared Rust implementation",
            description =
                    "Renders every page at 144 DPI, adjusts its colours and replaces the page with"
                            + " the adjusted image. Runs the same Rust code the editor runs in the"
                            + " browser.")
    public ResponseEntity<byte[]> adjustColors(@Valid @ModelAttribute AdjustColorsRequest request)
            throws IOException {
        if (!toolsCore.isAvailable()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "This server was built without the Rust tools library");
        }
        MultipartFile file = request.getFileInput();
        byte[] adjusted =
                toolsCore.adjustColors(
                        file.getBytes(),
                        new ColorAdjustments(
                                request.getContrast(),
                                request.getBrightness(),
                                request.getSaturation(),
                                request.getRed(),
                                request.getGreen(),
                                request.getBlue()));
        return WebResponseUtils.bytesToWebResponse(
                adjusted,
                GeneralUtils.generateFilename(file.getOriginalFilename(), "_adjusted.pdf"));
    }
}

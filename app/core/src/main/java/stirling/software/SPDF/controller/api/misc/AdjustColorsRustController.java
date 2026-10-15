package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.util.Locale;

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

    /**
     * Response header carrying how long opening, adjusting and saving took, so a client can split
     * the round trip into processing and transfer. Format per the W3C Server Timing spec.
     */
    static final String SERVER_TIMING_HEADER = "Server-Timing";

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
        byte[] input = file.getBytes();
        long started = System.nanoTime();
        byte[] adjusted =
                toolsCore.adjustColors(
                        input,
                        new ColorAdjustments(
                                request.getContrast(),
                                request.getBrightness(),
                                request.getSaturation(),
                                request.getRed(),
                                request.getGreen(),
                                request.getBlue()));
        double processingMs = (System.nanoTime() - started) / 1_000_000.0;
        ResponseEntity<byte[]> response =
                WebResponseUtils.bytesToWebResponse(
                        adjusted,
                        GeneralUtils.generateFilename(file.getOriginalFilename(), "_adjusted.pdf"));
        return ResponseEntity.status(response.getStatusCode())
                .headers(response.getHeaders())
                .header(
                        SERVER_TIMING_HEADER,
                        String.format(Locale.ROOT, "process;dur=%.1f", processingMs))
                .body(response.getBody());
    }
}

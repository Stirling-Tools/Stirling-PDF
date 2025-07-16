package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.model.api.misc.ReplaceAndInvertColorRequest;
import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;

@RestController
@RequestMapping("/api/v1/misc")
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class ReplaceAndInvertColorController {

    private final ReplaceAndInvertColorService replaceAndInvertColorService;

    @PostMapping(consumes = "multipart/form-data", value = "/replace-invert-pdf")
    @Operation(
            summary = "Replace-Invert Color PDF",
            description =
                    "This endpoint accepts a PDF file and option of invert all colors or replace"
                            + " text and background colors. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<InputStreamResource> replaceAndInvertColor(
            @ModelAttribute ReplaceAndInvertColorRequest request) throws IOException {

        InputStreamResource resource =
                replaceAndInvertColorService.replaceAndInvertColor(
                        request.getFileInput(),
                        request.getReplaceAndInvertOption(),
                        request.getHighContrastColorCombination(),
                        request.getBackGroundColor(),
                        request.getTextColor());

        // Return the modified PDF as a downloadable file
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=inverted.pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(resource);
    }
}

package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.config.swagger.JsonDataResponse;
import stirling.software.SPDF.model.api.misc.ReplaceAndInvertColorRequest;
import stirling.software.SPDF.model.api.misc.ReplaceTextColorsRequest;
import stirling.software.SPDF.model.json.TextColorUsage;
import stirling.software.SPDF.service.misc.ReplaceAndInvertColorService;
import stirling.software.SPDF.service.misc.TextColorReplacementService;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@RequiredArgsConstructor
public class ReplaceAndInvertColorController {

    private final ReplaceAndInvertColorService replaceAndInvertColorService;
    private final TextColorReplacementService textColorReplacementService;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/replace-invert-pdf")
    @Operation(
            summary = "Replace-Invert Color PDF",
            description =
                    "This endpoint accepts a PDF file and provides options to invert all colors, replace"
                            + " text and background colors, or convert to CMYK color space for printing. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> replaceAndInvertColor(
    public ResponseEntity<Resource> replaceAndInvertColor(
            @ModelAttribute ReplaceAndInvertColorRequest request) throws IOException {

        InputStreamResource resource =
                replaceAndInvertColorService.replaceAndInvertColor(
                        request.getFileInput(),
                        request.getReplaceAndInvertOption(),
                        request.getHighContrastColorCombination(),
                        request.getBackGroundColor(),
                        request.getTextColor());

        String filename =
                GeneralUtils.generateFilename(
                        request.getFileInput().getOriginalFilename(), "_inverted.pdf");

        byte[] bytes;
        try (InputStream in = resource.getInputStream()) {
            bytes = in.readAllBytes();
        }

        return WebResponseUtils.bytesToWebResponse(bytes, filename);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/detect-text-colors")
    @JsonDataResponse
    @Operation(
            summary = "Detect text colours in PDF",
            description =
                    "Scans text glyphs in the PDF and returns colour usage counts in hex format. Input:PDF Output:JSON Type:SISO")
    public ResponseEntity<List<TextColorUsage>> detectTextColors(
            @ModelAttribute ReplaceTextColorsRequest request) throws IOException {
        List<TextColorUsage> usages =
                textColorReplacementService.detectTextColors(request.getFileInput());
        return ResponseEntity.ok(usages);
    }

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/replace-text-colors")
    @Operation(
            summary = "Replace specific PDF text colours",
            description =
                    "Replaces selected source text colours with a single target colour while leaving non-text content unchanged. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> replaceTextColors(
            @ModelAttribute ReplaceTextColorsRequest request) throws IOException {
        try (PDDocument output =
                textColorReplacementService.replaceTextColors(
                        request.getFileInput(),
                        request.getSourceColors(),
                        request.getTargetColor())) {
            return WebResponseUtils.pdfDocToWebResponse(
                    output,
                    GeneralUtils.generateFilename(
                            request.getFileInput().getOriginalFilename(),
                            "_text-colours-replaced.pdf"));
        }
    }
}

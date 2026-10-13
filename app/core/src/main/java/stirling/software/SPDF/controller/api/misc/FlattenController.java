package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;

import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.StandardPdfResponse;
import stirling.software.SPDF.model.api.misc.FlattenRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.util.ApplicationContextProvider;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.model.FlattenMode;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class FlattenController {

    // Default when the caller sends no renderDpi; an explicit request still wins up to maxDPI
    private static final int FLATTEN_RENDER_DPI = 300;

    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/flatten",
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @StandardPdfResponse
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Flatten PDF form fields or full page",
            description =
                    "Flattening just PDF form fields or converting each page to images to make text"
                            + " unselectable.")
    public ResponseEntity<Resource> flatten(@ModelAttribute FlattenRequest request)
            throws Exception {
        MultipartFile file = request.getFileInput();
        Boolean flattenOnlyForms = request.getFlattenOnlyForms();

        ApplicationProperties properties =
                ApplicationContextProvider.getBean(ApplicationProperties.class);
        Integer configuredMaxDpi = null;
        if (properties != null && properties.getSystem() != null) {
            configuredMaxDpi = properties.getSystem().getMaxDPI();
        }

        int maxDpi =
                (configuredMaxDpi != null && configuredMaxDpi > 0)
                        ? configuredMaxDpi
                        : FLATTEN_RENDER_DPI;

        Integer requestedDpi = request.getRenderDpi();
        // maxDpi is a ceiling; without an explicit request use the print-quality target
        int renderDpiTemp = Math.min(FLATTEN_RENDER_DPI, maxDpi);
        if (requestedDpi != null) {
            renderDpiTemp = Math.min(requestedDpi, maxDpi);
            renderDpiTemp = Math.max(renderDpiTemp, 72);
        }
        final int renderDpi = renderDpiTemp;

        // JPDFium flattens in place, so unlike the old PDFBox path there is no
        // extract-and-rebuild round-trip: ANNOTATIONS burns form fields (and other
        // visible annotations) while keeping text selectable, FULL rasterizes each
        // page at the requested DPI.
        TempFile tempOutputFile = tempFileManager.createManagedTempFile(".pdf");
        try {
            try (PdfDocument document = PdfDocument.open(file.getBytes())) {
                if (Boolean.TRUE.equals(flattenOnlyForms)) {
                    document.flatten(FlattenMode.ANNOTATIONS);
                } else {
                    document.flatten(FlattenMode.FULL, renderDpi);
                }
                document.save(tempOutputFile.getFile().toPath());
            } catch (RuntimeException e) {
                throw new IOException("JPDFium flatten failed", e);
            }

            TempFile out = tempOutputFile;
            tempOutputFile = null; // ownership transferred to the response
            return WebResponseUtils.pdfFileToWebResponse(
                    out, Filenames.toSimpleFileName(file.getOriginalFilename()));
        } finally {
            if (tempOutputFile != null) {
                tempOutputFile.close();
            }
        }
    }
}

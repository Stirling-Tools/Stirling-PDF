package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.general.SetPageBoxesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.GeneralApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@GeneralApi
@RequiredArgsConstructor
@Slf4j
public class SetPageBoxesController {

    private static final float MM_TO_POINTS = 72f / 25.4f;

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/set-page-boxes",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    @ToolIO(produces = ToolFormat.PDF)
    @Operation(
            summary = "Set PDF page boxes",
            description =
                    "Sets MediaBox, CropBox, TrimBox, BleedBox and/or ArtBox on every page of the"
                            + " input PDF, either from explicit rectangles or from prepress"
                            + " shortcuts (bleed around trim, trim inset from media).")
    public ResponseEntity<Resource> setPageBoxes(@ModelAttribute SetPageBoxesRequest request)
            throws IOException {
        if (!hasWork(request)) {
            throw new IllegalArgumentException(
                    "At least one page box, bleedMm, trimMarginMm or copyMissingFromMediaBox must"
                            + " be provided");
        }

        try (PDDocument document = pdfDocumentFactory.load(request)) {
            for (PDPage page : document.getPages()) {
                applyBoxes(page, request);
            }

            return WebResponseUtils.pdfDocToWebResponse(
                    document,
                    GeneralUtils.generateFilename(
                            request.getFileInput().getOriginalFilename(), "_boxes.pdf"),
                    tempFileManager);
        }
    }

    private static boolean hasWork(SetPageBoxesRequest request) {
        return notBlank(request.getMediaBox())
                || notBlank(request.getCropBox())
                || notBlank(request.getTrimBox())
                || notBlank(request.getBleedBox())
                || notBlank(request.getArtBox())
                || request.getBleedMm() > 0
                || request.getTrimMarginMm() > 0
                || request.isCopyMissingFromMediaBox();
    }

    private static void applyBoxes(PDPage page, SetPageBoxesRequest request) {
        PDRectangle media = parseRect(request.getMediaBox(), "mediaBox");
        if (media != null) {
            page.setMediaBox(media);
        }
        PDRectangle effectiveMedia = media != null ? media : page.getMediaBox();

        PDRectangle trim = parseRect(request.getTrimBox(), "trimBox");
        if (trim == null && request.getTrimMarginMm() > 0) {
            trim = inset(effectiveMedia, request.getTrimMarginMm(), "trimMarginMm");
        }
        if (trim != null) {
            page.setTrimBox(trim);
        }

        PDRectangle bleed = parseRect(request.getBleedBox(), "bleedBox");
        if (bleed == null && request.getBleedMm() > 0) {
            PDRectangle resolvedTrim = trim != null ? trim : page.getTrimBox();
            bleed = expand(resolvedTrim, request.getBleedMm());
        }
        if (bleed != null) {
            page.setBleedBox(bleed);
        }

        PDRectangle crop = parseRect(request.getCropBox(), "cropBox");
        if (crop != null) {
            page.setCropBox(crop);
        }

        PDRectangle art = parseRect(request.getArtBox(), "artBox");
        if (art != null) {
            page.setArtBox(art);
        }

        if (request.isCopyMissingFromMediaBox()) {
            // All PDPage box getters fall back to CropBox or MediaBox when the entry is
            // absent, so presence is tested on the page dictionary.
            COSDictionary dict = page.getCOSObject();
            if (crop == null && dict.getItem(COSName.CROP_BOX) == null) {
                page.setCropBox(effectiveMedia);
            }
            if (trim == null && dict.getItem(COSName.TRIM_BOX) == null) {
                page.setTrimBox(effectiveMedia);
            }
            if (bleed == null && dict.getItem(COSName.BLEED_BOX) == null) {
                page.setBleedBox(effectiveMedia);
            }
            if (art == null && dict.getItem(COSName.ART_BOX) == null) {
                page.setArtBox(effectiveMedia);
            }
        }
    }

    private static boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static PDRectangle parseRect(String value, String name) {
        if (!notBlank(value)) {
            return null;
        }
        String[] parts = value.split(",");
        if (parts.length != 4) {
            throw new IllegalArgumentException(
                    name + " must be \"x,y,width,height\" in points, got: " + value);
        }
        try {
            float x = Float.parseFloat(parts[0].trim());
            float y = Float.parseFloat(parts[1].trim());
            float width = Float.parseFloat(parts[2].trim());
            float height = Float.parseFloat(parts[3].trim());
            // NaN and Infinity parse fine but produce invalid box entries; negative
            // origins stay allowed because BleedBox may extend outside the MediaBox.
            if (!Float.isFinite(x)
                    || !Float.isFinite(y)
                    || !Float.isFinite(width)
                    || !Float.isFinite(height)) {
                throw new IllegalArgumentException(
                        name + " must contain finite numbers, got: " + value);
            }
            if (width <= 0 || height <= 0) {
                throw new IllegalArgumentException(
                        name + " width and height must be positive, got: " + value);
            }
            return new PDRectangle(x, y, width, height);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    name + " must be \"x,y,width,height\" in points, got: " + value, e);
        }
    }

    private static PDRectangle inset(PDRectangle rect, float marginMm, String name) {
        float m = marginMm * MM_TO_POINTS;
        float width = rect.getWidth() - 2 * m;
        float height = rect.getHeight() - 2 * m;
        if (width <= 0 || height <= 0) {
            throw new IllegalArgumentException(
                    name + " of " + marginMm + "mm leaves no area inside the MediaBox");
        }
        return new PDRectangle(rect.getLowerLeftX() + m, rect.getLowerLeftY() + m, width, height);
    }

    private static PDRectangle expand(PDRectangle rect, float marginMm) {
        float m = marginMm * MM_TO_POINTS;
        return new PDRectangle(
                rect.getLowerLeftX() - m,
                rect.getLowerLeftY() - m,
                rect.getWidth() + 2 * m,
                rect.getHeight() + 2 * m);
    }
}

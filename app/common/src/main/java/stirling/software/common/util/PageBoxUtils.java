package stirling.software.common.util;

import java.util.Locale;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@UtilityClass
public class PageBoxUtils {

    public final String MEDIA_BOX = "MEDIA_BOX";
    public final String CROP_BOX = "CROP_BOX";
    public final String TRIM_BOX = "TRIM_BOX";
    public final String BLEED_BOX = "BLEED_BOX";
    public final String ART_BOX = "ART_BOX";

    /**
     * Resolves a page box by name, case-insensitive. Blank or {@code MEDIA_BOX} returns the
     * MediaBox; a named box absent from the page falls back to the MediaBox. Any other value throws
     * {@link IllegalArgumentException}.
     */
    public PDRectangle resolvePageBox(PDPage page, String pageBox) {
        if (pageBox == null || pageBox.isBlank()) {
            return page.getMediaBox();
        }
        return switch (pageBox.toUpperCase(Locale.ROOT)) {
            case MEDIA_BOX -> page.getMediaBox();
            case CROP_BOX -> explicitBoxOrFallback(page, COSName.CROP_BOX, page.getCropBox());
            case TRIM_BOX -> explicitBoxOrFallback(page, COSName.TRIM_BOX, page.getTrimBox());
            case BLEED_BOX -> explicitBoxOrFallback(page, COSName.BLEED_BOX, page.getBleedBox());
            case ART_BOX -> explicitBoxOrFallback(page, COSName.ART_BOX, page.getArtBox());
            default -> throw new IllegalArgumentException("Invalid pageBox value: " + pageBox);
        };
    }

    // The PDPage getters fall back to CropBox or MediaBox when the entry is absent, so
    // presence has to be tested on the COS dictionary itself.
    private PDRectangle explicitBoxOrFallback(PDPage page, COSName name, PDRectangle box) {
        if (box == null || page.getCOSObject().getItem(name) == null) {
            log.warn("Page has no {}, falling back to MediaBox", name.getName());
            return page.getMediaBox();
        }
        return box;
    }
}

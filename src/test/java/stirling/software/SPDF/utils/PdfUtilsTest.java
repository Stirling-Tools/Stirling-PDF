package stirling.software.SPDF.utils;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import stirling.software.SPDF.model.PdfMetadata;

import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.cos.COSName;

public class PdfUtilsTest {

    @Test
    void testTextToPageSize() {
        assertEquals(PDRectangle.A4, PdfUtils.textToPageSize("A4"));
        assertEquals(PDRectangle.LETTER, PdfUtils.textToPageSize("LETTER"));
        assertThrows(IllegalArgumentException.class, () -> PdfUtils.textToPageSize("INVALID"));
    }

    @Test
    void testHasImagesOnPage() throws IOException {
        // Mock a PDPage and its resources
        PDPage page = Mockito.mock(PDPage.class);
        PDResources resources = Mockito.mock(PDResources.class);
        Mockito.when(page.getResources()).thenReturn(resources);

        // Case 1: No images in resources
        Mockito.when(resources.getXObjectNames()).thenReturn(Collections.emptySet());
        assertFalse(PdfUtils.hasImagesOnPage(page));

        // Case 2: Resources with an image
        Set<COSName> xObjectNames = new HashSet<>();
        COSName cosName = Mockito.mock(COSName.class);
        xObjectNames.add(cosName);

        PDImageXObject imageXObject = Mockito.mock(PDImageXObject.class);
        Mockito.when(resources.getXObjectNames()).thenReturn(xObjectNames);
        Mockito.when(resources.getXObject(cosName)).thenReturn(imageXObject);

        assertTrue(PdfUtils.hasImagesOnPage(page));
    }


}

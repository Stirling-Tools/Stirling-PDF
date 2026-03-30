package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PageMode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AttachmentUtilsTest {

    @Test
    @DisplayName("should set page mode on catalog")
    void setsPageMode() {
        try (PDDocument document = new PDDocument()) {
            AttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

            PDDocumentCatalog catalog = document.getDocumentCatalog();
            assertEquals(PageMode.USE_ATTACHMENTS, catalog.getPageMode());
        } catch (Exception e) {
            fail("Should not throw: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("should create viewer preferences dictionary if absent")
    void createsViewerPreferences() {
        try (PDDocument document = new PDDocument()) {
            AttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

            COSDictionary catalogDict = document.getDocumentCatalog().getCOSObject();
            COSDictionary viewerPrefs =
                    (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);
            assertNotNull(viewerPrefs);
        } catch (Exception e) {
            fail("Should not throw: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("should set DisplayDocTitle to true in viewer preferences")
    void setsDisplayDocTitle() {
        try (PDDocument document = new PDDocument()) {
            AttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

            COSDictionary catalogDict = document.getDocumentCatalog().getCOSObject();
            COSDictionary viewerPrefs =
                    (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);
            assertTrue(viewerPrefs.getBoolean(COSName.getPDFName("DisplayDocTitle"), false));
        } catch (Exception e) {
            fail("Should not throw: " + e.getMessage());
        }
    }

    @Test
    @DisplayName("should not throw when catalog returns null from mocked document")
    void handlesNullCatalogGracefully() {
        PDDocument document = mock(PDDocument.class);
        when(document.getDocumentCatalog()).thenReturn(null);

        assertDoesNotThrow(
                () ->
                        AttachmentUtils.setCatalogViewerPreferences(
                                document, PageMode.USE_ATTACHMENTS));
    }
}

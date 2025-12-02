package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PageMode;
import org.junit.jupiter.api.Test;

class AttachmentUtilsTest {

    @Test
    void setCatalogViewerPreferencesInitializesViewerPreferences() throws IOException {
        try (PDDocument document = new PDDocument()) {
            AttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_ATTACHMENTS);

            PDDocumentCatalog catalog = document.getDocumentCatalog();
            COSDictionary catalogDict = catalog.getCOSObject();
            COSDictionary viewerPrefs =
                    (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);

            assertEquals(PageMode.USE_ATTACHMENTS, catalog.getPageMode());
            assertEquals(
                    PageMode.USE_ATTACHMENTS.stringValue(),
                    catalogDict.getNameAsString(COSName.PAGE_MODE));
            assertNotNull(viewerPrefs, "Viewer preferences should be created when absent");
            assertEquals(
                    PageMode.USE_ATTACHMENTS.stringValue(),
                    viewerPrefs.getNameAsString(COSName.getPDFName("NonFullScreenPageMode")));
            assertTrue(
                    viewerPrefs.getBoolean(COSName.getPDFName("DisplayDocTitle"), false),
                    "DisplayDocTitle should be enabled");
        }
    }

    @Test
    void setCatalogViewerPreferencesUsesExistingViewerPreferences() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            COSDictionary catalogDict = catalog.getCOSObject();
            COSDictionary existingPrefs = new COSDictionary();
            existingPrefs.setName(COSName.getPDFName("CustomKey"), "CustomValue");
            catalogDict.setItem(COSName.VIEWER_PREFERENCES, existingPrefs);

            AttachmentUtils.setCatalogViewerPreferences(document, PageMode.USE_THUMBS);

            COSDictionary viewerPrefs =
                    (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);

            assertSame(existingPrefs, viewerPrefs, "Existing viewer preferences should be reused");
            assertEquals(
                    "CustomValue",
                    viewerPrefs.getNameAsString(COSName.getPDFName("CustomKey")),
                    "Existing viewer preference entries should remain intact");
            assertEquals(
                    PageMode.USE_THUMBS.stringValue(),
                    viewerPrefs.getNameAsString(COSName.getPDFName("NonFullScreenPageMode")));
            assertTrue(
                    viewerPrefs.getBoolean(COSName.getPDFName("DisplayDocTitle"), false),
                    "DisplayDocTitle should be enabled on existing viewer preferences");
        }
    }
}

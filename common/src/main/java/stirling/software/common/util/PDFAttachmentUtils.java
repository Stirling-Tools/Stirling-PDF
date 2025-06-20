package stirling.software.common.util;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PageMode;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class PDFAttachmentUtils {

    public static void setCatalogViewerPreferences(PDDocument document, PageMode pageMode) {
        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            if (catalog != null) {
                // Get the catalog's COS dictionary to work with low-level PDF objects
                COSDictionary catalogDict = catalog.getCOSObject();

                // Set PageMode to UseAttachments - this is the standard PDF specification approach
                // PageMode values: UseNone, UseOutlines, UseThumbs, FullScreen, UseOC,
                // UseAttachments
                catalog.setPageMode(pageMode);
                catalogDict.setName(COSName.PAGE_MODE, pageMode.stringValue());

                // Also set viewer preferences for better attachment viewing experience
                COSDictionary viewerPrefs =
                        (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);
                if (viewerPrefs == null) {
                    viewerPrefs = new COSDictionary();
                    catalogDict.setItem(COSName.VIEWER_PREFERENCES, viewerPrefs);
                }

                // Set NonFullScreenPageMode to UseAttachments as fallback for viewers that support
                // it
                viewerPrefs.setName(
                        COSName.getPDFName("NonFullScreenPageMode"), pageMode.stringValue());

                // Additional viewer preferences that may help with attachment display
                viewerPrefs.setBoolean(COSName.getPDFName("DisplayDocTitle"), true);

                log.info(
                        "Set PDF PageMode to UseAttachments to automatically show attachments pane");
            }
        } catch (Exception e) {
            // Log error but don't fail the entire operation for viewer preferences
            log.error("Failed to set catalog viewer preferences for attachments", e);
        }
    }
}

package stirling.software.common.util;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PageMode;

import lombok.extern.slf4j.Slf4j;

@Slf4j
public class AttachmentUtils {

    /**
     * Sets the PDF catalog viewer preferences to display attachments in the viewer.
     *
     * @param document The <code>PDDocument</code> to modify.
     * @param pageMode The <code>PageMode</code> to set for the PDF viewer. <code>PageMode</code>
     *     values: <code>UseNone</code>, <code>UseOutlines</code>, <code>UseThumbs</code>, <code>
     *     FullScreen</code>, <code>UseOC</code>, <code>UseAttachments</code>.
     */
    public static void setCatalogViewerPreferences(PDDocument document, PageMode pageMode) {
        try {
            PDDocumentCatalog catalog = document.getDocumentCatalog();
            if (catalog != null) {
                COSDictionary catalogDict = catalog.getCOSObject();

                catalog.setPageMode(pageMode);
                catalogDict.setName(COSName.PAGE_MODE, pageMode.stringValue());

                COSDictionary viewerPrefs =
                        (COSDictionary) catalogDict.getDictionaryObject(COSName.VIEWER_PREFERENCES);
                if (viewerPrefs == null) {
                    viewerPrefs = new COSDictionary();
                    catalogDict.setItem(COSName.VIEWER_PREFERENCES, viewerPrefs);
                }

                viewerPrefs.setName(
                        COSName.getPDFName("NonFullScreenPageMode"), pageMode.stringValue());

                viewerPrefs.setBoolean(COSName.getPDFName("DisplayDocTitle"), true);

                log.info(
                        "Set PDF PageMode to UseAttachments to automatically show attachments pane");
            }
        } catch (Exception e) {
            log.error("Failed to set catalog viewer preferences for attachments", e);
        }
    }
}

package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.springframework.stereotype.Service;

/** Service class responsible for removing image objects from a PDF document. */
@Service
public class PdfImageRemovalService {

    /**
     * Removes all image objects from the provided PDF document.
     *
     * <p>This method iterates over each page in the document and removes any image XObjects found
     * in the page's resources.
     *
     * @param document The PDF document from which images will be removed.
     * @return The modified PDF document with images removed.
     * @throws IOException If an error occurs while processing the PDF document.
     */
    public PDDocument removeImagesFromPdf(PDDocument document) throws IOException {
        // Iterate over each page in the PDF document
        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            // Collect the XObject names to remove
            List<COSName> namesToRemove = new ArrayList<>();

            // Iterate over all XObject names in the page's resources
            for (COSName name : resources.getXObjectNames()) {
                // Check if the XObject is an image
                if (resources.isImageXObject(name)) {
                    // Collect the name for removal
                    namesToRemove.add(name);
                }
            }

            // Now, modify the resources by removing the collected names
            for (COSName name : namesToRemove) {
                resources.put(name, (PDXObject) null);
            }
        }
        return document;
    }
}

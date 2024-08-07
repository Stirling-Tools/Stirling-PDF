package stirling.software.SPDF.service;

import java.io.IOException;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.springframework.stereotype.Service;

@Service
public class PdfImageRemovalService {

    public PDDocument removeImagesFromPdf(PDDocument document) throws IOException {

        for (PDPage page : document.getPages()) {
            PDResources resources = page.getResources();
            for (COSName name : resources.getXObjectNames()) {
                if (resources.isImageXObject(name)) {
                    resources.getXObject(name).getCOSObject().clear();
                }
            }
        }

        return document;
    }
}

package stirling.software.common.service;

import java.io.IOException;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

public interface LineArtConversionService {
    PDImageXObject convertImageToLineArt(
            PDDocument doc, PDImageXObject originalImage, double threshold, int edgeLevel)
            throws IOException;
}

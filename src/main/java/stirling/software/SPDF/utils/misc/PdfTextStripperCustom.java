package stirling.software.SPDF.utils.misc;

import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripperByArea;
import org.apache.pdfbox.text.TextPosition;

public class PdfTextStripperCustom extends PDFTextStripperByArea {

    /**
     * Constructor.
     *
     * @throws IOException If there is an error loading properties.
     */
    public PdfTextStripperCustom() throws IOException {}

    // To process the page text using stripper and returns the TextPosition and its values
    public List<List<TextPosition>> processPageCustom(PDPage page) throws IOException {

        addRegion(
                "wholePage",
                new Rectangle2D.Float(
                        page.getMediaBox().getLowerLeftX(),
                        page.getMediaBox().getLowerLeftY(),
                        page.getMediaBox().getWidth(),
                        page.getMediaBox().getHeight()));
        extractRegions(page);

        List<List<TextPosition>> textPositions = getCharactersByArticle();

        return textPositions;
    }
}

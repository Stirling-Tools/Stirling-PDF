package stirling.software.SPDF.controller.api.strippers;

import java.awt.Shape;
import java.awt.geom.AffineTransform;
import java.awt.geom.Rectangle2D;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Set;

import org.apache.fontbox.util.BoundingBox;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType3Font;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.PDFTextStripperByArea;
import org.apache.pdfbox.text.TextPosition;

/**
 * Class to extract tabular data from a PDF. Works by making a first pass of the page to group all
 * nearby text items together, and then inferring a 2D grid from these regions. Each table cell is
 * then extracted using a PDFTextStripperByArea object.
 *
 * <p>Works best when headers are included in the detected region, to ensure representative text in
 * every column.
 *
 * <p>Based upon DrawPrintTextLocations PDFBox example
 * (https://svn.apache.org/viewvc/pdfbox/trunk/examples/src/main/java/org/apache/pdfbox/examples/util/DrawPrintTextLocations.java)
 *
 * @author Beldaz
 */
public class PDFTableStripper extends PDFTextStripper {

    /**
     * This will print the documents data, for each table cell.
     *
     * @param args The command line arguments.
     * @throws IOException If there is an error parsing the document.
     */
    /*
     *  Used in methods derived from DrawPrintTextLocations
     */
    private AffineTransform flipAT;

    private AffineTransform rotateAT;

    /** Regions updated by calls to writeString */
    private Set<Rectangle2D> boxes;

    // Border to allow when finding intersections
    private double dx = 1.0; // This value works for me, feel free to tweak (or add setter)
    private double dy = 0.000; // Rows of text tend to overlap, so need to extend

    /** Region in which to find table (otherwise whole page) */
    private Rectangle2D regionArea;

    /** Number of rows in inferred table */
    private int nRows = 0;

    /** Number of columns in inferred table */
    private int nCols = 0;

    /** This is the object that does the text extraction */
    private PDFTextStripperByArea regionStripper;

    /**
     * 1D intervals - used for calculateTableRegions()
     *
     * @author Beldaz
     */
    public static class Interval {
        double start;
        double end;

        public Interval(double start, double end) {
            this.start = start;
            this.end = end;
        }

        public void add(Interval col) {
            if (col.start < start) start = col.start;
            if (col.end > end) end = col.end;
        }

        public static void addTo(Interval x, LinkedList<Interval> columns) {
            int p = 0;
            Iterator<Interval> it = columns.iterator();
            // Find where x should go
            while (it.hasNext()) {
                Interval col = it.next();
                if (x.end >= col.start) {
                    if (x.start <= col.end) { // overlaps
                        x.add(col);
                        it.remove();
                    }
                    break;
                }
                ++p;
            }
            while (it.hasNext()) {
                Interval col = it.next();
                if (x.start > col.end) break;
                x.add(col);
                it.remove();
            }
            columns.add(p, x);
        }
    }

    /**
     * Instantiate a new PDFTableStripper object.
     *
     * @throws IOException If there is an error loading the properties.
     */
    public PDFTableStripper() throws IOException {
        super.setShouldSeparateByBeads(false);
        regionStripper = new PDFTextStripperByArea();
        regionStripper.setSortByPosition(true);
    }

    /**
     * Define the region to group text by.
     *
     * @param rect The rectangle area to retrieve the text from.
     */
    public void setRegion(Rectangle2D rect) {
        regionArea = rect;
    }

    public int getRows() {
        return nRows;
    }

    public int getColumns() {
        return nCols;
    }

    /**
     * Get the text for the region, this should be called after extractTable().
     *
     * @return The text that was identified in that region.
     */
    public String getText(int row, int col) {
        return regionStripper.getTextForRegion("el" + col + "x" + row);
    }

    public void extractTable(PDPage pdPage) throws IOException {
        setStartPage(getCurrentPageNo());
        setEndPage(getCurrentPageNo());

        boxes = new HashSet<Rectangle2D>();
        // flip y-axis
        flipAT = new AffineTransform();
        flipAT.translate(0, pdPage.getBBox().getHeight());
        flipAT.scale(1, -1);

        // page may be rotated
        rotateAT = new AffineTransform();
        int rotation = pdPage.getRotation();
        if (rotation != 0) {
            PDRectangle mediaBox = pdPage.getMediaBox();
            switch (rotation) {
                case 90:
                    rotateAT.translate(mediaBox.getHeight(), 0);
                    break;
                case 270:
                    rotateAT.translate(0, mediaBox.getWidth());
                    break;
                case 180:
                    rotateAT.translate(mediaBox.getWidth(), mediaBox.getHeight());
                    break;
                default:
                    break;
            }
            rotateAT.rotate(Math.toRadians(rotation));
        }
        // Trigger processing of the document so that writeString is called.
        try (Writer dummy = new OutputStreamWriter(new ByteArrayOutputStream())) {
            super.output = dummy;
            super.processPage(pdPage);
        }

        Rectangle2D[][] regions = calculateTableRegions();

        //        System.err.println("Drawing " + nCols + "x" + nRows + "="+ nRows*nCols + "
        // regions");
        for (int i = 0; i < nCols; ++i) {
            for (int j = 0; j < nRows; ++j) {
                final Rectangle2D region = regions[i][j];
                regionStripper.addRegion("el" + i + "x" + j, region);
            }
        }

        regionStripper.extractRegions(pdPage);
    }

    /**
     * Infer a rectangular grid of regions from the boxes field.
     *
     * @return 2D array of table regions (as Rectangle2D objects). Note that some of these regions
     *     may have no content.
     */
    private Rectangle2D[][] calculateTableRegions() {

        // Build up a list of all table regions, based upon the populated
        // regions of boxes field. Treats the horizontal and vertical extents
        // of each box as distinct
        LinkedList<Interval> columns = new LinkedList<Interval>();
        LinkedList<Interval> rows = new LinkedList<Interval>();

        for (Rectangle2D box : boxes) {
            Interval x = new Interval(box.getMinX(), box.getMaxX());
            Interval y = new Interval(box.getMinY(), box.getMaxY());

            Interval.addTo(x, columns);
            Interval.addTo(y, rows);
        }

        nRows = rows.size();
        nCols = columns.size();
        Rectangle2D[][] regions = new Rectangle2D[nCols][nRows];
        int i = 0;
        // Label regions from top left, rather than the transformed orientation
        for (Interval column : columns) {
            int j = 0;
            for (Interval row : rows) {
                regions[nCols - i - 1][nRows - j - 1] =
                        new Rectangle2D.Double(
                                column.start,
                                row.start,
                                column.end - column.start,
                                row.end - row.start);
                ++j;
            }
            ++i;
        }

        return regions;
    }

    /**
     * Register each character's bounding box, updating boxes field to maintain a list of all
     * distinct groups of characters.
     *
     * <p>Overrides the default functionality of PDFTextStripper. Most of this is taken from
     * DrawPrintTextLocations.java, with extra steps at end of main loop
     */
    @Override
    protected void writeString(String string, List<TextPosition> textPositions) throws IOException {
        for (TextPosition text : textPositions) {
            // glyph space -> user space
            // note: text.getTextMatrix() is *not* the Text Matrix, it's the Text Rendering Matrix
            AffineTransform at = text.getTextMatrix().createAffineTransform();
            PDFont font = text.getFont();
            BoundingBox bbox = font.getBoundingBox();

            // advance width, bbox height (glyph space)
            float xadvance =
                    font.getWidth(text.getCharacterCodes()[0]); // todo: should iterate all chars
            Rectangle2D.Float rect =
                    new Rectangle2D.Float(0, bbox.getLowerLeftY(), xadvance, bbox.getHeight());

            if (font instanceof PDType3Font) {
                // bbox and font matrix are unscaled
                at.concatenate(font.getFontMatrix().createAffineTransform());
            } else {
                // bbox and font matrix are already scaled to 1000
                at.scale(1 / 1000f, 1 / 1000f);
            }
            Shape s = at.createTransformedShape(rect);
            s = flipAT.createTransformedShape(s);
            s = rotateAT.createTransformedShape(s);

            //
            // Merge character's bounding box with boxes field
            //
            Rectangle2D bounds = s.getBounds2D();
            // Pad sides to detect almost touching boxes
            Rectangle2D hitbox = bounds.getBounds2D();
            hitbox.add(bounds.getMinX() - dx, bounds.getMinY() - dy);
            hitbox.add(bounds.getMaxX() + dx, bounds.getMaxY() + dy);

            // Find all overlapping boxes
            List<Rectangle2D> intersectList = new ArrayList<Rectangle2D>();
            for (Rectangle2D box : boxes) {
                if (box.intersects(hitbox)) {
                    intersectList.add(box);
                }
            }

            // Combine all touching boxes and update
            // (NOTE: Potentially this could leave some overlapping boxes un-merged,
            // but it's sufficient for now and get's fixed up in calculateTableRegions)
            for (Rectangle2D box : intersectList) {
                bounds.add(box);
                boxes.remove(box);
            }
            boxes.add(bounds);
        }
    }

    /**
     * This method does nothing in this derived class, because beads and regions are incompatible.
     * Beads are ignored when stripping by area.
     *
     * @param aShouldSeparateByBeads The new grouping of beads.
     */
    @Override
    public final void setShouldSeparateByBeads(boolean aShouldSeparateByBeads) {}

    /** Adapted from PDFTextStripperByArea {@inheritDoc} */
    @Override
    protected void processTextPosition(TextPosition text) {
        if (regionArea != null && !regionArea.contains(text.getX(), text.getY())) {
            // skip character
        } else {
            super.processTextPosition(text);
        }
    }
}

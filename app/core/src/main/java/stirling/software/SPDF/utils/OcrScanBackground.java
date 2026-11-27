package stirling.software.SPDF.utils;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;

public final class OcrScanBackground {

    private static final float MIN_PAGE_COVERAGE = 0.9f;
    private static final int MAX_FORM_DEPTH = 8;
    private static final COSName ARTIFACT = COSName.getPDFName("Artifact");
    private static final COSName BACKGROUND = COSName.getPDFName("Background");

    private OcrScanBackground() {}

    public static int markScanBackgrounds(PDDocument document) throws IOException {
        int marked = 0;
        for (PDPage page : document.getPages()) {
            if (markPage(document, page)) {
                marked++;
            }
        }
        return marked;
    }

    private static boolean markPage(PDDocument document, PDPage page) throws IOException {
        PDResources resources = page.getResources();
        if (resources == null) {
            return false;
        }
        List<Object> tokens = new PDFStreamParser(page).parse();
        Set<COSBase> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        if (!hasInvisibleText(tokens, resources, visited, 0)) {
            return false;
        }

        PDRectangle pageBox = page.getCropBox();
        List<Object> output = new ArrayList<>(tokens.size() + 8);
        List<COSBase> operands = new ArrayList<>();
        Deque<Matrix> ctm = new ArrayDeque<>();
        ctm.push(new Matrix());
        int markedDepth = 0;
        boolean changed = false;

        for (Object token : tokens) {
            if (!(token instanceof Operator operator)) {
                operands.add((COSBase) token);
                continue;
            }
            switch (operator.getName()) {
                case "q" -> ctm.push(ctm.peek().clone());
                case "Q" -> {
                    if (ctm.size() > 1) {
                        ctm.pop();
                    }
                }
                case "cm" -> {
                    if (operands.size() == 6) {
                        Matrix m = matrixOf(operands);
                        Matrix current = ctm.pop();
                        ctm.push(m.multiply(current));
                    }
                }
                case "BDC", "BMC" -> markedDepth++;
                case "EMC" -> markedDepth = Math.max(0, markedDepth - 1);
                default -> {}
            }

            if ("Do".equals(operator.getName())
                    && markedDepth == 0
                    && operands.size() == 1
                    && operands.get(0) instanceof COSName name
                    && resources.getXObject(name) instanceof PDImageXObject) {
                PDRectangle imageBox = unitSquareBounds(ctm.peek());
                if (coverage(imageBox, pageBox) >= MIN_PAGE_COVERAGE) {
                    output.add(ARTIFACT);
                    output.add(backgroundProperties(imageBox));
                    output.add(Operator.getOperator("BDC"));
                    output.addAll(operands);
                    output.add(operator);
                    output.add(Operator.getOperator("EMC"));
                    operands.clear();
                    changed = true;
                    continue;
                }
            }

            output.addAll(operands);
            output.add(operator);
            operands.clear();
        }

        if (changed) {
            PDStream stream = new PDStream(document);
            try (OutputStream out = stream.createOutputStream(COSName.FLATE_DECODE)) {
                new ContentStreamWriter(out).writeTokens(output);
            }
            page.setContents(stream);
        }
        return changed;
    }

    private static boolean hasInvisibleText(
            List<Object> tokens, PDResources resources, Set<COSBase> visited, int depth)
            throws IOException {
        List<COSBase> operands = new ArrayList<>();
        for (Object token : tokens) {
            if (!(token instanceof Operator operator)) {
                operands.add((COSBase) token);
                continue;
            }
            String name = operator.getName();
            if ("Tr".equals(name)
                    && operands.size() == 1
                    && operands.get(0) instanceof COSNumber mode
                    && (mode.intValue() == 3 || mode.intValue() == 7)) {
                return true;
            }
            if ("Do".equals(name)
                    && depth < MAX_FORM_DEPTH
                    && resources != null
                    && operands.size() == 1
                    && operands.get(0) instanceof COSName xobjectName) {
                PDXObject xobject = resources.getXObject(xobjectName);
                if (xobject instanceof PDFormXObject form && visited.add(form.getCOSObject())) {
                    List<Object> formTokens = new PDFStreamParser(form).parse();
                    PDResources formResources =
                            form.getResources() != null ? form.getResources() : resources;
                    if (hasInvisibleText(formTokens, formResources, visited, depth + 1)) {
                        return true;
                    }
                }
            }
            operands.clear();
        }
        return false;
    }

    private static Matrix matrixOf(List<COSBase> operands) {
        float[] v = new float[6];
        for (int i = 0; i < 6; i++) {
            v[i] = operands.get(i) instanceof COSNumber n ? n.floatValue() : 0f;
        }
        return new Matrix(v[0], v[1], v[2], v[3], v[4], v[5]);
    }

    private static PDRectangle unitSquareBounds(Matrix m) {
        float[][] corners = {{0, 0}, {1, 0}, {0, 1}, {1, 1}};
        float minX = Float.POSITIVE_INFINITY;
        float minY = Float.POSITIVE_INFINITY;
        float maxX = Float.NEGATIVE_INFINITY;
        float maxY = Float.NEGATIVE_INFINITY;
        for (float[] c : corners) {
            float x = c[0] * m.getScaleX() + c[1] * m.getShearX() + m.getTranslateX();
            float y = c[0] * m.getShearY() + c[1] * m.getScaleY() + m.getTranslateY();
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
        return new PDRectangle(minX, minY, maxX - minX, maxY - minY);
    }

    private static float coverage(PDRectangle image, PDRectangle page) {
        float pageArea = page.getWidth() * page.getHeight();
        if (pageArea <= 0) {
            return 0f;
        }
        float w =
                Math.min(image.getUpperRightX(), page.getUpperRightX())
                        - Math.max(image.getLowerLeftX(), page.getLowerLeftX());
        float h =
                Math.min(image.getUpperRightY(), page.getUpperRightY())
                        - Math.max(image.getLowerLeftY(), page.getLowerLeftY());
        return w <= 0 || h <= 0 ? 0f : (w * h) / pageArea;
    }

    private static COSDictionary backgroundProperties(PDRectangle box) {
        COSDictionary properties = new COSDictionary();
        properties.setItem(COSName.TYPE, BACKGROUND);
        COSArray bbox = new COSArray();
        bbox.add(new COSFloat(box.getLowerLeftX()));
        bbox.add(new COSFloat(box.getLowerLeftY()));
        bbox.add(new COSFloat(box.getUpperRightX()));
        bbox.add(new COSFloat(box.getUpperRightY()));
        properties.setItem(COSName.BBOX, bbox);
        return properties;
    }
}

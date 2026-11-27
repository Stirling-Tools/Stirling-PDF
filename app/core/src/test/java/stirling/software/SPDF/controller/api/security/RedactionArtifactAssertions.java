package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.documentinterchange.markedcontent.PDPropertyList;

final class RedactionArtifactAssertions {

    private RedactionArtifactAssertions() {}

    static void assertFillsAreLayoutArtifacts(PDPage page) throws IOException {
        List<Object> tokens = new PDFStreamParser(page).parse();
        Deque<Boolean> open = new ArrayDeque<>();
        List<COSBase> operands = new ArrayList<>();
        int fills = 0;
        for (Object token : tokens) {
            if (!(token instanceof Operator operator)) {
                operands.add((COSBase) token);
                continue;
            }
            switch (operator.getName()) {
                case "BDC" -> open.push(isLayoutArtifact(page, operands));
                case "BMC" -> open.push(false);
                case "EMC" -> open.pop();
                case "re", "f", "F", "f*" -> {
                    assertTrue(
                            open.contains(true),
                            operator.getName() + " drawn outside a Layout artifact");
                    if (!"re".equals(operator.getName())) {
                        fills++;
                    }
                }
                default -> {}
            }
            operands.clear();
        }
        assertTrue(fills > 0, "expected at least one redaction fill");
        assertTrue(open.isEmpty(), "unbalanced marked content");
    }

    private static boolean isLayoutArtifact(PDPage page, List<COSBase> operands) {
        if (operands.size() != 2 || !COSName.ARTIFACT.equals(operands.get(0))) {
            return false;
        }
        COSName propertiesName = assertInstanceOf(COSName.class, operands.get(1));
        PDPropertyList properties = page.getResources().getProperties(propertiesName);
        assertNotNull(properties, "artifact properties missing from page resources");
        assertEquals("Layout", properties.getCOSObject().getNameAsString(COSName.TYPE));
        return true;
    }
}

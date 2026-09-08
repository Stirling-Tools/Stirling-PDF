package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UnlockPDFFormsXfaBoundsTest {

    private static COSStream xfaStream(PDDocument doc, String xml) throws IOException {
        return new PDStream(doc, new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)))
                .getCOSObject();
    }

    @Test
    @DisplayName("XFA data within the bound is decoded")
    void withinBound() throws Exception {
        String xml = "<xdp><template><field access=\"readOnly\"/></template></xdp>";
        try (PDDocument doc = new PDDocument()) {
            assertEquals(xml, UnlockPDFFormsController.readXfaXml(xfaStream(doc, xml), 1024));
        }
    }

    @Test
    @DisplayName("XFA data past the bound is rejected instead of being buffered whole")
    void pastBound() throws Exception {
        String xml = "<xdp>" + "<field/>".repeat(200) + "</xdp>";
        try (PDDocument doc = new PDDocument()) {
            COSStream stream = xfaStream(doc, xml);
            IOException e =
                    assertThrows(
                            IOException.class,
                            () -> UnlockPDFFormsController.readXfaXml(stream, 64));
            assertTrue(e.getMessage().contains("exceeds the maximum supported size"));
        }
    }
}

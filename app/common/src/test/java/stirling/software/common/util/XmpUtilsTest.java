package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.Test;

class XmpUtilsTest {

    @Test
    void parsesAPacketUnderTheLimit() throws Exception {
        XMPMetadata source = XMPMetadata.createXMPMetadata();
        source.createAndAddDublinCoreSchema().setTitle("Report");
        ByteArrayOutputStream packet = new ByteArrayOutputStream();
        new XmpSerializer().serialize(source, packet, true);

        try (PDDocument document = new PDDocument()) {
            PDMetadata metadata = new PDMetadata(document);
            metadata.importXMPMetadata(packet.toByteArray());

            XMPMetadata parsed = XmpUtils.parse(metadata, false);

            assertThat(parsed.getDublinCoreSchema().getTitle()).isEqualTo("Report");
        }
    }

    @Test
    void refusesAPacketOverTheLimit() throws Exception {
        byte[] oversized =
                ("<!--" + "x".repeat(XmpUtils.MAX_XMP_BYTES) + "-->")
                        .getBytes(StandardCharsets.US_ASCII);

        try (PDDocument document = new PDDocument()) {
            PDMetadata metadata = new PDMetadata(document);
            metadata.importXMPMetadata(oversized);

            assertThatThrownBy(() -> XmpUtils.parse(metadata, false))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining(String.valueOf(XmpUtils.MAX_XMP_BYTES));
        }
    }
}

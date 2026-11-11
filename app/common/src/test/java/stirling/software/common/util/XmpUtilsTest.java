package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.DeflaterOutputStream;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.XmpSerializer;
import org.junit.jupiter.api.Test;

import com.sun.management.ThreadMXBean;

class XmpUtilsTest {

    private static final ThreadMXBean THREADS = (ThreadMXBean) ManagementFactory.getThreadMXBean();

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

    @Test
    void decodesAPacketThroughAChainOfFilters() throws Exception {
        XMPMetadata source = XMPMetadata.createXMPMetadata();
        source.createAndAddDublinCoreSchema().setTitle("Report");
        COSStream stream = new COSStream();
        try (OutputStream out =
                stream.createOutputStream(
                        new COSArray(List.of(COSName.ASCII_HEX_DECODE, COSName.FLATE_DECODE)))) {
            new XmpSerializer().serialize(source, out, true);
        }

        XMPMetadata parsed = XmpUtils.parse(new PDMetadata(stream), false);

        assertThat(parsed.getDublinCoreSchema().getTitle()).isEqualTo("Report");
    }

    @Test
    void stopsDecodingACompressedPacketAtTheLimit() throws Exception {
        assumeTrue(THREADS.isThreadAllocatedMemorySupported());
        int decodedSize = 64 * 1024 * 1024;
        COSStream stream = new COSStream();
        stream.setItem(COSName.FILTER, COSName.FLATE_DECODE);
        try (OutputStream out = new DeflaterOutputStream(stream.createRawOutputStream())) {
            byte[] zeros = new byte[1024 * 1024];
            for (int written = 0; written < decodedSize; written += zeros.length) {
                out.write(zeros);
            }
        }

        long before = THREADS.getCurrentThreadAllocatedBytes();
        byte[] packet = XmpUtils.readPacket(stream);
        long allocated = THREADS.getCurrentThreadAllocatedBytes() - before;

        assertThat(packet).hasSize(XmpUtils.MAX_XMP_BYTES + 1);
        assertThat(allocated).isLessThan(decodedSize / 4);
    }

    @Test
    void refusesAFilterThatCannotCarryText() {
        COSStream stream = new COSStream();
        stream.setItem(COSName.FILTER, COSName.DCT_DECODE);

        assertThatThrownBy(() -> XmpUtils.readPacket(stream))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("DCTDecode");
    }
}

package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;

import lombok.experimental.UtilityClass;

/**
 * Parses a document's own XMP packet with a size limit. xmpbox inserts every array item with a
 * linear scan, so parse time grows with the square of an array's length.
 */
@UtilityClass
public class XmpUtils {

    public static final int MAX_XMP_BYTES = 1024 * 1024;

    /**
     * Parses the XMP packet of {@code metadata} with a {@link #MAX_XMP_BYTES}-byte limit.
     *
     * @throws IOException if the packet is larger than {@link #MAX_XMP_BYTES} or cannot be read
     */
    public XMPMetadata parse(PDMetadata metadata, boolean strict)
            throws IOException, XmpParsingException {
        byte[] packet;
        try (InputStream in = metadata.createInputStream()) {
            packet = in.readNBytes(MAX_XMP_BYTES + 1);
        }
        if (packet.length > MAX_XMP_BYTES) {
            throw new IOException("XMP packet is larger than " + MAX_XMP_BYTES + " bytes");
        }
        DomXmpParser parser = new DomXmpParser();
        parser.setStrictParsing(strict);
        return parser.parse(new ByteArrayInputStream(packet));
    }
}

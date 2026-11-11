package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.filter.FilterFactory;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.xml.DomXmpParser;
import org.apache.xmpbox.xml.XmpParsingException;

import lombok.experimental.UtilityClass;

/**
 * Parses a document's own XMP packet with a size limit. xmpbox inserts every array item with a
 * linear scan, so parse time grows with the square of an array's length.
 *
 * <p>The limit applies while the packet is decoded, not after: PDFBox decodes a whole filtered
 * stream into memory before handing it back, so a small compressed packet could otherwise expand to
 * fill the heap. Each filter writes into a buffer that stops at the limit, and only the filters
 * that can carry text are decoded.
 */
@UtilityClass
public class XmpUtils {

    public static final int MAX_XMP_BYTES = 1024 * 1024;

    private static final Set<COSName> TEXT_FILTERS =
            Set.of(
                    COSName.FLATE_DECODE,
                    COSName.FLATE_DECODE_ABBREVIATION,
                    COSName.LZW_DECODE,
                    COSName.LZW_DECODE_ABBREVIATION,
                    COSName.ASCII_HEX_DECODE,
                    COSName.ASCII_HEX_DECODE_ABBREVIATION,
                    COSName.ASCII85_DECODE,
                    COSName.ASCII85_DECODE_ABBREVIATION,
                    COSName.RUN_LENGTH_DECODE,
                    COSName.RUN_LENGTH_DECODE_ABBREVIATION,
                    COSName.CRYPT);

    /**
     * Parses the XMP packet of {@code metadata} with a {@link #MAX_XMP_BYTES}-byte limit.
     *
     * @throws IOException if the packet is larger than {@link #MAX_XMP_BYTES} or cannot be read
     */
    public XMPMetadata parse(PDMetadata metadata, boolean strict)
            throws IOException, XmpParsingException {
        byte[] packet = readPacket(metadata.getCOSObject());
        if (packet.length > MAX_XMP_BYTES) {
            throw new IOException("XMP packet is larger than " + MAX_XMP_BYTES + " bytes");
        }
        DomXmpParser parser = new DomXmpParser();
        parser.setStrictParsing(strict);
        return parser.parse(new ByteArrayInputStream(packet));
    }

    /**
     * The decoded bytes of {@code stream}, at most {@link #MAX_XMP_BYTES} + 1 of them, so a longer
     * result means the packet is over the limit.
     *
     * @throws IOException if the stream cannot be decoded or uses a filter that cannot carry text
     */
    public byte[] readPacket(COSStream stream) throws IOException {
        List<COSName> filters = textFilters(stream);
        try (InputStream raw = stream.createRawInputStream()) {
            if (filters.isEmpty()) {
                return raw.readNBytes(MAX_XMP_BYTES + 1);
            }
            InputStream encoded = raw;
            byte[] decoded = null;
            for (int i = 0; i < filters.size(); i++) {
                CappedOutputStream out = new CappedOutputStream(MAX_XMP_BYTES + 1);
                try {
                    FilterFactory.INSTANCE
                            .getFilter(filters.get(i))
                            .decode(encoded, out, stream, i);
                } catch (IOException e) {
                    if (!out.full) {
                        throw e;
                    }
                }
                decoded = out.bytes.toByteArray();
                if (out.full) {
                    return decoded;
                }
                encoded = new ByteArrayInputStream(decoded);
            }
            return decoded;
        }
    }

    private List<COSName> textFilters(COSStream stream) throws IOException {
        COSBase entry = stream.getFilters();
        List<COSName> filters = new ArrayList<>();
        if (entry instanceof COSName name) {
            filters.add(name);
        } else if (entry instanceof COSArray array) {
            for (COSBase item : array) {
                if (!(item instanceof COSName name)) {
                    throw new IOException("XMP stream has a filter that is not a name");
                }
                // PDFBox drops a repeated filter the same way
                if (!filters.contains(name)) {
                    filters.add(name);
                }
            }
        }
        for (COSName filter : filters) {
            if (!TEXT_FILTERS.contains(filter)) {
                throw new IOException("XMP stream uses the " + filter.getName() + " filter");
            }
        }
        return filters;
    }

    /** Keeps the first {@code capacity} bytes written and refuses anything after them. */
    private static final class CappedOutputStream extends OutputStream {

        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final int capacity;
        private boolean full;

        private CappedOutputStream(int capacity) {
            this.capacity = capacity;
        }

        @Override
        public void write(int b) throws IOException {
            if (bytes.size() >= capacity) {
                throw refuse();
            }
            bytes.write(b);
        }

        @Override
        public void write(byte[] b, int off, int len) throws IOException {
            int room = capacity - bytes.size();
            bytes.write(b, off, Math.min(len, room));
            if (len > room) {
                throw refuse();
            }
        }

        private IOException refuse() {
            full = true;
            return new IOException("Decoded XMP packet is larger than " + MAX_XMP_BYTES + " bytes");
        }
    }
}

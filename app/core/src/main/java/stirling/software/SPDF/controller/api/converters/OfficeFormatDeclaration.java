package stirling.software.SPDF.controller.api.converters;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

import javax.xml.namespace.QName;
import javax.xml.stream.XMLEventReader;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.events.Attribute;
import javax.xml.stream.events.ProcessingInstruction;
import javax.xml.stream.events.StartElement;
import javax.xml.stream.events.XMLEvent;

import org.apache.commons.io.input.BoundedInputStream;
import org.apache.poi.poifs.filesystem.DirectoryNode;
import org.apache.poi.poifs.filesystem.DocumentInputStream;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.OfficeDocumentSanitizer;

/**
 * The format a staged upload declares about itself, read from its own bytes so {@link
 * OfficeImportFilters} can pick between the candidate filters its extension allows.
 *
 * <p>Every fact is read at most once and only when a candidate asks for it, so an extension with a
 * single unconditional candidate never touches the file. Every read is best-effort: anything a
 * hostile file can do to a reader — a compound-file header describing sectors that do not exist,
 * XML that stops mid-element — yields "this fact is unknown", which fails the candidate rather than
 * the request.
 *
 * <p>Not thread-safe, and scoped to one staged file for one request.
 */
@Slf4j
class OfficeFormatDeclaration {

    private static final String OFFICE_NS = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";

    /**
     * How much of an XML document may be read looking for its root element. The reader stops at
     * that element, so this bounds only what a document can put in front of it — comments,
     * whitespace, processing instructions — which is nothing in a real one and unbounded in a
     * hostile one.
     */
    private static final int XML_PROLOG_LIMIT = 4 * 1024 * 1024;

    private static final int FLAT_BIFF_HEADER_LENGTH = 8;

    // The BOF and its longest accepted payload, plus the header of the record that follows it.
    private static final int FLAT_BIFF_HEAD_LENGTH = 24;

    private static final int MAX_BIFF_RECORD_ID = 0x08FF;

    // BIFF BOF record ids by generation, each paired with the version the record must carry.
    private static final int[][] FLAT_BIFF_BOF = {
        {0x0009, 0x0200}, {0x0209, 0x0300}, {0x0409, 0x0400}, {0x0809, 0x0500}, {0x0809, 0x0600}
    };

    private static final Set<Integer> FLAT_BIFF_LENGTHS = Set.of(4, 6, 8, 16);

    // Globals, VB module, worksheet, chart, macro sheet.
    private static final Set<Integer> FLAT_BIFF_SUBSTREAMS =
            Set.of(0x0005, 0x0006, 0x0010, 0x0020, 0x0040);

    private final Path path;

    private Boolean zipContainer;
    private Set<String> compoundStreams;
    private Integer wordDocumentWIdent;
    private Boolean flatBiff;
    private boolean xmlPrologRead;
    private String msoProgId;
    private String odfMimeType;
    private String xmlRootElement;

    OfficeFormatDeclaration(Path path) {
        this.path = path;
    }

    boolean zipContainer() {
        if (zipContainer == null) {
            try (InputStream in = Files.newInputStream(path)) {
                zipContainer = OfficeDocumentSanitizer.looksLikeZipContainer(in);
            } catch (IOException | RuntimeException e) {
                log.debug("ZIP container check failed: {}", e.getMessage());
                zipContainer = Boolean.FALSE;
            }
        }
        return zipContainer;
    }

    boolean hasCompoundStream(String name) {
        return compoundStreams().contains(name.toLowerCase(Locale.ROOT));
    }

    /**
     * The wIdent at the head of the {@code WordDocument} stream, MS-DOC 2.5.1, or null when there
     * is no such stream. This, not the nFib beside it, is what selects the Word importer: a sweep
     * of every nFib against each of the three accepted wIdent values changed nothing.
     */
    Integer wordDocumentWIdent() {
        readCompoundFile();
        return wordDocumentWIdent;
    }

    /** A BIFF workbook written as a bare record stream rather than wrapped in a compound file. */
    boolean flatBiff() {
        if (flatBiff == null) {
            flatBiff = Boolean.valueOf(readFlatBiff());
        }
        return flatBiff;
    }

    /** The {@code progid} of a leading {@code <?mso-application?>}, or null. */
    String msoProgId() {
        readXmlProlog();
        return msoProgId;
    }

    /** The local name of the document's root element, or null when it has no readable one. */
    String xmlRootElement() {
        readXmlProlog();
        return xmlRootElement;
    }

    /** The {@code office:mimetype} of a flat ODF root element, or null. */
    String odfMimeType() {
        readXmlProlog();
        return odfMimeType;
    }

    private Set<String> compoundStreams() {
        readCompoundFile();
        return compoundStreams;
    }

    private void readCompoundFile() {
        if (compoundStreams != null) {
            return;
        }
        compoundStreams = new TreeSet<>();
        try (POIFSFileSystem fs = new POIFSFileSystem(path.toFile(), true)) {
            DirectoryNode root = fs.getRoot();
            for (String name : root.getEntryNames()) {
                compoundStreams.add(name.toLowerCase(Locale.ROOT));
            }
            if (root.hasEntryCaseInsensitive("WordDocument")) {
                try (DocumentInputStream in = fs.createDocumentInputStream("WordDocument")) {
                    byte[] head = in.readNBytes(2);
                    if (head.length == 2) {
                        wordDocumentWIdent = unsignedShort(head, 0);
                    }
                }
            }
        } catch (Exception e) {
            // A hostile header makes POI throw unchecked as well as checked, and one of those
            // fires only part-way through a read, after the directory has listed cleanly.
            log.debug("Compound file unreadable: {}", e.getMessage());
        }
    }

    private boolean readFlatBiff() {
        byte[] head = head(FLAT_BIFF_HEAD_LENGTH);
        if (head.length < FLAT_BIFF_HEADER_LENGTH) {
            return false;
        }
        int record = unsignedShort(head, 0);
        int length = unsignedShort(head, 2);
        int version = unsignedShort(head, 4);
        int substream = unsignedShort(head, 6);
        boolean bof =
                Arrays.stream(FLAT_BIFF_BOF)
                        .anyMatch(pair -> pair[0] == record && pair[1] == version);
        if (!bof
                || !FLAT_BIFF_LENGTHS.contains(length)
                || !FLAT_BIFF_SUBSTREAMS.contains(substream)) {
            return false;
        }
        // The record that must follow the BOF, so eight chosen bytes in front of arbitrary content
        // cannot claim to be a workbook: a substream always carries at least its EOF record, and
        // every id BIFF defines is below 0x0900, which no text or markup byte pair reaches.
        int next = 4 + length;
        if (next + 4 > head.length) {
            return false;
        }
        int nextRecord = unsignedShort(head, next);
        if (nextRecord == 0 || nextRecord > MAX_BIFF_RECORD_ID) {
            return false;
        }
        try {
            return next + 4L + unsignedShort(head, next + 2) <= Files.size(path);
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Reads the declaration with DTD processing off, so a document whose declaration is only
     * reachable through an entity is unreadable rather than read one way here and another by
     * LibreOffice. That also keeps XXE and expansion attacks out of a reader that runs on every
     * upload of a declaring type.
     *
     * <p>Streamed rather than read into a buffer first, so what the reader touches is what it needs
     * to reach the root element and not a fixed prefix: a document whose root element sat past the
     * end of that prefix was a parse error, and so a rejected upload, however small the file was.
     */
    private void readXmlProlog() {
        if (xmlPrologRead) {
            return;
        }
        xmlPrologRead = true;
        BoundedInputStream.Builder bounded = BoundedInputStream.builder();
        XMLEventReader reader = null;
        try (InputStream in = Files.newInputStream(path)) {
            bounded.setInputStream(in);
            bounded.setMaxCount(XML_PROLOG_LIMIT);
            XMLInputFactory factory = XMLInputFactory.newInstance();
            factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
            factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
            factory.setProperty(XMLInputFactory.IS_COALESCING, false);
            reader = factory.createXMLEventReader(bounded.get());
            while (reader.hasNext()) {
                XMLEvent event = reader.nextEvent();
                if (event.isProcessingInstruction()) {
                    ProcessingInstruction instruction = (ProcessingInstruction) event;
                    if ("mso-application".equals(instruction.getTarget())) {
                        msoProgId = progId(instruction.getData());
                    }
                } else if (event.isStartElement()) {
                    StartElement root = event.asStartElement();
                    xmlRootElement = root.getName().getLocalPart();
                    odfMimeType = odfMimeType(root);
                    return;
                }
            }
        } catch (Exception e) {
            log.debug("XML declaration unreadable: {}", e.getMessage());
        } finally {
            closeQuietly(reader);
        }
    }

    private static String odfMimeType(StartElement root) {
        QName name = root.getName();
        if (!OFFICE_NS.equals(name.getNamespaceURI()) || !"document".equals(name.getLocalPart())) {
            return null;
        }
        Attribute mimeType = root.getAttributeByName(new QName(OFFICE_NS, "mimetype"));
        return mimeType == null ? null : mimeType.getValue();
    }

    private static String progId(String data) {
        if (data == null) {
            return null;
        }
        int start = data.indexOf("progid=\"");
        if (start < 0) {
            return null;
        }
        int end = data.indexOf('"', start + "progid=\"".length());
        return end < 0 ? null : data.substring(start + "progid=\"".length(), end);
    }

    private static void closeQuietly(XMLEventReader reader) {
        if (reader == null) {
            return;
        }
        try {
            reader.close();
        } catch (Exception e) {
            log.debug("Closing the declaration reader failed: {}", e.getMessage());
        }
    }

    private byte[] head(int length) {
        try (InputStream in = Files.newInputStream(path)) {
            return in.readNBytes(length);
        } catch (IOException e) {
            log.debug("Could not read the head of the staged upload: {}", e.getMessage());
            return new byte[0];
        }
    }

    private static int unsignedShort(byte[] bytes, int offset) {
        return (bytes[offset] & 0xFF) | ((bytes[offset + 1] & 0xFF) << 8);
    }
}

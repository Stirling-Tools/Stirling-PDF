package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.StringReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.parsers.SAXParserFactory;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;

import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NamedNodeMap;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.XMLReader;

import io.github.pixee.security.ZipSecurity;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

// Strips external/file references from office uploads so LibreOffice can't be made to fetch them.
@Component
@Slf4j
public class OfficeDocumentSanitizer {

    private static final Set<String> ODF_XML_PARTS =
            Set.of("content.xml", "styles.xml", "meta.xml", "settings.xml");

    private static final String MAX_ELEMENT_DEPTH_PROPERTY =
            "http://www.oracle.com/xml/jaxp/properties/maxElementDepth";

    // Secure processing defaults to 100, which real documents exceed: LibreOffice emits depth 109
    // for 35 nested tables, and anything past the cap used to skip sanitization entirely.
    // 512 clears the deepest document LibreOffice produces by ~3x and stays well inside the
    // JAXP serializer's stack budget (it recurses per level, ~0.5KB of stack each).
    private static final int MAX_ELEMENT_DEPTH = 512;

    private static final int ZIP_LOCAL_HEADER_FIELDS = 30;

    private static final int ZIP_NAME_SAMPLE_LENGTH = 32;

    private static final int ZIP_MAX_NAME_LENGTH = 4096;

    // Enough of the previous block to re-examine a header the read boundary split.
    private static final int ZIP_LOCAL_HEADER_CARRY =
            ZIP_LOCAL_HEADER_FIELDS + ZIP_NAME_SAMPLE_LENGTH;

    private static final int ZIP_SCAN_BUFFER_LENGTH = 64 * 1024;

    private static final byte[] COMPOUND_FILE_MAGIC = {
        (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1
    };

    private static final int COMPOUND_FILE_HEADER_LENGTH = 512;

    private static final int COMPOUND_FILE_LITTLE_ENDIAN = 0xFFFE;

    private static final int COMPOUND_FILE_MINI_SECTOR_SHIFT = 6;

    private final SsrfProtectionService ssrfProtectionService;
    private final ApplicationProperties applicationProperties;

    public OfficeDocumentSanitizer(
            SsrfProtectionService ssrfProtectionService,
            ApplicationProperties applicationProperties) {
        this.ssrfProtectionService = ssrfProtectionService;
        this.applicationProperties = applicationProperties;
    }

    public boolean isSanitizationEnabled() {
        return !applicationProperties.getSystem().isDisableSanitize();
    }

    public byte[] sanitize(byte[] documentBytes) throws IOException {
        if (documentBytes == null || documentBytes.length == 0) {
            throw new IOException("Office document input is empty or null");
        }
        if (applicationProperties.getSystem().isDisableSanitize()) {
            log.debug("Office document sanitization disabled by configuration");
            return documentBytes;
        }
        // Structure picks the walker, not the extension: a package and a single XML document are
        // read differently and either can arrive under any of the declared types this is called
        // for. Safe in a way the old HTML sniff was not, because the caller has already forced the
        // import filter from the declared extension, so a wrong guess here changes what is
        // stripped, never what LibreOffice reads.
        if (looksLikeZipContainer(documentBytes)) {
            return sanitizeZipContainer(documentBytes);
        }
        if (looksLikeXml(documentBytes)) {
            return sanitizeFlatXml(documentBytes);
        }
        // Binary formats we can't introspect pass through; the network guard contains their SSRF.
        return documentBytes;
    }

    private byte[] sanitizeZipContainer(byte[] documentBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(documentBytes.length);
        int entriesRead = 0;
        try (ZipInputStream zipIn =
                        ZipSecurity.createHardenedInputStream(
                                new ByteArrayInputStream(documentBytes));
                ZipOutputStream zipOut = new ZipOutputStream(out)) {

            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
                entriesRead++;
                String name = entry.getName();
                byte[] bytes = entry.isDirectory() ? new byte[0] : zipIn.readAllBytes();

                if (!entry.isDirectory()) {
                    bytes = sanitizeEntry(name, bytes);
                }

                ZipEntry outEntry = new ZipEntry(name);
                if (entry.getComment() != null) {
                    outEntry.setComment(entry.getComment());
                }
                if (entry.getExtra() != null) {
                    outEntry.setExtra(entry.getExtra());
                }
                zipOut.putNextEntry(outEntry);
                if (!entry.isDirectory()) {
                    zipOut.write(bytes);
                }
                zipOut.closeEntry();
            }
        } catch (UnsanitizableDocumentException e) {
            throw e;
        } catch (IOException e) {
            // Whatever the ZIP machinery objects to is a property of an attacker-chosen archive,
            // and its complaint names the entry: a repeated name, which readers disagree about,
            // arrives here as ZipException("duplicate entry: …"). Refuse it under the fixed
            // message rather than reflecting the name into the response.
            log.warn("ZIP package could not be rewritten: {}", e.getMessage());
            throw new UnsanitizableDocumentException();
        }
        // A container whose entries we cannot walk from offset 0 (bytes prepended ahead of the
        // first local header) would leave every part unsanitized, so reject rather than emit it.
        if (entriesRead == 0) {
            throw new UnsanitizableDocumentException();
        }
        return out.toByteArray();
    }

    /**
     * Raised for an upload this sanitizer cannot make safe, so the caller must refuse it rather
     * than convert it. The message is fixed: it is copied into the response body, and the parts of
     * these documents that a message would want to name — a ZIP entry name, a parser complaint —
     * are attacker-chosen text.
     */
    public static class UnsanitizableDocumentException extends IOException {
        public UnsanitizableDocumentException() {
            super("Document could not be sanitized and was rejected");
        }

        protected UnsanitizableDocumentException(String message) {
            super(message);
        }
    }

    /**
     * Raised for a document that begins with markup but is not well-formed XML. LibreOffice imports
     * exactly that with its HTML filter and fetches what the markup references, whatever tag it
     * starts with, so the caller must hand these bytes to an HTML sanitizer rather than convert
     * them. Content that does not begin with markup never reaches this and is left alone, which is
     * what keeps .txt/.csv uploads converting.
     */
    public static class HtmlMarkupException extends UnsanitizableDocumentException {
        public HtmlMarkupException() {
            super("Document is markup that is not well-formed XML; it needs an HTML sanitizer");
        }
    }

    // Flat single-file XML: strip all out-of-document refs; fail CLOSED on unparseable XML.
    byte[] sanitizeFlatXml(byte[] xmlBytes) throws IOException {
        byte[] cleaned = tryStripFlatXml(xmlBytes, false);
        if (cleaned != null) {
            return cleaned;
        }
        // A DOCTYPE trips the hardened parser. Rewriting it keeps the internal subset, which
        // Illustrator's SVG relies on for the namespace entities its root element references, and
        // drops only the external identifier the retry parse must not be allowed to resolve.
        byte[] rewritten = stripExternalDoctypeIdentifier(xmlBytes);
        if (rewritten != null) {
            cleaned = tryStripFlatXml(rewritten, true);
            if (cleaned != null) {
                return cleaned;
            }
        }
        if (!isWellFormedXml(xmlBytes) && (rewritten == null || !isWellFormedXml(rewritten))) {
            throw new HtmlMarkupException();
        }
        throw new UnsanitizableDocumentException();
    }

    // Well-formedness only: tells a malformed text file apart from XML we refused to sanitize.
    private static boolean isWellFormedXml(byte[] xmlBytes) {
        try {
            SAXParserFactory factory = SAXParserFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature(
                    "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            XMLReader reader = factory.newSAXParser().getXMLReader();
            // SAX is iterative, so depth is free here; a deep document must still count as
            // well-formed or it would slip out through the pass-through branch above.
            try {
                reader.setProperty(MAX_ELEMENT_DEPTH_PROPERTY, 0);
            } catch (SAXException e) {
                log.debug("Parser does not support {}", MAX_ELEMENT_DEPTH_PROPERTY);
            }
            reader.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
            reader.parse(new InputSource(new ByteArrayInputStream(xmlBytes)));
            return true;
        } catch (ParserConfigurationException | SAXException | IOException e) {
            return false;
        }
    }

    // Returns null (not the original bytes) to signal a parse failure to the caller.
    private byte[] tryStripFlatXml(byte[] xmlBytes, boolean afterDoctypeRewrite) {
        try {
            Document doc = parseSecurely(xmlBytes, afterDoctypeRewrite);
            Element root = doc.getDocumentElement();
            if (root == null) {
                return xmlBytes;
            }
            boolean modified = stripExternalHrefs(root, true);
            if (!modified && !afterDoctypeRewrite) {
                return xmlBytes;
            }
            return serializeDocument(doc);
        } catch (ParserConfigurationException
                | SAXException
                | IOException
                | TransformerException e) {
            log.warn("Single-file XML did not parse for sanitization: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Rewrites {@code <!DOCTYPE name PUBLIC/SYSTEM "..." [subset]>} to {@code <!DOCTYPE name
     * [subset]>}, so the declarations the document's own markup references survive while the
     * identifier that names a document off this machine does not. Null when there is no DOCTYPE, it
     * is unterminated, or the bytes are not UTF-8-compatible.
     *
     * <p>Quote state is tracked alongside bracket depth because {@code >} and {@code ]} are legal
     * inside a system literal or an entity value, and a scanner that stops at the first bare {@code
     * >} truncates the declaration and leaves the tail of it sitting in the prolog.
     */
    static byte[] stripExternalDoctypeIdentifier(byte[] xmlBytes) {
        String s = new String(xmlBytes, StandardCharsets.UTF_8);
        int start = s.indexOf("<!DOCTYPE");
        if (start < 0) {
            return null;
        }
        int i = start + "<!DOCTYPE".length();
        while (i < s.length() && Character.isWhitespace(s.charAt(i))) {
            i++;
        }
        int nameStart = i;
        while (i < s.length()
                && !Character.isWhitespace(s.charAt(i))
                && s.charAt(i) != '['
                && s.charAt(i) != '>') {
            i++;
        }
        String name = s.substring(nameStart, i);
        if (name.isEmpty()) {
            return null;
        }
        int subsetStart = -1;
        int subsetEnd = -1;
        int depth = 0;
        char quote = 0;
        for (; i < s.length(); i++) {
            char c = s.charAt(i);
            if (quote != 0) {
                if (c == quote) {
                    quote = 0;
                }
            } else if (c == '"' || c == '\'') {
                quote = c;
            } else if (c == '[') {
                if (depth == 0) {
                    subsetStart = i + 1;
                }
                depth++;
            } else if (c == ']') {
                if (depth > 0 && --depth == 0) {
                    subsetEnd = i;
                }
            } else if (c == '>' && depth == 0) {
                String subset =
                        subsetStart >= 0 && subsetEnd >= subsetStart
                                ? " [" + s.substring(subsetStart, subsetEnd) + "]"
                                : "";
                return (s.substring(0, start)
                                + "<!DOCTYPE "
                                + name
                                + subset
                                + ">"
                                + s.substring(i + 1))
                        .getBytes(StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    /**
     * True when LibreOffice can read a ZIP package out of the stream. A package member is only
     * reachable through its local file header, so the whole stream is searched for one: LibreOffice
     * recovers a package from the local headers when the end-of-central-directory record does not
     * describe the file, so prefixed bytes, appended junk of any length and a forged record all
     * still open. Deciding from that record instead leaves every one of those as a way past
     * sanitization.
     *
     * <p>A document whose head is a compound file header (.doc/.xls/.ppt) is excluded: LibreOffice
     * reads that with a different filter, so an OOXML object embedded in one is never the
     * document's own package.
     *
     * <p>Consumes the stream; the caller owns closing it.
     */
    public static boolean looksLikeZipContainer(InputStream document) throws IOException {
        byte[] window = new byte[ZIP_SCAN_BUFFER_LENGTH];
        int carried = 0;
        boolean headChecked = false;
        while (true) {
            int read = document.readNBytes(window, carried, window.length - carried);
            int filled = carried + read;
            if (!headChecked) {
                headChecked = true;
                if (isCompoundFile(window, filled)) {
                    return false;
                }
            }
            boolean lastBlock = read < window.length - carried;
            for (int i = 0; i + ZIP_LOCAL_HEADER_FIELDS <= filled; i++) {
                if (isLocalFileHeaderAt(window, i, filled)) {
                    return true;
                }
            }
            if (lastBlock) {
                return false;
            }
            carried = Math.min(filled, ZIP_LOCAL_HEADER_CARRY);
            System.arraycopy(window, filled - carried, window, 0, carried);
        }
    }

    /** Whole-document form of {@link #looksLikeZipContainer(InputStream)}. */
    public static boolean looksLikeZipContainer(byte[] documentBytes) {
        try (InputStream in = new ByteArrayInputStream(documentBytes)) {
            return looksLikeZipContainer(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * True when the head is a compound file header, checked field by field rather than by its magic
     * alone. Verified against LibreOffice: these fields are what make it commit to the
     * compound-file filter and stop looking for a package, so a header that satisfies them cannot
     * also be a way to smuggle one in, while the magic on its own is eight bytes anyone can prepend
     * to an archive.
     */
    private static boolean isCompoundFile(byte[] head, int length) {
        if (length < COMPOUND_FILE_HEADER_LENGTH) {
            return false;
        }
        for (int i = 0; i < COMPOUND_FILE_MAGIC.length; i++) {
            if (head[i] != COMPOUND_FILE_MAGIC[i]) {
                return false;
            }
        }
        if (readUnsignedShort(head, 28) != COMPOUND_FILE_LITTLE_ENDIAN) {
            return false;
        }
        int majorVersion = readUnsignedShort(head, 26);
        int sectorShift = readUnsignedShort(head, 30);
        boolean versionMatchesSectorSize =
                (majorVersion == 3 && sectorShift == 9) || (majorVersion == 4 && sectorShift == 12);
        return versionMatchesSectorSize
                && readUnsignedShort(head, 32) == COMPOUND_FILE_MINI_SECTOR_SHIFT
                && readUnsignedShort(head, 44) + readUnsignedShort(head, 46) > 0;
    }

    /**
     * True when a local file header starts at {@code i}. The signature alone turns up by chance
     * inside binary documents, so the name is checked with it: it is never empty, never holds a
     * control character, and is short, because LibreOffice finds the parts it needs (content.xml,
     * word/document.xml) by those names. An attacker cannot weaken any of that and still have the
     * package open, which is what the compression method and the central directory fail: forge
     * either and LibreOffice recovers the package anyway.
     */
    private static boolean isLocalFileHeaderAt(byte[] b, int i, int limit) {
        if (b[i] != 'P' || b[i + 1] != 'K' || b[i + 2] != 3 || b[i + 3] != 4) {
            return false;
        }
        int nameLength = readUnsignedShort(b, i + 26);
        if (nameLength == 0 || nameLength > ZIP_MAX_NAME_LENGTH) {
            return false;
        }
        int nameEnd =
                Math.min(
                        limit,
                        i + ZIP_LOCAL_HEADER_FIELDS + Math.min(nameLength, ZIP_NAME_SAMPLE_LENGTH));
        for (int n = i + ZIP_LOCAL_HEADER_FIELDS; n < nameEnd; n++) {
            int c = b[n] & 0xFF;
            if (c < 0x20 || c == 0x7F) {
                return false;
            }
        }
        return true;
    }

    private static int readUnsignedShort(byte[] b, int offset) {
        return (b[offset] & 0xFF) | ((b[offset + 1] & 0xFF) << 8);
    }

    /**
     * True when the bytes begin (past any BOM and whitespace) with a {@code <}. The whitespace set
     * is LibreOffice's, not Java's: its markup importers skip a leading form feed (0x0C) and a
     * leading NUL, so a set that did not would call the same bytes markup that LibreOffice does
     * not.
     */
    public static boolean looksLikeXml(byte[] b) {
        int i = 0;
        int n = b.length;
        if (n >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) {
            i = 3; // UTF-8 BOM
        } else if (n >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xFE) {
            i = 2; // UTF-16 LE BOM
        } else if (n >= 2 && (b[0] & 0xFF) == 0xFE && (b[1] & 0xFF) == 0xFF) {
            i = 2; // UTF-16 BE BOM
        }
        for (; i < n; i++) {
            byte c = b[i];
            if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\f' || c == 0) {
                continue;
            }
            return c == '<';
        }
        return false;
    }

    // Fails CLOSED: a part we cannot parse must not be handed to LibreOffice unsanitized,
    // or nesting an external href past a parser limit would bypass sanitization entirely.
    private byte[] sanitizeEntry(String entryName, byte[] entryBytes) throws IOException {
        String lower = entryName.toLowerCase(Locale.ROOT);
        boolean rels = lower.endsWith(".rels");
        if (!rels && !isOdfXmlPart(lower)) {
            return entryBytes;
        }
        try {
            return rels ? sanitizeOoxmlRels(entryBytes, false) : sanitizeOdfXml(entryBytes, false);
        } catch (ParserConfigurationException
                | SAXException
                | IOException
                | TransformerException e) {
            byte[] rewritten = stripExternalDoctypeIdentifier(entryBytes);
            if (rewritten != null) {
                try {
                    return rels
                            ? sanitizeOoxmlRels(rewritten, true)
                            : sanitizeOdfXml(rewritten, true);
                } catch (ParserConfigurationException
                        | SAXException
                        | IOException
                        | TransformerException retry) {
                    log.debug(
                            "Retry without an external DOCTYPE id failed: {}", retry.getMessage());
                }
            }
            log.warn("XML part '{}' could not be parsed for sanitization: {}", entryName, e);
            throw new UnsanitizableDocumentException();
        }
    }

    private boolean isOdfXmlPart(String lowerName) {
        int slash = lowerName.lastIndexOf('/');
        String base = slash >= 0 ? lowerName.substring(slash + 1) : lowerName;
        return ODF_XML_PARTS.contains(base);
    }

    private byte[] sanitizeOoxmlRels(byte[] xmlBytes, boolean afterDoctypeRewrite)
            throws IOException, ParserConfigurationException, SAXException, TransformerException {
        Document doc = parseSecurely(xmlBytes, afterDoctypeRewrite);
        Element root = doc.getDocumentElement();
        if (root == null) {
            return xmlBytes;
        }
        NodeList relationships = root.getElementsByTagNameNS("*", "Relationship");
        List<Node> toRemove = new ArrayList<>();
        for (int i = 0; i < relationships.getLength(); i++) {
            Node node = relationships.item(i);
            NamedNodeMap attrs = node.getAttributes();
            if (attrs == null) {
                continue;
            }
            Node targetMode = attrs.getNamedItem("TargetMode");
            if (targetMode == null || !"external".equalsIgnoreCase(targetMode.getNodeValue())) {
                continue;
            }
            Node target = attrs.getNamedItem("Target");
            String targetValue = target == null ? "" : target.getNodeValue();
            if (isAdminAllowed(targetValue)) {
                continue;
            }
            log.warn(
                    "Stripping OOXML external relationship target: {}",
                    truncateForLog(targetValue));
            toRemove.add(node);
        }
        if (toRemove.isEmpty() && !afterDoctypeRewrite) {
            return xmlBytes;
        }
        for (Node n : toRemove) {
            n.getParentNode().removeChild(n);
        }
        return serializeDocument(doc);
    }

    private byte[] sanitizeOdfXml(byte[] xmlBytes, boolean afterDoctypeRewrite)
            throws IOException, ParserConfigurationException, SAXException, TransformerException {
        Document doc = parseSecurely(xmlBytes, afterDoctypeRewrite);
        Element root = doc.getDocumentElement();
        if (root == null) {
            return xmlBytes;
        }
        boolean modified = stripExternalHrefs(root, false);
        if (!modified && !afterDoctypeRewrite) {
            return xmlBytes;
        }
        return serializeDocument(doc);
    }

    // flatMode: flat XML has no package, so strip all refs but #frag/data: (zip keeps relatives).
    // Iterative so document nesting depth can never cost stack frames.
    private boolean stripExternalHrefs(Node root, boolean flatMode) {
        boolean modified = false;
        Deque<Node> pending = new ArrayDeque<>();
        pending.push(root);
        while (!pending.isEmpty()) {
            Node node = pending.pop();
            if (node.getNodeType() == Node.ELEMENT_NODE) {
                NamedNodeMap attrs = node.getAttributes();
                List<String> attrsToRemove = new ArrayList<>();
                for (int i = 0; i < attrs.getLength(); i++) {
                    Node attr = attrs.item(i);
                    String name = attr.getNodeName();
                    if (name == null || !isReferenceAttribute(name)) {
                        continue;
                    }
                    String value = attr.getNodeValue();
                    boolean dangerous =
                            flatMode ? isOutsideDocumentRef(value) : isExternalUrl(value);
                    if (!dangerous || isAdminAllowed(value)) {
                        continue;
                    }
                    log.warn("Stripping reference attribute ({}): {}", name, truncateForLog(value));
                    attrsToRemove.add(name);
                }
                Element element = (Element) node;
                for (String attrName : attrsToRemove) {
                    element.removeAttribute(attrName);
                    if (element.hasAttribute(attrName)) {
                        // An <!ATTLIST> default is re-applied the moment it is removed, so the
                        // only way to take the value away is to overwrite it.
                        element.setAttribute(attrName, "");
                    }
                    modified = true;
                }
            }
            NodeList children = node.getChildNodes();
            for (int i = 0; i < children.getLength(); i++) {
                pending.push(children.item(i));
            }
        }
        return modified;
    }

    // background is HTML's third fetching attribute: LibreOffice's HTML import loads it like src.
    private static boolean isReferenceAttribute(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.equals("href")
                || lower.endsWith(":href")
                || lower.equals("src")
                || lower.endsWith(":src")
                || lower.equals("background")
                || lower.endsWith(":background");
    }

    /**
     * Flat XML: anything but a #fragment, a data: URI or a {@code wordml:} name points outside the
     * document and is stripped. {@code wordml://Image1} is how MS Word 2003 XML addresses a picture
     * it carries itself, in the {@code <w:binData w:name>} beside it, and it can resolve to nothing
     * else — there is no {@code wordml} protocol handler to reach the network with. Stripping it
     * cost every picture in every WordML upload.
     */
    private static boolean isOutsideDocumentRef(String url) {
        if (url == null) {
            return false;
        }
        String trimmed = url.trim();
        if (trimmed.isEmpty()) {
            return false;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return !(lower.startsWith("#") || lower.startsWith("data:") || lower.startsWith("wordml:"));
    }

    private boolean isExternalUrl(String url) {
        if (url == null) {
            return false;
        }
        String trimmed = url.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("../")) {
            return false;
        }
        // Absolute/UNC/drive-letter paths are never valid in-package references.
        if (trimmed.startsWith("/") || trimmed.startsWith("\\")) {
            return true;
        }
        if (trimmed.length() >= 3
                && Character.isLetter(trimmed.charAt(0))
                && trimmed.charAt(1) == ':'
                && (trimmed.charAt(2) == '\\' || trimmed.charAt(2) == '/')) {
            return true;
        }
        return trimmed.startsWith("http://")
                || trimmed.startsWith("https://")
                || trimmed.startsWith("ftp://")
                || trimmed.startsWith("ftps://")
                || trimmed.startsWith("file:")
                || trimmed.startsWith("smb:")
                || trimmed.startsWith("webdav:")
                || trimmed.startsWith("davs:")
                || trimmed.startsWith("dav:")
                || trimmed.startsWith("vnd.sun.star.webdav:")
                || trimmed.startsWith("vnd.sun.star.pkg:");
    }

    // Preserved only with an explicit allowedDomains entry; MEDIUM default would admit public URLs.
    private boolean isAdminAllowed(String url) {
        if (ssrfProtectionService == null || url == null || url.isBlank()) {
            return false;
        }
        ApplicationProperties.Html.UrlSecurity config =
                applicationProperties.getSystem().getHtml().getUrlSecurity();
        if (config == null
                || config.getAllowedDomains() == null
                || config.getAllowedDomains().isEmpty()) {
            return false;
        }
        return ssrfProtectionService.isUrlAllowed(url);
    }

    /**
     * Parses with every external-resolution route off. {@code afterDoctypeRewrite} is for the retry
     * that follows {@link #stripExternalDoctypeIdentifier}: by then the declaration names no
     * external identifier, so what it can still declare is entities, and those must be expanded —
     * an unexpanded reference would be serialized with its declaration gone, and an expanded one
     * puts the value where {@link #stripExternalHrefs} can see and strip it. Expansion stays
     * bounded by {@code jdk.xml.entityExpansionLimit} under secure processing, and callers on this
     * path serialize unconditionally, so no surviving declaration reaches LibreOffice.
     */
    private Document parseSecurely(byte[] xmlBytes, boolean afterDoctypeRewrite)
            throws ParserConfigurationException, SAXException, IOException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature(
                "http://apache.org/xml/features/disallow-doctype-decl", !afterDoctypeRewrite);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        try {
            factory.setAttribute(MAX_ELEMENT_DEPTH_PROPERTY, MAX_ELEMENT_DEPTH);
        } catch (IllegalArgumentException e) {
            log.debug("Parser does not support {}", MAX_ELEMENT_DEPTH_PROPERTY);
        }
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(afterDoctypeRewrite);
        factory.setNamespaceAware(true);
        DocumentBuilder builder = factory.newDocumentBuilder();
        builder.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
        return builder.parse(new ByteArrayInputStream(xmlBytes));
    }

    private byte[] serializeDocument(Document doc) throws TransformerException {
        TransformerFactory tf = TransformerFactory.newInstance();
        tf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.INDENT, "no");
        transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try {
            transformer.transform(new DOMSource(doc), new StreamResult(baos));
        } catch (StackOverflowError e) {
            // The JAXP serializer recurses per element. MAX_ELEMENT_DEPTH keeps it clear of the
            // stack, but on a tiny -Xss turn it into a normal failure so callers fail closed
            // rather than letting an Error escape the request thread.
            throw new TransformerException("Document too deeply nested to serialize safely");
        }
        return baos.toByteArray();
    }

    private String truncateForLog(String value) {
        if (value == null) {
            return "null";
        }
        return value.length() > 80 ? value.substring(0, 80) + "..." : value;
    }
}

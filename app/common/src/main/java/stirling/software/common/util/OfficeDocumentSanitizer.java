package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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
import org.xml.sax.SAXException;

import io.github.pixee.security.ZipSecurity;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

// Strips external/file references from office uploads so LibreOffice can't be made to fetch them.
@Component
@Slf4j
public class OfficeDocumentSanitizer {

    private static final Set<String> OOXML_EXTENSIONS =
            Set.of(
                    "docx", "docm", "dotx", "dotm", "xlsx", "xlsm", "xltx", "xltm", "pptx", "pptm",
                    "potx", "potm", "ppsx", "ppsm");

    private static final Set<String> ODF_EXTENSIONS =
            Set.of(
                    "odt", "ott", "ods", "ots", "odp", "otp", "odg", "otg", "odf", "odc", "odi",
                    "odm");

    private static final Set<String> ODF_XML_PARTS =
            Set.of("content.xml", "styles.xml", "meta.xml", "settings.xml");

    private final SsrfProtectionService ssrfProtectionService;
    private final ApplicationProperties applicationProperties;

    public OfficeDocumentSanitizer(
            SsrfProtectionService ssrfProtectionService,
            ApplicationProperties applicationProperties) {
        this.ssrfProtectionService = ssrfProtectionService;
        this.applicationProperties = applicationProperties;
    }

    public boolean isSanitizableExtension(String extension) {
        if (extension == null) {
            return false;
        }
        String lower = extension.toLowerCase(Locale.ROOT);
        return OOXML_EXTENSIONS.contains(lower) || ODF_EXTENSIONS.contains(lower);
    }

    public byte[] sanitize(byte[] documentBytes, String extension) throws IOException {
        if (documentBytes == null || documentBytes.length == 0) {
            throw new IOException("Office document input is empty or null");
        }
        if (applicationProperties.getSystem().isDisableSanitize()) {
            log.debug("Office document sanitization disabled by configuration");
            return documentBytes;
        }
        // Route by content, not extension (a flat-ODF renamed .xml still needs sanitizing).
        if (looksLikeZip(documentBytes)) {
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
        try (ZipInputStream zipIn =
                        ZipSecurity.createHardenedInputStream(
                                new ByteArrayInputStream(documentBytes));
                ZipOutputStream zipOut = new ZipOutputStream(out)) {

            ZipEntry entry;
            while ((entry = zipIn.getNextEntry()) != null) {
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
        }
        return out.toByteArray();
    }

    // Flat single-file XML: strip all out-of-document refs; fail CLOSED on unparseable.
    byte[] sanitizeFlatXml(byte[] xmlBytes) throws IOException {
        byte[] cleaned = tryStripFlatXml(xmlBytes);
        if (cleaned != null) {
            return cleaned;
        }
        // DOCTYPE trips the hardened parser; strip and retry so benign DOCTYPE files convert.
        byte[] withoutDoctype = stripDoctype(xmlBytes);
        if (withoutDoctype != null) {
            cleaned = tryStripFlatXml(withoutDoctype);
            if (cleaned != null) {
                return cleaned;
            }
        }
        throw new IOException("XML document could not be parsed for sanitization and was rejected");
    }

    // Returns null (not the original bytes) to signal a parse failure to the caller.
    private byte[] tryStripFlatXml(byte[] xmlBytes) {
        try {
            Document doc = parseSecurely(xmlBytes);
            Element root = doc.getDocumentElement();
            if (root == null) {
                return xmlBytes;
            }
            if (!stripExternalHrefs(root, true)) {
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

    // Strip leading <!DOCTYPE ...> so parsing works; null if absent/unterminated.
    private static byte[] stripDoctype(byte[] xmlBytes) {
        String s = new String(xmlBytes, StandardCharsets.UTF_8);
        int start = s.indexOf("<!DOCTYPE");
        if (start < 0) {
            return null;
        }
        int depth = 0;
        for (int i = start + "<!DOCTYPE".length(); i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '[') {
                depth++;
            } else if (c == ']') {
                if (depth > 0) {
                    depth--;
                }
            } else if (c == '>' && depth == 0) {
                return (s.substring(0, start) + s.substring(i + 1))
                        .getBytes(StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static boolean looksLikeZip(byte[] b) {
        return b.length >= 4 && b[0] == 'P' && b[1] == 'K' && b[2] == 3 && b[3] == 4;
    }

    private static boolean looksLikeXml(byte[] b) {
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
            if (c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == 0) {
                continue;
            }
            return c == '<';
        }
        return false;
    }

    private byte[] sanitizeEntry(String entryName, byte[] entryBytes) {
        String lower = entryName.toLowerCase(Locale.ROOT);
        try {
            if (lower.endsWith(".rels")) {
                return sanitizeOoxmlRels(entryBytes);
            }
            if (isOdfXmlPart(lower)) {
                return sanitizeOdfXml(entryBytes);
            }
        } catch (ParserConfigurationException
                | SAXException
                | IOException
                | TransformerException e) {
            log.warn(
                    "Failed to parse XML part '{}' for sanitization, leaving as-is: {}",
                    entryName,
                    e.getMessage());
        }
        return entryBytes;
    }

    private boolean isOdfXmlPart(String lowerName) {
        int slash = lowerName.lastIndexOf('/');
        String base = slash >= 0 ? lowerName.substring(slash + 1) : lowerName;
        return ODF_XML_PARTS.contains(base);
    }

    private byte[] sanitizeOoxmlRels(byte[] xmlBytes)
            throws IOException, ParserConfigurationException, SAXException, TransformerException {
        Document doc = parseSecurely(xmlBytes);
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
        if (toRemove.isEmpty()) {
            return xmlBytes;
        }
        for (Node n : toRemove) {
            n.getParentNode().removeChild(n);
        }
        return serializeDocument(doc);
    }

    private byte[] sanitizeOdfXml(byte[] xmlBytes)
            throws IOException, ParserConfigurationException, SAXException, TransformerException {
        Document doc = parseSecurely(xmlBytes);
        Element root = doc.getDocumentElement();
        if (root == null) {
            return xmlBytes;
        }
        boolean modified = stripExternalHrefs(root, false);
        if (!modified) {
            return xmlBytes;
        }
        return serializeDocument(doc);
    }

    // flatMode: flat XML has no package, so strip all refs but #frag/data: (zip keeps relatives).
    private boolean stripExternalHrefs(Node node, boolean flatMode) {
        boolean modified = false;
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
                boolean dangerous = flatMode ? isOutsideDocumentRef(value) : isExternalUrl(value);
                if (!dangerous || isAdminAllowed(value)) {
                    continue;
                }
                log.warn("Stripping reference attribute ({}): {}", name, truncateForLog(value));
                attrsToRemove.add(name);
            }
            Element element = (Element) node;
            for (String attrName : attrsToRemove) {
                element.removeAttribute(attrName);
                modified = true;
            }
        }
        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (stripExternalHrefs(children.item(i), flatMode)) {
                modified = true;
            }
        }
        return modified;
    }

    private static boolean isReferenceAttribute(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.equals("href")
                || lower.endsWith(":href")
                || lower.equals("src")
                || lower.endsWith(":src");
    }

    // Flat XML: anything but a #fragment or data: URI points outside the document and is stripped.
    private static boolean isOutsideDocumentRef(String url) {
        if (url == null) {
            return false;
        }
        String trimmed = url.trim();
        if (trimmed.isEmpty()) {
            return false;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return !(lower.startsWith("#") || lower.startsWith("data:"));
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

    private Document parseSecurely(byte[] xmlBytes)
            throws ParserConfigurationException, SAXException, IOException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setNamespaceAware(true);
        DocumentBuilder builder = factory.newDocumentBuilder();
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
        transformer.transform(new DOMSource(doc), new StreamResult(baos));
        return baos.toByteArray();
    }

    private String truncateForLog(String value) {
        if (value == null) {
            return "null";
        }
        return value.length() > 80 ? value.substring(0, 80) + "..." : value;
    }
}

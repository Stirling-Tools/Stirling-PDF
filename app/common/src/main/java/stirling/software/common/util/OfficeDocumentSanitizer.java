package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
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

// Strips external refs from OOXML/ODF uploads so LibreOffice can't be made to fetch them.
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
        if (!isSanitizableExtension(extension)) {
            return documentBytes;
        }

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
        boolean modified = stripExternalHrefs(root);
        if (!modified) {
            return xmlBytes;
        }
        return serializeDocument(doc);
    }

    private boolean stripExternalHrefs(Node node) {
        boolean modified = false;
        if (node.getNodeType() == Node.ELEMENT_NODE) {
            NamedNodeMap attrs = node.getAttributes();
            List<String> hrefAttrsToRemove = new ArrayList<>();
            for (int i = 0; i < attrs.getLength(); i++) {
                Node attr = attrs.item(i);
                String name = attr.getNodeName();
                if (name == null) {
                    continue;
                }
                String lower = name.toLowerCase(Locale.ROOT);
                if (!(lower.equals("xlink:href")
                        || lower.endsWith(":href")
                        || lower.equals("href"))) {
                    continue;
                }
                String value = attr.getNodeValue();
                if (!isExternalUrl(value)) {
                    continue;
                }
                if (isAdminAllowed(value)) {
                    continue;
                }
                log.warn(
                        "Stripping ODF external href attribute ({}): {}",
                        name,
                        truncateForLog(value));
                hrefAttrsToRemove.add(name);
            }
            Element element = (Element) node;
            for (String attrName : hrefAttrsToRemove) {
                element.removeAttribute(attrName);
                modified = true;
            }
        }
        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            if (stripExternalHrefs(children.item(i))) {
                modified = true;
            }
        }
        return modified;
    }

    private boolean isExternalUrl(String url) {
        if (url == null) {
            return false;
        }
        String trimmed = url.trim().toLowerCase(Locale.ROOT);
        if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("../")) {
            return false;
        }
        return trimmed.startsWith("http://")
                || trimmed.startsWith("https://")
                || trimmed.startsWith("ftp://")
                || trimmed.startsWith("ftps://")
                || trimmed.startsWith("file:")
                || trimmed.startsWith("smb:")
                || trimmed.startsWith("\\\\")
                || trimmed.startsWith("//");
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

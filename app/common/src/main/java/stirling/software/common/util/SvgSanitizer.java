package stirling.software.common.util;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

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

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

@Component
@RequiredArgsConstructor
@Slf4j
public class SvgSanitizer {

    private static final Set<String> DANGEROUS_ELEMENTS =
            Set.of("script", "foreignobject", "iframe", "object", "embed", "handler", "listener");
    private static final Set<String> URL_ATTRIBUTES = Set.of("href", "xlink:href", "src", "data");
    private static final Pattern JAVASCRIPT_URL_PATTERN =
            Pattern.compile("^\\s*javascript\\s*:", Pattern.CASE_INSENSITIVE);
    private static final Pattern DATA_SCRIPT_PATTERN =
            Pattern.compile(
                    "^\\s*data\\s*:[^,]*(?:script|javascript|vbscript)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NULL_BYTE_PATTERN = Pattern.compile("\u0000");
    private final SsrfProtectionService ssrfProtectionService;
    private final ApplicationProperties applicationProperties;

    public byte[] sanitize(byte[] svgBytes) throws IOException {
        if (svgBytes == null || svgBytes.length == 0) {
            throw new IOException("SVG input is empty or null");
        }

        if (applicationProperties.getSystem().isDisableSanitize()) {
            log.debug("SVG sanitization disabled by configuration");
            return svgBytes;
        }

        try {
            Document doc = parseSecurely(svgBytes);
            Element root = doc.getDocumentElement();
            if (root == null) {
                throw new IOException("SVG document has no root element");
            }

            sanitizeNode(root);

            byte[] result = serializeDocument(doc);
            if (result == null || result.length == 0) {
                throw new IOException("SVG sanitization produced empty output");
            }

            return result;
        } catch (ParserConfigurationException | SAXException | TransformerException e) {
            throw new IOException("Failed to sanitize SVG content", e);
        }
    }

    private Document parseSecurely(byte[] svgBytes)
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
        return builder.parse(new ByteArrayInputStream(svgBytes));
    }

    private void sanitizeNode(Node node) {
        if (node == null) {
            return;
        }

        NodeList children = node.getChildNodes();
        Set<Node> nodesToRemove = new HashSet<>();

        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() == Node.ELEMENT_NODE) {
                String localName = child.getLocalName();
                if (localName == null) {
                    localName = child.getNodeName();
                }

                if (isDangerousElement(localName)) {
                    log.warn("Removing dangerous SVG element: {}", localName);
                    nodesToRemove.add(child);
                } else {
                    sanitizeNode(child);
                }
            }
        }

        for (Node toRemove : nodesToRemove) {
            node.removeChild(toRemove);
        }

        if (node.getNodeType() == Node.ELEMENT_NODE) {
            sanitizeAttributes((Element) node);
        }
    }

    private void sanitizeAttributes(Element element) {
        NamedNodeMap attributes = element.getAttributes();
        Set<String> attributesToRemove = new HashSet<>();

        for (int i = 0; i < attributes.getLength(); i++) {
            Node attr = attributes.item(i);
            String attrName = attr.getNodeName().toLowerCase();
            String attrValue = attr.getNodeValue();

            if (isEventHandler(attrName)) {
                log.warn("Removing event handler attribute: {}", attrName);
                attributesToRemove.add(attr.getNodeName());
                continue;
            }

            if (isUrlAttribute(attrName)) {
                if (isDangerousUrl(attrValue)) {
                    log.warn(
                            "Removing dangerous URL in attribute {}: {}",
                            attrName,
                            truncateForLog(attrValue));
                    attributesToRemove.add(attr.getNodeName());
                    continue;
                }

                if (isExternalUrl(attrValue) && !isUrlAllowed(attrValue)) {
                    log.warn(
                            "Removing SSRF-blocked URL in attribute {}: {}",
                            attrName,
                            truncateForLog(attrValue));
                    attributesToRemove.add(attr.getNodeName());
                }
            }
        }

        for (String attrName : attributesToRemove) {
            element.removeAttribute(attrName);
        }
    }

    private boolean isDangerousElement(String localName) {
        return DANGEROUS_ELEMENTS.contains(localName.toLowerCase());
    }

    private boolean isEventHandler(String attrName) {
        return attrName.startsWith("on");
    }

    private boolean isUrlAttribute(String attrName) {
        return URL_ATTRIBUTES.contains(attrName.toLowerCase())
                || attrName.toLowerCase().endsWith(":href");
    }

    private boolean isDangerousUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return false;
        }

        String normalized = normalizeUrl(url);

        if (JAVASCRIPT_URL_PATTERN.matcher(normalized).find()) {
            return true;
        }

        if (DATA_SCRIPT_PATTERN.matcher(normalized).find()) {
            return true;
        }

        return false;
    }

    private String normalizeUrl(String url) {
        if (url == null) {
            return "";
        }

        String result = url.trim();

        result = NULL_BYTE_PATTERN.matcher(result).replaceAll("");

        for (int i = 0; i < 3; i++) {
            try {
                String decoded = URLDecoder.decode(result, StandardCharsets.UTF_8);
                if (decoded.equals(result)) {
                    break; // No more decoding needed
                }
                result = decoded;
            } catch (Exception e) {
                log.debug("Failed to decode URL, continuing with current value", e);
                break;
            }
        }

        return result.toLowerCase();
    }

    private boolean isExternalUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return false;
        }

        String normalized = normalizeUrl(url);

        if (normalized.startsWith("#")) {
            return false;
        }

        if (normalized.startsWith("data:")) {
            return false;
        }

        return normalized.startsWith("http://")
                || normalized.startsWith("https://")
                || normalized.startsWith("//")
                || normalized.startsWith("file:");
    }

    private boolean isUrlAllowed(String url) {
        if (ssrfProtectionService == null) {
            return true;
        }
        return ssrfProtectionService.isUrlAllowed(url);
    }

    private byte[] serializeDocument(Document doc) throws TransformerException {
        TransformerFactory transformerFactory = TransformerFactory.newInstance();
        transformerFactory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);

        Transformer transformer = transformerFactory.newTransformer();
        transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
        transformer.setOutputProperty(OutputKeys.INDENT, "no");
        transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");

        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        transformer.transform(new DOMSource(doc), new StreamResult(outputStream));

        return outputStream.toByteArray();
    }

    private String truncateForLog(String value) {
        if (value == null) {
            return "null";
        }
        return value.length() > 50 ? value.substring(0, 50) + "..." : value;
    }
}

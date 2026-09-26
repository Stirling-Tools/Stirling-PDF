package stirling.software.SPDF.service.xfa;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
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

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.helpers.DefaultHandler;

/** XML plumbing shared by the XFA classes, hardened the same way as the document sanitizers. */
final class XfaXml {

    static final String DATA_NS = "http://www.xfa.org/schema/xfa-data/1.0/";
    static final String XHTML_NS = "http://www.w3.org/1999/xhtml";
    static final String TEMPLATE_NS_PREFIX = "http://www.xfa.org/schema/xfa-template/";

    private static final Pattern DECLARED_ENCODING =
            Pattern.compile("^\\s*<\\?xml[^>]*?encoding\\s*=\\s*[\"']([A-Za-z0-9._-]+)[\"']");

    private XfaXml() {}

    /**
     * Parses one XFA packet or a whole XDP document, refusing DOCTYPEs, external entities and
     * XInclude: XFA never needs them, and a PDF is untrusted input.
     *
     * @param charset the encoding to assume when the bytes carry no declaration of their own, or
     *     null to let the parser detect it
     * @throws IOException when the bytes are not well-formed XML
     */
    static Document parse(byte[] xml, Charset charset) throws IOException {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newDefaultInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature(
                    "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setNamespaceAware(true);
            factory.setCoalescing(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            // The default handler prints every fatal error to stderr before throwing it.
            builder.setErrorHandler(new DefaultHandler());
            InputSource source = new InputSource(new ByteArrayInputStream(xml));
            if (charset != null && !hasDeclaration(xml)) {
                source.setEncoding(charset.name());
            }
            return builder.parse(source);
        } catch (ParserConfigurationException | SAXException e) {
            throw new IOException("XFA packet is not well-formed XML: " + e.getMessage(), e);
        }
    }

    /**
     * Writes {@code node} and its subtree without an XML declaration or indentation, since a packet
     * is spliced into a larger XDP document where a declaration would make it invalid.
     */
    static byte[] serialize(Node node, Charset charset) throws IOException {
        try {
            TransformerFactory factory = TransformerFactory.newDefaultInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
            Transformer transformer = factory.newTransformer();
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
            transformer.setOutputProperty(OutputKeys.INDENT, "no");
            transformer.setOutputProperty(OutputKeys.ENCODING, charset.name());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            transformer.transform(new DOMSource(node), new StreamResult(out));
            return out.toByteArray();
        } catch (TransformerException e) {
            throw new IOException("Could not serialise the XFA packet", e);
        }
    }

    /** The encoding named by an XML declaration at the start of {@code head}, or UTF-8. */
    static Charset declaredCharset(byte[] head) {
        if (head == null) {
            return StandardCharsets.UTF_8;
        }
        String start = new String(head, 0, Math.min(head.length, 256), StandardCharsets.ISO_8859_1);
        Matcher matcher = DECLARED_ENCODING.matcher(stripUtf8Bom(start));
        if (matcher.find()) {
            try {
                return Charset.forName(matcher.group(1));
            } catch (IllegalArgumentException unsupported) {
                return StandardCharsets.UTF_8;
            }
        }
        return StandardCharsets.UTF_8;
    }

    static boolean hasDeclaration(byte[] xml) {
        String start = new String(xml, 0, Math.min(xml.length, 64), StandardCharsets.ISO_8859_1);
        return stripUtf8Bom(start).stripLeading().startsWith("<?xml");
    }

    private static String stripUtf8Bom(String latin1) {
        return latin1.startsWith("\u00EF\u00BB\u00BF") ? latin1.substring(3) : latin1;
    }

    /**
     * Prepares an AcroForm value for a data node: CR and CRLF become LF, because the serialiser
     * writes a bare CR as {@code &#13;}, and characters XML 1.0 forbids are dropped.
     */
    static String toXmlText(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String text = value.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder out = new StringBuilder(text.length());
        text.codePoints().filter(XfaXml::isXmlChar).forEach(out::appendCodePoint);
        return out.toString();
    }

    private static boolean isXmlChar(int c) {
        return c == 0x9
                || c == 0xA
                || c == 0xD
                || (c >= 0x20 && c <= 0xD7FF)
                || (c >= 0xE000 && c <= 0xFFFD)
                || (c >= 0x10000 && c <= 0x10FFFF);
    }

    static List<Element> childElements(Node parent) {
        List<Element> children = new ArrayList<>();
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element) {
                children.add(element);
            }
        }
        return children;
    }

    static Element firstChild(Node parent, String localName) {
        for (Node child = parent.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Element element && localName.equals(localNameOf(element))) {
                return element;
            }
        }
        return null;
    }

    /** The local name, falling back to the tag name for nodes built without namespaces. */
    static String localNameOf(Element element) {
        String local = element.getLocalName();
        return local != null ? local : element.getTagName();
    }

    static boolean isXhtml(Element element) {
        return XHTML_NS.equals(element.getNamespaceURI());
    }
}

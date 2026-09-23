package stirling.software.SPDF.service.xfa;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDXFAResource;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * The packets of an {@code /XFA} entry, which is either one stream holding the whole XDP document
 * or an array of name and stream pairs, and the only code that rewrites them. Every packet other
 * than {@code datasets} is left byte for byte as it was.
 */
final class XfaPackets {

    private static final String DATASETS = "datasets";

    /** A parsed datasets element and enough of its origin to write it back in place. */
    static final class Datasets {
        private final Element element;
        private final boolean created;
        private final String leading;
        private final String trailing;

        private Datasets(Element element, boolean created, String leading, String trailing) {
            this.element = element;
            this.created = created;
            this.leading = leading;
            this.trailing = trailing;
        }

        Element element() {
            return element;
        }
    }

    private final PDDocument document;
    private final PDAcroForm acroForm;
    private final COSArray array;
    private final COSStream stream;
    private final Charset charset;
    private Document whole;
    private String wholeText;

    private XfaPackets(PDDocument document, PDAcroForm acroForm, COSArray array, COSStream stream)
            throws IOException {
        this.document = document;
        this.acroForm = acroForm;
        this.array = array;
        this.stream = stream;
        this.charset = XfaXml.declaredCharset(array != null ? bytesAt(1) : read(stream));
    }

    /**
     * @throws IOException when {@code /XFA} is present but neither a stream nor an array of
     *     name/stream pairs
     */
    static XfaPackets of(PDDocument document, PDAcroForm acroForm) throws IOException {
        COSBase base = acroForm.getCOSObject().getDictionaryObject(COSName.XFA);
        if (base instanceof COSStream single) {
            return new XfaPackets(document, acroForm, null, single);
        }
        if (base instanceof COSArray pairs && pairs.size() >= 2 && pairs.size() % 2 == 0) {
            for (int i = 0; i < pairs.size(); i += 2) {
                if (!(pairs.getObject(i) instanceof COSString)
                        || !(pairs.getObject(i + 1) instanceof COSStream)) {
                    throw new IOException("The /XFA array does not hold name and stream pairs");
                }
            }
            return new XfaPackets(document, acroForm, pairs, null);
        }
        throw new IOException("The /XFA entry is neither a stream nor a packet array");
    }

    /** The template element, or null when the XFA has none or it cannot be parsed. */
    Element template() {
        try {
            if (array != null) {
                int index = indexOf("template");
                if (index < 0) {
                    return null;
                }
                Element template = parseFragment(bytesAt(index + 1));
                return XfaTemplate.isTemplate(template) ? template : null;
            }
            for (Element child : XfaXml.childElements(whole().getDocumentElement())) {
                if (XfaTemplate.isTemplate(child)) {
                    return child;
                }
            }
            return null;
        } catch (IOException unreadable) {
            return null;
        }
    }

    /**
     * The datasets element, created empty when the XFA has none.
     *
     * @throws IOException when the existing packet is not well-formed
     */
    Datasets datasets() throws IOException {
        if (array != null) {
            int index = indexOf(DATASETS);
            if (index < 0) {
                return new Datasets(newDatasetsElement(), true, "", "");
            }
            byte[] bytes = bytesAt(index + 1);
            String text = new String(bytes, charset);
            return new Datasets(parseFragment(bytes), false, leadingOf(text), trailingOf(text));
        }
        Element root = whole().getDocumentElement();
        for (Element child : XfaXml.childElements(root)) {
            if (DATASETS.equals(XfaXml.localNameOf(child))
                    && XfaXml.DATA_NS.equals(child.getNamespaceURI())) {
                return new Datasets(child, false, "", "");
            }
        }
        Element created = newDatasetsElementIn(whole());
        root.appendChild(created);
        return new Datasets(created, true, "", "");
    }

    /**
     * Writes {@code datasets} back as a new FlateDecode stream: whatever filters and decode
     * parameters the old one carried go with it. Refuses to leave an XFA that no longer parses.
     */
    void write(Datasets datasets) throws IOException {
        String serialized = new String(XfaXml.serialize(datasets.element, charset), charset);
        if (array != null) {
            byte[] packet = (datasets.leading + serialized + datasets.trailing).getBytes(charset);
            COSStream replacement = newStream(packet);
            int index = indexOf(DATASETS);
            if (index >= 0) {
                array.set(index + 1, replacement);
            } else {
                int position = insertionPoint();
                array.add(position, new COSString(DATASETS));
                array.add(position + 1, replacement);
            }
        } else {
            String updated = splice(wholeText(), datasets, serialized);
            acroForm.getCOSObject().setItem(COSName.XFA, newStream(updated.getBytes(charset)));
        }
        verify();
    }

    private void verify() throws IOException {
        byte[] all =
                new PDXFAResource(acroForm.getCOSObject().getDictionaryObject(COSName.XFA))
                        .getBytes();
        XfaXml.parse(all, charset);
    }

    private COSStream newStream(byte[] content) throws IOException {
        return new PDStream(document, new ByteArrayInputStream(content), COSName.FLATE_DECODE)
                .getCOSObject();
    }

    /** Before the {@code form} packet if there is one, else before the closing xdp packet. */
    private int insertionPoint() {
        int form = indexOf("form");
        if (form >= 0) {
            return form;
        }
        int last = array.size() - 2;
        if (last >= 0 && nameAt(last).startsWith("</")) {
            return last;
        }
        return array.size();
    }

    private String splice(String text, Datasets datasets, String serialized) throws IOException {
        if (datasets.created) {
            String rootName = whole().getDocumentElement().getTagName();
            Matcher closing =
                    Pattern.compile("</" + Pattern.quote(rootName) + "\\s*>\\s*$").matcher(text);
            if (closing.find()) {
                return text.substring(0, closing.start())
                        + serialized
                        + text.substring(closing.start());
            }
        } else {
            int[] range = elementRange(text, datasets.element.getTagName());
            if (range != null) {
                return text.substring(0, range[0]) + serialized + text.substring(range[1]);
            }
        }
        return new String(XfaXml.serialize(whole(), charset), charset);
    }

    /** Start and end offsets of the one element called {@code qualifiedName}, or null. */
    private static int[] elementRange(String text, String qualifiedName) {
        Matcher start =
                Pattern.compile("<" + Pattern.quote(qualifiedName) + "(?=[\\s/>])").matcher(text);
        if (!start.find()) {
            return null;
        }
        int from = start.start();
        if (start.find()) {
            return null;
        }
        int tagEnd = text.indexOf('>', from);
        if (tagEnd < 0) {
            return null;
        }
        if (text.charAt(tagEnd - 1) == '/') {
            return new int[] {from, tagEnd + 1};
        }
        Matcher end = Pattern.compile("</" + Pattern.quote(qualifiedName) + "\\s*>").matcher(text);
        return end.find(tagEnd) ? new int[] {from, end.end()} : null;
    }

    /**
     * Parses one packet on its own, or, when it uses a prefix only the XDP root declares, inside
     * the root's own opening and closing packets.
     */
    private Element parseFragment(byte[] bytes) throws IOException {
        try {
            return XfaXml.parse(bytes, charset).getDocumentElement();
        } catch (IOException standalone) {
            int last = array.size() - 2;
            if (!nameAt(0).startsWith("xdp") || last <= 0 || !nameAt(last).startsWith("</")) {
                throw standalone;
            }
            ByteArrayOutputStream wrapped = new ByteArrayOutputStream();
            wrapped.writeBytes(bytesAt(1));
            wrapped.writeBytes(bytes);
            wrapped.writeBytes(bytesAt(last + 1));
            Element root = XfaXml.parse(wrapped.toByteArray(), charset).getDocumentElement();
            return XfaXml.childElements(root).stream().findFirst().orElseThrow(() -> standalone);
        }
    }

    private Document whole() throws IOException {
        if (whole == null) {
            whole = XfaXml.parse(read(stream), charset);
        }
        return whole;
    }

    private String wholeText() throws IOException {
        if (wholeText == null) {
            wholeText = new String(read(stream), charset);
        }
        return wholeText;
    }

    private int indexOf(String name) {
        for (int i = 0; i < array.size(); i += 2) {
            if (name.equals(nameAt(i))) {
                return i;
            }
        }
        return -1;
    }

    private String nameAt(int index) {
        return array.getObject(index) instanceof COSString name ? name.getString() : "";
    }

    private byte[] bytesAt(int index) throws IOException {
        return read((COSStream) array.getObject(index));
    }

    private static byte[] read(COSStream stream) throws IOException {
        try (InputStream in = stream.createInputStream()) {
            return in.readAllBytes();
        }
    }

    /** What precedes the root element: whitespace, or an XML declaration worth keeping. */
    private static String leadingOf(String text) {
        int first = text.indexOf('<');
        if (first < 0) {
            return "";
        }
        if (text.startsWith("<?xml", first)) {
            int end = text.indexOf("?>", first);
            int root = end < 0 ? -1 : text.indexOf('<', end);
            return root < 0 ? "" : text.substring(0, root);
        }
        return text.substring(0, first);
    }

    private static String trailingOf(String text) {
        int last = text.lastIndexOf('>');
        return last < 0 ? "" : text.substring(last + 1);
    }

    private static Element newDatasetsElement() throws IOException {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newDefaultInstance();
            factory.setNamespaceAware(true);
            Document empty = factory.newDocumentBuilder().newDocument();
            Element element = newDatasetsElementIn(empty);
            empty.appendChild(element);
            return element;
        } catch (ParserConfigurationException e) {
            throw new IOException("Could not create an XFA datasets packet", e);
        }
    }

    private static Element newDatasetsElementIn(Document owner) {
        Element element = owner.createElementNS(XfaXml.DATA_NS, "xfa:datasets");
        element.setAttributeNS(XMLConstants.XMLNS_ATTRIBUTE_NS_URI, "xmlns:xfa", XfaXml.DATA_NS);
        return element;
    }
}

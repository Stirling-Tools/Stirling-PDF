package stirling.software.SPDF.service.xfa;

import java.util.ArrayList;
import java.util.List;

import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.Text;

/**
 * Plain text in and out of the XHTML body XFA stores for a rich-text field. Writing keeps the body,
 * its paragraphs and their attributes, and a span that wraps a whole paragraph, so the formatting a
 * designer gave the field survives a change of text.
 */
final class XfaRichText {

    private static final String SPACE_RUN_STYLE = "xfa-spacerun:yes";

    private XfaRichText() {}

    /** The XHTML {@code body} of a rich-text data value, or null for a plain one. */
    static Element body(Element dataValue) {
        for (Element child : XfaXml.childElements(dataValue)) {
            if (XfaXml.isXhtml(child) && "body".equals(XfaXml.localNameOf(child))) {
                return child;
            }
        }
        return null;
    }

    /** One line per paragraph; {@code <br/>} is a line break, a no-break space a space. */
    static String plainText(Element body) {
        List<Element> paragraphs = paragraphs(body);
        if (paragraphs.isEmpty()) {
            return collect(body);
        }
        List<String> lines = new ArrayList<>(paragraphs.size());
        for (Element paragraph : paragraphs) {
            lines.add(collect(paragraph));
        }
        return String.join("\n", lines);
    }

    /**
     * Line {@code i} of {@code value} goes into the {@code i}-th paragraph. Extra lines become
     * shallow copies of the last paragraph, and paragraphs past the last line are removed. Runs of
     * two or more spaces are wrapped in an {@code xfa-spacerun} span, since XHTML would otherwise
     * collapse them.
     */
    static void write(Element body, String value) {
        List<Element> paragraphs = paragraphs(body);
        if (paragraphs.isEmpty()) {
            Element paragraph = body.getOwnerDocument().createElementNS(XfaXml.XHTML_NS, "p");
            if (body.getPrefix() != null) {
                paragraph.setPrefix(body.getPrefix());
            }
            while (body.getFirstChild() != null) {
                body.removeChild(body.getFirstChild());
            }
            body.appendChild(paragraph);
            paragraphs.add(paragraph);
        }
        String[] lines = value.split("\n", -1);
        Element last = paragraphs.getLast();
        for (int i = 0; i < lines.length; i++) {
            Element paragraph;
            if (i < paragraphs.size()) {
                paragraph = paragraphs.get(i);
            } else {
                paragraph = (Element) last.cloneNode(false);
                Node after = paragraphs.getLast().getNextSibling();
                body.insertBefore(paragraph, after);
                paragraphs.add(paragraph);
            }
            fill(paragraph, lines[i]);
        }
        for (int i = paragraphs.size() - 1; i >= lines.length; i--) {
            body.removeChild(paragraphs.get(i));
        }
    }

    private static void fill(Element paragraph, String line) {
        Element holder = paragraph;
        List<Element> children = XfaXml.childElements(paragraph);
        if (children.size() == 1
                && "span".equals(XfaXml.localNameOf(children.getFirst()))
                && XfaXml.isXhtml(children.getFirst())
                && !SPACE_RUN_STYLE.equals(children.getFirst().getAttribute("style"))
                && !hasOwnText(paragraph)) {
            holder = children.getFirst();
        }
        while (holder.getFirstChild() != null) {
            holder.removeChild(holder.getFirstChild());
        }
        appendWithSpaceRuns(holder, line);
    }

    private static void appendWithSpaceRuns(Element holder, String line) {
        StringBuilder plain = new StringBuilder();
        int i = 0;
        while (i < line.length()) {
            int end = i;
            while (end < line.length() && line.charAt(end) == ' ') {
                end++;
            }
            if (end - i >= 2) {
                flush(holder, plain);
                Element run =
                        holder.getOwnerDocument()
                                .createElementNS(XfaXml.XHTML_NS, spanName(holder));
                run.setAttribute("style", SPACE_RUN_STYLE);
                run.appendChild(holder.getOwnerDocument().createTextNode(line.substring(i, end)));
                holder.appendChild(run);
                i = end;
            } else {
                plain.append(line.charAt(i));
                i++;
            }
        }
        flush(holder, plain);
    }

    private static String spanName(Element context) {
        return context.getPrefix() == null ? "span" : context.getPrefix() + ":span";
    }

    private static void flush(Element holder, StringBuilder text) {
        if (!text.isEmpty()) {
            holder.appendChild(holder.getOwnerDocument().createTextNode(text.toString()));
            text.setLength(0);
        }
    }

    private static List<Element> paragraphs(Element body) {
        List<Element> paragraphs = new ArrayList<>();
        for (Element child : XfaXml.childElements(body)) {
            String local = XfaXml.localNameOf(child);
            if (XfaXml.isXhtml(child) && ("p".equals(local) || "div".equals(local))) {
                paragraphs.add(child);
            }
        }
        return paragraphs;
    }

    private static String collect(Node node) {
        StringBuilder text = new StringBuilder();
        collect(node, text);
        return text.toString().replace(' ', ' ');
    }

    private static void collect(Node node, StringBuilder into) {
        for (Node child = node.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Text text) {
                into.append(text.getData());
            } else if (child instanceof Element element) {
                if ("br".equals(XfaXml.localNameOf(element))) {
                    into.append('\n');
                } else {
                    collect(element, into);
                }
            }
        }
    }

    private static boolean hasOwnText(Element element) {
        for (Node child = element.getFirstChild(); child != null; child = child.getNextSibling()) {
            if (child instanceof Text text && !text.getData().isBlank()) {
                return true;
            }
        }
        return false;
    }
}

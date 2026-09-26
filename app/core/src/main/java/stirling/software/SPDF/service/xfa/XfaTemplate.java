package stirling.software.SPDF.service.xfa;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * The containers of an XFA template (subforms, page sets, exclusion groups, fields) with the
 * properties a data sync needs, and the lookup from an AcroForm field name back to the template
 * path that produced it.
 *
 * <p>The lookup walks the tree with backtracking instead of keying a map by path, because the index
 * of an unnamed {@code #subform[n]} and whether a {@code subformSet} or {@code area} shows up in
 * AcroForm names both vary between producers.
 */
final class XfaTemplate {

    enum Kind {
        SUBFORM("subform"),
        SUBFORM_SET("subformSet"),
        AREA("area"),
        PAGE_SET("pageSet"),
        PAGE_AREA("pageArea"),
        EXCL_GROUP("exclGroup"),
        FIELD("field");

        final String className;

        Kind(String className) {
            this.className = className;
        }

        static Kind of(String localName) {
            for (Kind kind : values()) {
                if (kind.className.equals(localName)) {
                    return kind;
                }
            }
            return null;
        }
    }

    enum Match {
        ONCE,
        NONE,
        GLOBAL,
        DATA_REF
    }

    static final class Container {
        final int ordinal;
        final Kind kind;
        final String name;
        final List<Container> children = new ArrayList<>();
        Match match = Match.ONCE;
        String ref;
        String ui;
        boolean richText;
        boolean formatted;
        boolean calculated;

        /** checkButton: on, off and neutral values; choiceList: the displayed items. */
        List<String> items = List.of();

        /** choiceList: the values stored in the data when they differ from the displayed text. */
        List<String> saveItems = List.of();

        private Container(int ordinal, Kind kind, String name) {
            this.ordinal = ordinal;
            this.kind = kind;
            this.name = name;
        }

        boolean isTerminal() {
            return kind == Kind.FIELD || kind == Kind.EXCL_GROUP;
        }

        /** The value a checked checkButton stores; XFA defaults it to 1 when no items are given. */
        String onValue() {
            return items.isEmpty() ? "1" : items.getFirst();
        }

        /** The value an unchecked checkButton stores: the second item, 0 by default. */
        String offValue() {
            if (items.isEmpty()) {
                return "0";
            }
            return items.size() > 1 ? items.get(1) : "";
        }

        List<Container> choices() {
            return children.stream().filter(child -> child.kind == Kind.FIELD).toList();
        }
    }

    /**
     * One container on the way from the root subform to a field.
     *
     * @param instance the index its AcroForm name gave it, telling repeated instances apart; 0 for
     *     containers the name skipped
     */
    record Step(Container container, int instance) {}

    private static final int MAX_DEPTH = 64;

    private final List<Container> roots = new ArrayList<>();
    private final Map<String, Element> elementsById = new HashMap<>();
    private int nextOrdinal;

    private XfaTemplate() {}

    static XfaTemplate parse(Element template) {
        XfaTemplate parsed = new XfaTemplate();
        parsed.indexIds(template);
        for (Element child : XfaXml.childElements(template)) {
            if (Kind.of(XfaXml.localNameOf(child)) == Kind.SUBFORM) {
                parsed.roots.add(parsed.build(child, 0));
            }
        }
        return parsed;
    }

    static boolean isTemplate(Node node) {
        return node instanceof Element element
                && "template".equals(XfaXml.localNameOf(element))
                && (element.getNamespaceURI() == null
                        || element.getNamespaceURI().startsWith(XfaXml.TEMPLATE_NS_PREFIX));
    }

    String rootName() {
        return roots.isEmpty() ? null : roots.getFirst().name;
    }

    /**
     * The template containers behind an AcroForm name, root subform first and the field or
     * exclusion group last, or empty when the template holds no such path.
     */
    Optional<List<Step>> resolve(SomPath path) {
        List<SomPath.Token> tokens = path.tokens();
        if (tokens.isEmpty()) {
            return Optional.empty();
        }
        Map<Long, Optional<List<Step>>> seen = new HashMap<>();
        for (Container root : roots) {
            if (!matches(root, tokens.getFirst())) {
                continue;
            }
            Optional<List<Step>> rest = descend(root, tokens, 1, 0, seen);
            if (rest.isPresent()) {
                return Optional.of(prepend(new Step(root, 0), rest.get()));
            }
        }
        return Optional.empty();
    }

    /**
     * @param seen outcomes per (container, token position) for this one path, which keeps the
     *     backtracking linear when pass-through containers offer several routes to the same node
     */
    private Optional<List<Step>> descend(
            Container container,
            List<SomPath.Token> tokens,
            int position,
            int depth,
            Map<Long, Optional<List<Step>>> seen) {
        if (position == tokens.size()) {
            return container.isTerminal() ? Optional.of(List.of()) : Optional.empty();
        }
        if (depth > MAX_DEPTH) {
            return Optional.empty();
        }
        long key = ((long) container.ordinal << 20) | position;
        Optional<List<Step>> known = seen.get(key);
        if (known != null) {
            return known;
        }
        Optional<List<Step>> found = Optional.empty();
        SomPath.Token token = tokens.get(position);
        for (Container candidate : candidates(container, token)) {
            Optional<List<Step>> rest = descend(candidate, tokens, position + 1, depth + 1, seen);
            if (rest.isPresent()) {
                found = Optional.of(prepend(new Step(candidate, token.index()), rest.get()));
                break;
            }
        }
        if (found.isEmpty()) {
            for (Container child : container.children) {
                if (!isPassThrough(child)) {
                    continue;
                }
                Optional<List<Step>> rest = descend(child, tokens, position, depth + 1, seen);
                if (rest.isPresent()) {
                    found = Optional.of(prepend(new Step(child, 0), rest.get()));
                    break;
                }
            }
        }
        seen.put(key, found);
        return found;
    }

    private static List<Step> prepend(Step first, List<Step> rest) {
        List<Step> chain = new ArrayList<>(rest.size() + 1);
        chain.add(first);
        chain.addAll(rest);
        return chain;
    }

    /** Matches in the order most likely to be right, the one the index points at first. */
    private static List<Container> candidates(Container parent, SomPath.Token token) {
        List<Container> exact = new ArrayList<>();
        List<Container> sameClassNamed = new ArrayList<>();
        for (Container child : parent.children) {
            if (matches(child, token)) {
                exact.add(child);
            } else if (token.classToken() && child.kind.className.equals(token.name())) {
                sameClassNamed.add(child);
            }
        }
        List<Container> ordered = new ArrayList<>(exact.size() + sameClassNamed.size());
        if (!exact.isEmpty()) {
            Container preferred = exact.get(Math.min(token.index(), exact.size() - 1));
            ordered.add(preferred);
            exact.stream().filter(container -> container != preferred).forEach(ordered::add);
        }
        ordered.addAll(sameClassNamed);
        return ordered;
    }

    private static boolean matches(Container container, SomPath.Token token) {
        if (token.classToken()) {
            return container.name == null && container.kind.className.equals(token.name());
        }
        return token.name().equals(container.name);
    }

    /** Containers that some producers leave out of AcroForm names. */
    private static boolean isPassThrough(Container container) {
        return container.kind == Kind.SUBFORM_SET
                || container.kind == Kind.AREA
                || (container.kind == Kind.SUBFORM && container.name == null);
    }

    private Container build(Element element, int depth) {
        Kind kind = Kind.of(XfaXml.localNameOf(element));
        String name = element.getAttribute("name");
        Container container = new Container(nextOrdinal++, kind, name.isEmpty() ? null : name);
        readProperties(element, container);
        if (kind != Kind.FIELD && depth < MAX_DEPTH) {
            for (Element child : XfaXml.childElements(element)) {
                if (Kind.of(XfaXml.localNameOf(child)) != null) {
                    container.children.add(build(child, depth + 1));
                }
            }
        }
        return container;
    }

    private void readProperties(Element element, Container container) {
        Element bind = property(element, "bind");
        if (bind != null) {
            container.match =
                    switch (bind.getAttribute("match")) {
                        case "none" -> Match.NONE;
                        case "global" -> Match.GLOBAL;
                        case "dataRef" -> Match.DATA_REF;
                        default -> Match.ONCE;
                    };
            container.ref = bind.getAttribute("ref");
        }
        if (container.kind != Kind.FIELD) {
            return;
        }
        Element ui = property(element, "ui");
        if (ui != null) {
            for (Element widget : XfaXml.childElements(ui)) {
                String local = XfaXml.localNameOf(widget);
                if (!"picture".equals(local) && !"extras".equals(local)) {
                    container.ui = local;
                    container.richText = "1".equals(widget.getAttribute("allowRichText"));
                    break;
                }
            }
        }
        Element value = property(element, "value");
        List<Element> valueContent = value == null ? List.of() : XfaXml.childElements(value);
        if (!valueContent.isEmpty()) {
            Element content = valueContent.getFirst();
            String type = XfaXml.localNameOf(content);
            if ("exData".equals(type) && content.getAttribute("contentType").contains("html")) {
                container.richText = true;
            }
            if (container.ui == null) {
                container.ui = uiForValueType(type);
            }
        }
        readItems(element, container);
        Element format = property(element, "format");
        Element picture = format == null ? null : XfaXml.firstChild(format, "picture");
        container.formatted =
                (picture != null && !picture.getTextContent().isBlank())
                        || "numericEdit".equals(container.ui)
                        || "dateTimeEdit".equals(container.ui);
        Element calculate = property(element, "calculate");
        Element script = calculate == null ? null : XfaXml.firstChild(calculate, "script");
        container.calculated = script != null && !script.getTextContent().isBlank();
    }

    private void readItems(Element element, Container container) {
        List<Element> lists = new ArrayList<>();
        for (Element child : XfaXml.childElements(element)) {
            if ("items".equals(XfaXml.localNameOf(child))) {
                lists.add(child);
            }
        }
        if (lists.isEmpty()) {
            Element inherited = property(element, "items");
            if (inherited != null) {
                lists.add(inherited);
            }
        }
        List<String> display = List.of();
        List<String> save = List.of();
        for (Element list : lists) {
            List<String> values = itemValues(list);
            if ("1".equals(list.getAttribute("save"))) {
                save = values;
            } else if (display.isEmpty()) {
                display = values;
            }
        }
        container.items = display.isEmpty() ? save : display;
        container.saveItems = display.isEmpty() ? List.of() : save;
    }

    private static List<String> itemValues(Element list) {
        List<String> values = new ArrayList<>();
        for (Element item : XfaXml.childElements(list)) {
            values.add(item.getTextContent().trim());
        }
        return List.copyOf(values);
    }

    private static String uiForValueType(String type) {
        return switch (type) {
            case "integer", "decimal", "float" -> "numericEdit";
            case "date", "time", "dateTime" -> "dateTimeEdit";
            case "image" -> "imageEdit";
            default -> "textEdit";
        };
    }

    /**
     * A property of {@code element}, inherited through {@code use="#id"} when the element does not
     * set it; LiveCycle templates put shared bindings and pictures on prototypes.
     */
    private Element property(Element element, String localName) {
        Element current = element;
        for (int hops = 0; current != null && hops < 8; hops++) {
            Element own = XfaXml.firstChild(current, localName);
            if (own != null) {
                return own;
            }
            String use = current.getAttribute("use");
            current = use.startsWith("#") ? elementsById.get(use.substring(1)) : null;
        }
        return null;
    }

    private void indexIds(Element template) {
        NodeList all = template.getElementsByTagNameNS("*", "*");
        for (int i = 0; i < all.getLength(); i++) {
            if (all.item(i) instanceof Element element) {
                String id = element.getAttribute("id");
                if (!id.isEmpty()) {
                    elementsById.putIfAbsent(id, element);
                }
            }
        }
    }
}

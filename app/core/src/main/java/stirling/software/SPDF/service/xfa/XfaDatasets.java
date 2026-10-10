package stirling.software.SPDF.service.xfa;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

/**
 * The data DOM of a datasets packet. Finds the data node a template container binds to, and creates
 * it on first write when it is missing, following the XFA merge rules as far as the static forms
 * LiveCycle saves need them: a named subform descends into the next unused data group of its name,
 * a field takes the next unused data value of its name, {@code global} shares one value per name
 * across the record, and unnamed or {@code match="none"} subforms leave the scope unchanged.
 */
final class XfaDatasets {

    private static final Pattern INDEXED = Pattern.compile("^(.*)\\[(\\d{1,9})]$");
    private static final Pattern XML_NAME =
            Pattern.compile("^[\\p{L}_][\\p{L}\\p{N}._\\-\\u00B7]*$");

    /** A data node that exists, or that will be created under {@link #parent} on first write. */
    static final class Target {
        private Element element;
        private final Target parent;
        private final String name;
        private final String namespace;
        private final String qualifiedName;
        private final Map<String, Integer> consumed = new HashMap<>();

        private Target(
                Element element,
                Target parent,
                String name,
                String namespace,
                String qualifiedName) {
            this.element = element;
            this.parent = parent;
            this.name = name;
            this.namespace = namespace;
            this.qualifiedName = qualifiedName;
        }

        Element element() {
            return element;
        }

        boolean exists() {
            return element != null;
        }
    }

    private final Document document;
    private final Element datasets;
    private final String recordName;
    private final Map<Element, Target> targets = new IdentityHashMap<>();
    private final Map<String, Target> pendingGlobals = new HashMap<>();
    private final Map<Target, Map<String, Target>> pendingRefs = new IdentityHashMap<>();
    private Target data;
    private Target record;
    private boolean recordResolved;
    private int recordCount;
    private boolean changed;

    /**
     * @param recordName the root subform's name, used only when the record has to be created
     */
    XfaDatasets(Element datasets, String recordName) {
        this.document = datasets.getOwnerDocument();
        this.datasets = datasets;
        this.recordName = recordName;
    }

    boolean changed() {
        return changed;
    }

    /** How many records {@code xfa:data} holds; a sync only ever writes the first. */
    int recordCount() {
        record();
        return recordCount;
    }

    /** The record the root subform binds to, or null when it is missing and cannot be created. */
    Target record() {
        if (!recordResolved) {
            recordResolved = true;
            Target dataTarget = data();
            Element existing = null;
            if (dataTarget.exists()) {
                for (Element child : XfaXml.childElements(dataTarget.element)) {
                    if (XfaXml.DATA_NS.equals(child.getNamespaceURI())) {
                        continue;
                    }
                    recordCount++;
                    if (existing == null) {
                        existing = child;
                    }
                }
            }
            if (existing != null) {
                record = target(existing);
            } else if (isXmlName(recordName)) {
                record = pending(dataTarget, recordName);
            }
        }
        return record;
    }

    /** Descends into the next unused data group called {@code name} under {@code scope}. */
    Target group(Target scope, String name) {
        return consume(scope, name, true);
    }

    /** Takes the next unused data value called {@code name} under {@code scope}. */
    Target value(Target scope, String name) {
        return consume(scope, name, false);
    }

    /**
     * The one data value every {@code bind match="global"} field of this name shares: found in the
     * current scope, among the record's children, or anywhere in the record, else created as a
     * child of the record, where Acrobat keeps them.
     */
    Target global(Target scope, String name) {
        if (!isXmlName(name)) {
            return null;
        }
        if (scope != null && scope.exists()) {
            Element direct = firstValue(scope.element, name);
            if (direct != null) {
                return target(direct);
            }
        }
        Target recordTarget = record();
        if (recordTarget == null) {
            return null;
        }
        if (recordTarget.exists()) {
            Element top = firstValue(recordTarget.element, name);
            if (top != null) {
                return target(top);
            }
            Element deep = firstValueBelow(recordTarget.element, name);
            if (deep != null) {
                return target(deep);
            }
        }
        return pendingGlobals.computeIfAbsent(name, key -> pending(recordTarget, key));
    }

    /**
     * Follows a {@code bind match="dataRef"} expression. Only plain paths are supported: {@code
     * $record.}, {@code $data.}, {@code $.} or relative, with optional {@code [n]}; anything else
     * returns empty.
     */
    Optional<Target> dataRef(Target scope, String ref, boolean asValue) {
        String expression = ref == null ? "" : ref.trim();
        Target base;
        if (expression.startsWith("$record")) {
            base = record();
            expression = expression.substring("$record".length());
        } else if (expression.startsWith("$data")) {
            base = data();
            expression = expression.substring("$data".length());
        } else if (expression.startsWith("$")) {
            base = scope;
            expression = expression.substring(1);
        } else {
            base = scope;
        }
        if (expression.startsWith(".")) {
            expression = expression.substring(1);
        }
        if (base == null || expression.isEmpty() || !expression.matches("[^$#*!()\\s]+")) {
            return Optional.empty();
        }
        String[] parts = expression.split("\\.");
        Target current = base;
        for (int i = 0; i < parts.length && current != null; i++) {
            Matcher matcher = INDEXED.matcher(parts[i]);
            String name = matcher.matches() ? matcher.group(1) : parts[i];
            int index = matcher.matches() ? Integer.parseInt(matcher.group(2)) : 0;
            current = nth(current, name, index, asValue && i == parts.length - 1);
        }
        return Optional.ofNullable(current);
    }

    /**
     * The data value at {@code path} under the record, or else the only data value in the record
     * with the path's last name. Never creates anything: a guess must not add data.
     */
    Optional<Element> fallback(SomPath path) {
        Target recordTarget = record();
        if (recordTarget == null || !recordTarget.exists()) {
            return Optional.empty();
        }
        List<SomPath.Token> named =
                path.tokens().stream().filter(token -> !token.classToken()).toList();
        if (!named.isEmpty()
                && named.getFirst().name().equals(XfaXml.localNameOf(recordTarget.element))) {
            named = named.subList(1, named.size());
        }
        if (named.isEmpty()) {
            return Optional.empty();
        }
        Element current = recordTarget.element;
        for (int i = 0; i < named.size() && current != null; i++) {
            SomPath.Token token = named.get(i);
            List<Element> matches = children(current, token.name(), i == named.size() - 1);
            current = token.index() < matches.size() ? matches.get(token.index()) : null;
        }
        if (current != null) {
            return Optional.of(current);
        }
        List<Element> sameName = new ArrayList<>();
        collectValues(recordTarget.element, path.leaf().name(), sameName);
        return sameName.size() == 1 ? Optional.of(sameName.getFirst()) : Optional.empty();
    }

    /** The plain text of a data value; for rich text, the text of its paragraphs. */
    String read(Element node) {
        Element body = XfaRichText.body(node);
        return body != null ? XfaRichText.plainText(body) : node.getTextContent();
    }

    /**
     * Stores {@code value}, creating the node and any missing ancestors first. A rich-text node
     * keeps its XHTML body and formatting and only has its text replaced.
     */
    void write(Target target, String value) {
        Element element = materialize(target);
        Element body = XfaRichText.body(element);
        if (body != null) {
            XfaRichText.write(body, value);
        } else {
            while (element.getFirstChild() != null) {
                element.removeChild(element.getFirstChild());
            }
            if (!value.isEmpty()) {
                element.appendChild(document.createTextNode(value));
            }
        }
        changed = true;
    }

    /** Where {@code target} lives under {@code xfa:data}, as dot-separated names. */
    String pathOf(Target target) {
        if (target == null || target == data) {
            return "";
        }
        if (target.element == null) {
            String parentPath = pathOf(target.parent);
            return parentPath.isEmpty() ? target.name : parentPath + "." + target.name;
        }
        Deque<String> names = new ArrayDeque<>();
        for (Node node = target.element;
                node instanceof Element element
                        && !XfaXml.DATA_NS.equals(element.getNamespaceURI());
                node = node.getParentNode()) {
            names.addFirst(XfaXml.localNameOf(element));
        }
        return String.join(".", names);
    }

    private Target data() {
        if (data == null) {
            for (Element child : XfaXml.childElements(datasets)) {
                if ("data".equals(XfaXml.localNameOf(child))
                        && XfaXml.DATA_NS.equals(child.getNamespaceURI())) {
                    data = target(child);
                    return data;
                }
            }
            String prefix = datasets.getPrefix();
            data =
                    new Target(
                            null,
                            target(datasets),
                            "data",
                            XfaXml.DATA_NS,
                            prefix == null ? "data" : prefix + ":data");
        }
        return data;
    }

    private Target consume(Target scope, String name, boolean group) {
        if (scope == null || !isXmlName(name)) {
            return null;
        }
        String key = (group ? "group:" : "value:") + name;
        int next = scope.consumed.merge(key, 1, Integer::sum) - 1;
        if (!scope.exists()) {
            return pending(scope, name);
        }
        List<Element> matches = children(scope.element, name, !group);
        return next < matches.size() ? target(matches.get(next)) : pending(scope, name);
    }

    private Target nth(Target scope, String name, int index, boolean value) {
        if (!isXmlName(name)) {
            return null;
        }
        if (scope.exists()) {
            List<Element> matches = children(scope.element, name, value);
            if (index < matches.size()) {
                return target(matches.get(index));
            }
        }
        String key = name + "[" + index + "]" + (value ? "value" : "group");
        return pendingRefs
                .computeIfAbsent(scope, ignored -> new HashMap<>())
                .computeIfAbsent(key, ignored -> pending(scope, name));
    }

    /** The one {@link Target} for an existing node, so fields bound to it can be grouped. */
    Target target(Element element) {
        return targets.computeIfAbsent(element, key -> new Target(key, null, null, null, null));
    }

    private static Target pending(Target parent, String name) {
        return new Target(null, parent, name, null, null);
    }

    private Element materialize(Target target) {
        if (target.element != null) {
            return target.element;
        }
        Element parent = materialize(target.parent);
        Element created =
                target.qualifiedName != null
                        ? document.createElementNS(target.namespace, target.qualifiedName)
                        : createChild(parent, target.name);
        if (target == data) {
            parent.insertBefore(created, parent.getFirstChild());
        } else {
            parent.appendChild(created);
        }
        target.element = created;
        targets.put(created, target);
        changed = true;
        return created;
    }

    /**
     * A child in its parent's namespace and prefix, so schema-bound data stays schema-bound and the
     * serialiser has no reason to emit {@code xmlns=""}. The record itself goes in no namespace, as
     * it would when Acrobat creates it.
     */
    private Element createChild(Element parent, String localName) {
        boolean underData = XfaXml.DATA_NS.equals(parent.getNamespaceURI());
        String namespace = underData ? null : parent.getNamespaceURI();
        String prefix = underData ? null : parent.getPrefix();
        String qualified =
                prefix != null && namespace != null ? prefix + ":" + localName : localName;
        return document.createElementNS(namespace, qualified);
    }

    private static List<Element> children(Element parent, String name, boolean values) {
        List<Element> matches = new ArrayList<>();
        for (Element child : XfaXml.childElements(parent)) {
            if (name.equals(XfaXml.localNameOf(child))
                    && (values ? isValueLike(child) : isGroupLike(child))) {
                matches.add(child);
            }
        }
        return matches;
    }

    private static Element firstValue(Element parent, String name) {
        List<Element> matches = children(parent, name, true);
        return matches.isEmpty() ? null : matches.getFirst();
    }

    private static Element firstValueBelow(Element parent, String name) {
        for (Element child : XfaXml.childElements(parent)) {
            if (!isGroupLike(child) || XfaXml.childElements(child).isEmpty()) {
                continue;
            }
            Element found = firstValue(child, name);
            if (found == null) {
                found = firstValueBelow(child, name);
            }
            if (found != null) {
                return found;
            }
        }
        return null;
    }

    private static void collectValues(Element parent, String name, List<Element> into) {
        for (Element child : XfaXml.childElements(parent)) {
            if (name.equals(XfaXml.localNameOf(child)) && isValueLike(child)) {
                into.add(child);
            } else if (!XfaXml.childElements(child).isEmpty() && isGroupLike(child)) {
                collectValues(child, name, into);
            }
        }
    }

    /**
     * An element with element children is a group unless those children are rich text; an empty one
     * can be either, which is why {@code xfa:dataNode} exists to say so.
     */
    private static boolean isGroupLike(Element element) {
        String declared = element.getAttributeNS(XfaXml.DATA_NS, "dataNode");
        if (!declared.isEmpty()) {
            return "dataGroup".equals(declared);
        }
        List<Element> children = XfaXml.childElements(element);
        if (children.isEmpty()) {
            return element.getTextContent().isBlank();
        }
        return children.stream().anyMatch(child -> !XfaXml.isXhtml(child));
    }

    private static boolean isValueLike(Element element) {
        String declared = element.getAttributeNS(XfaXml.DATA_NS, "dataNode");
        if (!declared.isEmpty()) {
            return "dataValue".equals(declared);
        }
        return XfaXml.childElements(element).stream().allMatch(XfaXml::isXhtml);
    }

    static boolean isXmlName(String name) {
        return name != null && XML_NAME.matcher(name).matches();
    }
}

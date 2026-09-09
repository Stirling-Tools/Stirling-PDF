package stirling.software.proprietary.integration.purview;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.common.PDMetadata;

import lombok.extern.slf4j.Slf4j;

/**
 * Reads and writes Microsoft Purview sensitivity labels on a PDF.
 *
 * <p>Microsoft documents <em>what</em> a label is - the {@code MSIP_Label_<GUID>_<Attribute>}
 * key/value set - but not <em>where</em> it lives inside a PDF; that detail sits inside the MIP
 * SDK, which is C++/.NET only and has no Java binding. This class therefore treats the two places a
 * PDF can hold such pairs as equally valid:
 *
 * <ul>
 *   <li>the Document Information dictionary, whose custom entries are literally a key/value map;
 *   <li>the XMP packet, where the same keys appear as properties.
 * </ul>
 *
 * <p>Reading is deliberately tolerant - it scans both and takes whichever yields a label - so a
 * document labelled by Acrobat, the MIP client, or another vendor is still understood. Writing
 * populates both, because a downstream reader may only look at one.
 *
 * <p>Scope: this applies the label <em>metadata</em>. It does not encrypt, and cannot: protection
 * is enforced by the Azure Rights Management service through the MIP SDK. A label whose policy
 * demands encryption will be marked here but not protected, which {@link #apply} refuses to do
 * silently.
 */
@Slf4j
public final class PdfSensitivityLabels {

    /** Captures the GUID and the attribute name out of {@code MSIP_Label_<guid>_<attr>}. */
    private static final Pattern LABEL_KEY =
            Pattern.compile("^MSIP_Label_([0-9a-fA-F-]{36})_(\\w+)$");

    /** Finds the same keys inside a raw XMP packet, whatever schema wraps them. */
    private static final Pattern XMP_LABEL_ENTRY =
            Pattern.compile(
                    "<([\\w-]+:)?(MSIP_Label_[0-9a-fA-F-]{36}_\\w+)>([^<]*)</\\1?\\2>",
                    Pattern.CASE_INSENSITIVE);

    /**
     * Adobe's extension schema for carrying arbitrary Document Info entries in XMP. Using it keeps
     * the XMP copy standards-shaped instead of inventing a namespace.
     */
    private static final String PDFX_NAMESPACE = "http://ns.adobe.com/pdfx/1.3/";

    private static final int MAX_XMP_BYTES = 8 * 1024 * 1024;

    private PdfSensitivityLabels() {}

    /**
     * The label on this document, if any.
     *
     * <p>A document carries at most one label per organisation, but may carry labels from several.
     * When more than one is present the first found is returned - callers that care about a
     * specific tenant should compare {@link SensitivityLabel#siteId()}.
     */
    public static Optional<SensitivityLabel> read(PDDocument document) {
        List<SensitivityLabel> all = readAll(document);
        return all.isEmpty() ? Optional.empty() : Optional.of(all.get(0));
    }

    /** Every label on the document, across both metadata surfaces, de-duplicated by GUID. */
    public static List<SensitivityLabel> readAll(PDDocument document) {
        Map<String, Map<String, String>> byLabelId = new LinkedHashMap<>();
        collect(infoPairs(document), byLabelId);
        collect(xmpPairs(document), byLabelId);

        List<SensitivityLabel> labels = new ArrayList<>();
        byLabelId.forEach(
                (labelId, attributes) -> {
                    SensitivityLabel label = SensitivityLabel.fromAttributes(labelId, attributes);
                    if (label != null) {
                        labels.add(label);
                    }
                });
        return labels;
    }

    /**
     * Apply a label, replacing any the same tenant already set.
     *
     * @throws IllegalArgumentException if the label claims encryption, which this cannot honour
     */
    public static void apply(PDDocument document, SensitivityLabel label) throws IOException {
        if (label.isProtected()) {
            // Writing ContentBits=ENCRYPT onto an unencrypted file would tell every downstream
            // reader the content is protected when it is plaintext. Refuse rather than lie.
            throw new IllegalArgumentException(
                    "This label requires encryption, which needs the Microsoft Purview client or"
                            + " MIP SDK; Stirling can apply the label metadata but cannot protect"
                            + " the content.");
        }
        // "An object can only have one label from the same organization." Replace this tenant's
        // labels on both surfaces, but leave other tenants' labels untouched on both.
        Set<String> replaced = labelIdsOfTenant(document, label.siteId());
        replaced.add(label.labelId());
        Map<String, String> pairs = label.toMetadata();
        removeInfoLabels(document, replaced::contains);
        writeInfo(document, pairs);
        writeXmp(document, pairs, replaced::contains);
    }

    /** Strip every label, e.g. before re-labelling or when downgrading a document. */
    public static void clear(PDDocument document) throws IOException {
        removeInfoLabels(document, labelId -> true);
        writeXmp(document, Map.of(), labelId -> true);
    }

    /** The GUIDs of labels this tenant already set, so both surfaces can drop exactly those. */
    private static Set<String> labelIdsOfTenant(PDDocument document, String siteId) {
        Set<String> ids = new LinkedHashSet<>();
        for (SensitivityLabel existing : readAll(document)) {
            if (siteId.equalsIgnoreCase(existing.siteId())) {
                ids.add(existing.labelId());
            }
        }
        return ids;
    }

    /** Drop info-dictionary label entries whose GUID the predicate selects. */
    private static void removeInfoLabels(PDDocument document, Predicate<String> removeLabelId) {
        PDDocumentInformation info = document.getDocumentInformation();
        for (String key : new ArrayList<>(info.getMetadataKeys())) {
            Matcher matcher = LABEL_KEY.matcher(key);
            if (matcher.matches() && removeLabelId.test(matcher.group(1))) {
                info.setCustomMetadataValue(key, null);
            }
        }
    }

    private static void writeInfo(PDDocument document, Map<String, String> pairs) {
        PDDocumentInformation info = document.getDocumentInformation();
        pairs.forEach(info::setCustomMetadataValue);
    }

    /**
     * Rewrite the XMP packet's label properties, leaving the rest of the packet untouched.
     *
     * <p>The packet is edited textually rather than re-serialised through xmpbox: a document's XMP
     * may carry schemas xmpbox does not model, and a round-trip through it would silently drop
     * them.
     */
    private static void writeXmp(
            PDDocument document, Map<String, String> pairs, Predicate<String> removeLabelId)
            throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        String existing = readXmpString(catalog);
        if (existing == null) {
            if (pairs.isEmpty()) {
                return;
            }
            existing = emptyPacket();
        }
        String stripped = stripLabels(existing, removeLabelId);
        String updated = insertLabelProperties(stripped, pairs);
        if (updated == null) {
            log.debug("XMP packet has no rdf:Description to hold the label; info dictionary only");
            return;
        }
        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(updated.getBytes(StandardCharsets.UTF_8));
        catalog.setMetadata(metadata);
    }

    /** Remove only the XMP label entries whose GUID the predicate selects, keeping the rest. */
    private static String stripLabels(String packet, Predicate<String> removeLabelId) {
        Matcher matcher = XMP_LABEL_ENTRY.matcher(packet);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            Matcher key = LABEL_KEY.matcher(matcher.group(2));
            boolean remove = key.matches() && removeLabelId.test(key.group(1));
            matcher.appendReplacement(out, Matcher.quoteReplacement(remove ? "" : matcher.group()));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /** Splice the properties into the first {@code rdf:Description}; null when there is none. */
    private static String insertLabelProperties(String packet, Map<String, String> pairs) {
        if (pairs.isEmpty()) {
            return packet;
        }
        Matcher description = Pattern.compile("<rdf:Description\\b[^>]*>").matcher(packet);
        if (!description.find()) {
            return null;
        }
        StringBuilder properties = new StringBuilder();
        pairs.forEach(
                (key, value) ->
                        properties
                                .append("\n         <pdfx:")
                                .append(key)
                                .append('>')
                                .append(escapeXml(value))
                                .append("</pdfx:")
                                .append(key)
                                .append('>'));
        String opening = description.group();
        String withNamespace =
                opening.contains("xmlns:pdfx=")
                        ? opening
                        : opening.substring(0, opening.length() - 1)
                                + " xmlns:pdfx=\""
                                + PDFX_NAMESPACE
                                + "\">";
        return packet.substring(0, description.start())
                + withNamespace
                + properties
                + packet.substring(description.end());
    }

    private static Map<String, String> infoPairs(PDDocument document) {
        Map<String, String> pairs = new LinkedHashMap<>();
        PDDocumentInformation info = document.getDocumentInformation();
        for (String key : info.getMetadataKeys()) {
            String value = info.getCustomMetadataValue(key);
            if (value != null) {
                pairs.put(key, value);
            }
        }
        return pairs;
    }

    private static Map<String, String> xmpPairs(PDDocument document) {
        Map<String, String> pairs = new LinkedHashMap<>();
        String packet;
        try {
            packet = readXmpString(document.getDocumentCatalog());
        } catch (IOException e) {
            log.debug(
                    "Unreadable XMP packet; falling back to the info dictionary: {}",
                    e.getMessage());
            return pairs;
        }
        if (packet == null) {
            return pairs;
        }
        Matcher matcher = XMP_LABEL_ENTRY.matcher(packet);
        while (matcher.find()) {
            pairs.put(matcher.group(2), unescapeXml(matcher.group(3).trim()));
        }
        return pairs;
    }

    /** Group raw pairs by label GUID, keeping the attribute name as the key. */
    private static void collect(Map<String, String> pairs, Map<String, Map<String, String>> into) {
        pairs.forEach(
                (key, value) -> {
                    Matcher matcher = LABEL_KEY.matcher(key);
                    if (!matcher.matches()) {
                        return;
                    }
                    into.computeIfAbsent(matcher.group(1), id -> new LinkedHashMap<>())
                            // Info-dictionary pairs are collected first and win: a stale XMP copy
                            // must not override the value the labelling client wrote.
                            .putIfAbsent(matcher.group(2), value);
                });
    }

    private static String readXmpString(PDDocumentCatalog catalog) throws IOException {
        PDMetadata metadata = catalog.getMetadata();
        if (metadata == null) {
            return null;
        }
        try (InputStream is = metadata.exportXMPMetadata()) {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            int total = 0;
            while ((read = is.read(chunk)) != -1) {
                total += read;
                if (total > MAX_XMP_BYTES) {
                    // A hostile document could otherwise hand us an unbounded packet to hold.
                    throw new IOException("XMP packet exceeds " + MAX_XMP_BYTES + " bytes");
                }
                buffer.write(chunk, 0, read);
            }
            return buffer.toString(StandardCharsets.UTF_8);
        }
    }

    private static String emptyPacket() {
        return "<?xpacket begin=\"﻿\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>"
                + "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">"
                + "<rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">"
                + "<rdf:Description rdf:about=\"\"></rdf:Description>"
                + "</rdf:RDF></x:xmpmeta><?xpacket end=\"w\"?>";
    }

    private static String escapeXml(String value) {
        return value.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }

    private static String unescapeXml(String value) {
        return value.replace("&lt;", "<")
                .replace("&gt;", ">")
                .replace("&quot;", "\"")
                .replace("&amp;", "&");
    }
}

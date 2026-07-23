package stirling.software.proprietary.integration.purview;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * One Microsoft Purview Information Protection label as it is written to a document.
 *
 * <p>Microsoft persists a label as a flat set of key/value pairs named {@code
 * MSIP_Label_<GUID>_<Attribute>}, and documents that contract publicly so third-party software can
 * read a label and act on it. That published contract - not the MIP SDK, which has no Java binding
 * - is what this type implements. See <a
 * href="https://learn.microsoft.com/en-us/information-protection/develop/concept-mip-metadata">Label
 * metadata in the MIP SDK</a>.
 *
 * <p>Only {@code Enabled} and {@code SiteId} are mandatory in that contract; the rest are optional
 * and may be absent on a label written by an older client, so readers here tolerate their absence.
 */
public record SensitivityLabel(
        String labelId,
        String name,
        String siteId,
        AssignmentMethod method,
        Instant setDate,
        Integer contentBits) {

    /** How the label came to be applied. */
    public enum AssignmentMethod {
        /** Applied by default or automatically - e.g. by a policy like this one. */
        STANDARD,
        /** Chosen deliberately by a person. */
        PRIVILEGED;

        String wireValue() {
            return name().charAt(0) + name().substring(1).toLowerCase(Locale.ROOT);
        }

        static AssignmentMethod parse(String value) {
            if (value == null) {
                return null;
            }
            try {
                return valueOf(value.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                return null;
            }
        }
    }

    public static final String KEY_PREFIX = "MSIP_Label_";

    /** Content marks the labelling application applied; a bitmask, per the MIP contract. */
    public static final int CONTENT_BITS_HEADER = 0x1;

    public static final int CONTENT_BITS_FOOTER = 0x2;
    public static final int CONTENT_BITS_WATERMARK = 0x4;
    public static final int CONTENT_BITS_ENCRYPT = 0x8;

    /**
     * Extended ISO 8601, matching the {@code 2018-11-08T21:13:16-0800} form Microsoft documents.
     */
    private static final DateTimeFormatter SET_DATE =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ", Locale.ROOT)
                    .withZone(ZoneOffset.UTC);

    /**
     * Microsoft caps each key and value at 255 characters "to maintain compatibility across common
     * applications".
     */
    static final int MAX_VALUE_LENGTH = 255;

    /** The GUID shape a labelId must take, matching what the read path accepts from a document. */
    private static final Pattern LABEL_ID = Pattern.compile("^[0-9a-fA-F-]{36}$");

    public SensitivityLabel {
        if (labelId == null || labelId.isBlank()) {
            throw new IllegalArgumentException("a sensitivity label needs a labelId");
        }
        if (!LABEL_ID.matcher(labelId).matches()) {
            // labelId is spliced verbatim into XMP/info key names; a non-GUID would let a stray
            // character (a space, or <, >, &) corrupt or inject the metadata it is written into.
            throw new IllegalArgumentException("a sensitivity label needs a GUID labelId");
        }
        if (siteId == null || siteId.isBlank()) {
            throw new IllegalArgumentException("a sensitivity label needs a siteId (tenant id)");
        }
    }

    /** The {@code MSIP_Label_<GUID>_} prefix this label's keys share. */
    public String keyPrefix() {
        return KEY_PREFIX + labelId + "_";
    }

    /**
     * This label as the key/value pairs to persist. Optional attributes are omitted when unset
     * rather than written empty, so a reader cannot mistake "not recorded" for "recorded as blank".
     */
    public Map<String, String> toMetadata() {
        Map<String, String> out = new LinkedHashMap<>();
        String prefix = keyPrefix();
        out.put(prefix + "Enabled", "true");
        out.put(prefix + "SiteId", siteId);
        if (method != null) {
            out.put(prefix + "Method", method.wireValue());
        }
        if (setDate != null) {
            out.put(prefix + "SetDate", SET_DATE.format(setDate));
        }
        if (name != null && !name.isBlank()) {
            out.put(prefix + "Name", truncate(name));
        }
        if (contentBits != null) {
            out.put(prefix + "ContentBits", String.valueOf(contentBits));
        }
        return out;
    }

    /**
     * Rebuild a label from the pairs found on a document.
     *
     * @param labelId the GUID between the prefix and the attribute name
     * @param attributes attribute name (e.g. {@code Name}) to value, for that GUID only
     * @return null when the pairs do not describe an enabled label
     */
    static SensitivityLabel fromAttributes(String labelId, Map<String, String> attributes) {
        // "DLP products typically validate the existence of this key to identify the
        // classification label" - an absent or false Enabled means there is no label here.
        if (!"true".equalsIgnoreCase(attributes.get("Enabled"))) {
            return null;
        }
        String siteId = attributes.get("SiteId");
        if (siteId == null || siteId.isBlank()) {
            // SiteId is mandatory in the contract, but a label written by something non-compliant
            // is still a label; keep it readable rather than throwing on someone else's file.
            siteId = "unknown";
        }
        return new SensitivityLabel(
                labelId,
                attributes.get("Name"),
                siteId,
                AssignmentMethod.parse(attributes.get("Method")),
                parseDate(attributes.get("SetDate")),
                parseInt(attributes.get("ContentBits")));
    }

    private static Instant parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return SET_DATE.parse(value.trim(), Instant::from);
        } catch (RuntimeException e) {
            try {
                // Tolerate the plain ISO form some writers use instead.
                return Instant.parse(value.trim());
            } catch (RuntimeException ignored) {
                return null;
            }
        }
    }

    private static Integer parseInt(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Integer.valueOf(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String truncate(String value) {
        return value.length() <= MAX_VALUE_LENGTH ? value : value.substring(0, MAX_VALUE_LENGTH);
    }

    /** Whether the labelling application encrypted the content. */
    public boolean isProtected() {
        return contentBits != null && (contentBits & CONTENT_BITS_ENCRYPT) != 0;
    }
}

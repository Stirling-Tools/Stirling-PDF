package stirling.software.proprietary.storage.egress;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.storage.model.ShareAccessRole;

/** A stored sharing policy read as a typed rule; the only place {@code output.options} is read. */
public record EgressRule(
        String policyId,
        String policyName,
        /** Channels this rule governs; empty governs all of them. */
        Set<ShareChannel> channels,
        /** Ceiling on the access role a share may grant; null leaves the requested role alone. */
        ShareAccessRole maxRole,
        ExternalRecipients externalRecipients,
        /** Email domains counted as internal; empty falls back to the file owner's own domain. */
        Set<String> internalDomains,
        /** Ceiling on share-link lifetime in days; null leaves the configured expiry alone. */
        Integer maxLinkDays,
        /** Deny attachment downloads, allowing in-browser viewing only. */
        boolean viewOnly,
        /** The tool chain applied to the copy that leaves; empty serves the stored bytes as-is. */
        List<PipelineStep> steps) {

    /** What to do with a recipient outside the organisation. */
    public enum ExternalRecipients {
        /** No extra treatment — external recipients are handled like internal ones. */
        ALLOW,
        /** The tightest terms the rule can express: read-only, view-only, shortest link life. */
        RESTRICT,
        /** Refused outright with a 403 naming the policy. */
        BLOCK;

        static ExternalRecipients parse(Object raw) {
            if (raw == null) {
                return RESTRICT;
            }
            return switch (raw.toString().trim().toLowerCase(Locale.ROOT)) {
                case "allow" -> ALLOW;
                case "block" -> BLOCK;
                default -> RESTRICT;
            };
        }
    }

    /** The portal category id a Sharing policy is stored under. */
    static final String CATEGORY_SHARING = "sharing";

    /** Field keys as persisted by the portal's Sharing policy settings. */
    static final String FIELD_DEFAULT_ACCESS = "defaultAccess";

    static final String FIELD_EXTERNAL_RECIPIENTS = "externalRecipients";
    static final String FIELD_INTERNAL_DOMAINS = "internalDomains";
    static final String FIELD_LINK_EXPIRY = "linkExpiry";
    static final String FIELD_DOWNLOADS = "downloads";

    /**
     * Whether this stored policy is a Sharing policy. Egress has no source to hang a trigger on, so
     * the portal category the policy was authored under is what marks it, as for classification.
     */
    public static boolean governsSharing(Policy policy) {
        return CATEGORY_SHARING.equals(optionsOf(policy).get("categoryId"));
    }

    /** Read a stored policy as an egress rule. */
    public static EgressRule from(Policy policy) {
        Map<String, Object> options = optionsOf(policy);
        Map<String, Object> fields = asMap(options.get("fieldValues"));
        return new EgressRule(
                policy.id(),
                policy.name(),
                parseChannels(options.get("sources")),
                parseMaxRole(fields.get(FIELD_DEFAULT_ACCESS)),
                ExternalRecipients.parse(fields.get(FIELD_EXTERNAL_RECIPIENTS)),
                parseDomains(fields.get(FIELD_INTERNAL_DOMAINS)),
                parseLinkDays(fields.get(FIELD_LINK_EXPIRY)),
                "viewOnly".equalsIgnoreCase(string(fields.get(FIELD_DOWNLOADS))),
                policy.steps() == null ? List.of() : List.copyOf(policy.steps()));
    }

    /** Whether this rule governs the given channel. */
    public boolean covers(ShareChannel channel) {
        return channels.isEmpty() || channels.contains(channel);
    }

    private static Map<String, Object> optionsOf(Policy policy) {
        return policy.output() == null ? Map.of() : policy.output().options();
    }

    private static Set<ShareChannel> parseChannels(Object raw) {
        Set<ShareChannel> parsed = new LinkedHashSet<>();
        for (String id : asStrings(raw)) {
            ShareChannel channel = ShareChannel.fromId(id);
            if (channel != null) {
                parsed.add(channel);
            }
        }
        return Set.copyOf(parsed);
    }

    /** "restricted" is the portal's tightest role; "inherit"/unknown means no ceiling. */
    private static ShareAccessRole parseMaxRole(Object raw) {
        String value = string(raw);
        if (value == null) {
            return null;
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "restricted", "viewer" -> ShareAccessRole.VIEWER;
            case "commenter" -> ShareAccessRole.COMMENTER;
            case "editor" -> ShareAccessRole.EDITOR;
            default -> null;
        };
    }

    private static Integer parseLinkDays(Object raw) {
        String value = string(raw);
        if (value == null) {
            return null;
        }
        return switch (value.trim().toLowerCase(Locale.ROOT)) {
            case "oneday" -> 1;
            case "threedays" -> 3;
            case "sevendays" -> 7;
            case "thirtydays" -> 30;
            default -> null;
        };
    }

    /** Domains are compared case-insensitively and tolerate a leading "@" or "*." in the input. */
    private static Set<String> parseDomains(Object raw) {
        Set<String> domains = new LinkedHashSet<>();
        for (String entry : asStrings(raw)) {
            String domain = entry.trim().toLowerCase(Locale.ROOT);
            if (domain.startsWith("@")) {
                domain = domain.substring(1);
            }
            if (domain.startsWith("*.")) {
                domain = domain.substring(2);
            }
            if (!domain.isEmpty()) {
                domains.add(domain);
            }
        }
        return Set.copyOf(domains);
    }

    private static List<String> asStrings(Object raw) {
        if (!(raw instanceof Iterable<?> items)) {
            return List.of();
        }
        List<String> values = new java.util.ArrayList<>();
        for (Object item : items) {
            if (item != null && !item.toString().isBlank()) {
                values.add(item.toString());
            }
        }
        return List.copyOf(values);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object raw) {
        return raw instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private static String string(Object raw) {
        return raw == null || raw.toString().isBlank() ? null : raw.toString();
    }
}

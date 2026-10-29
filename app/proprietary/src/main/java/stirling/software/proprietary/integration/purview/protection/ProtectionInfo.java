package stirling.software.proprietary.integration.purview.protection;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;

import tools.jackson.databind.JsonNode;

public record ProtectionInfo(
        Label label,
        List<String> rights,
        String owner,
        String issuedTo,
        boolean issuedToOwner,
        String contentId,
        boolean custom,
        String templateId,
        String templateName,
        boolean allowOfflineAccess,
        Long validUntilEpochSeconds,
        Permissions permissions) {

    public record Label(String id, String name, String parentName, String color, int sensitivity) {}

    public record Permissions(
            boolean view,
            boolean print,
            boolean copy,
            boolean edit,
            boolean comment,
            boolean export,
            boolean owner) {

        static Permissions from(Set<String> rights) {
            boolean owner = rights.contains("OWNER");
            return new Permissions(
                    owner || rights.contains("VIEW"),
                    owner || rights.contains("PRINT"),
                    owner || rights.contains("EXTRACT"),
                    owner || rights.contains("EDIT") || rights.contains("DOCEDIT"),
                    owner || rights.contains("COMMENT"),
                    owner || rights.contains("EXPORT"),
                    owner);
        }
    }

    static ProtectionInfo fromHelper(JsonNode result) {
        JsonNode protection = result.get("protection");
        if (protection == null || protection.isNull()) {
            throw new RightsManagementException(
                    RightsManagementException.NOT_PROTECTED,
                    "This PDF is not protected by Microsoft Purview");
        }
        Set<String> rights = new TreeSet<>();
        JsonNode rightsNode = protection.get("rights");
        if (rightsNode != null) {
            rightsNode.forEach(right -> rights.add(right.asString().toUpperCase(Locale.ROOT)));
        }
        JsonNode validUntil = protection.get("validUntil");
        boolean custom = protection.path("custom").asBoolean(false);
        return new ProtectionInfo(
                label(result.get("label")),
                new ArrayList<>(rights),
                emptyToNull(MipHelper.text(protection, "owner")),
                emptyToNull(MipHelper.text(protection, "issuedTo")),
                protection.path("isIssuedToOwner").asBoolean(false),
                emptyToNull(MipHelper.text(protection, "contentId")),
                custom,
                custom ? null : emptyToNull(MipHelper.text(protection, "templateId")),
                custom ? null : emptyToNull(MipHelper.text(protection, "name")),
                protection.path("allowOfflineAccess").asBoolean(false),
                validUntil == null || validUntil.isNull() ? null : validUntil.asLong(),
                Permissions.from(rights));
    }

    private static Label label(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return new Label(
                MipHelper.text(node, "id"),
                MipHelper.text(node, "name"),
                emptyToNull(MipHelper.text(node, "parentName")),
                emptyToNull(MipHelper.text(node, "color")),
                node.path("sensitivity").asInt(0));
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}

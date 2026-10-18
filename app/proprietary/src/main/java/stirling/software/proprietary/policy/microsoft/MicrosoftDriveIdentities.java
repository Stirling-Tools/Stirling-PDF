package stirling.software.proprietary.policy.microsoft;

/**
 * The OneDrive/SharePoint identity and version scheme, shared by the input source and the output
 * sink so a policy recognises its own output. Identity is drive id, anchor and relative path; the
 * gate is the file's QuickXorHash, which an output can compute before uploading, falling back to
 * the change tag for the rare listing that carries no hash.
 */
public final class MicrosoftDriveIdentities {

    private MicrosoftDriveIdentities() {}

    public static String identity(String driveId, String root, String path) {
        return "msgraph://" + driveId + "/" + root + "/" + MicrosoftDriveConfig.trimSlashes(path);
    }

    public static String gate(String quickXorHash, String cTag) {
        if (quickXorHash != null && !quickXorHash.isBlank()) {
            return "qxh:" + quickXorHash;
        }
        return "ctag:" + (cTag == null ? "" : cTag);
    }

    /** A library-relative path for a file named {@code name} in {@code directory}. */
    public static String childPath(String directory, String name) {
        String parent = MicrosoftDriveConfig.trimSlashes(directory);
        return parent.isEmpty() ? name : parent + "/" + name;
    }
}

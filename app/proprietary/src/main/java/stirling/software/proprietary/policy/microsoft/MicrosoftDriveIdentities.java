package stirling.software.proprietary.policy.microsoft;

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

    public static String childPath(String directory, String name) {
        String parent = MicrosoftDriveConfig.trimSlashes(directory);
        return parent.isEmpty() ? name : parent + "/" + name;
    }
}

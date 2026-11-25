package stirling.software.proprietary.policy.google;

import stirling.software.proprietary.policy.remote.CloudFile;

public record GoogleFile(
        String id, String parentId, String name, long size, String md5, String revision)
        implements CloudFile {

    @Override
    public String identity() {
        return identity(parentId, name);
    }

    @Override
    public String version() {
        return gate(md5, revision);
    }

    @Override
    public boolean hasContentHash() {
        return md5 != null && !md5.isBlank();
    }

    public static String identity(String parentId, String name) {
        return "gdrive://" + parentId + "/" + name;
    }

    public static String gate(String md5, String revision) {
        if (md5 != null && !md5.isBlank()) {
            return "md5:" + md5;
        }
        return "ver:" + (revision == null ? "" : revision);
    }
}

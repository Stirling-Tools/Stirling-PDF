package stirling.software.proprietary.policy.google;

import stirling.software.proprietary.policy.remote.CloudFile;

/**
 * One downloadable file in Google Drive. Identity is the parent folder plus name rather than the
 * file id, so an output can be recorded in the ledger before Drive has assigned it an id. The gate
 * is the MD5 Drive reports, which an output can compute before uploading.
 */
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

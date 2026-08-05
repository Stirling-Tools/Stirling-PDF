package stirling.software.proprietary.policy.network;

/**
 * One remote file discovered by a {@link RemoteFileClient} listing: its full path on the server,
 * its display name, size in bytes, and last-modified epoch milliseconds. Size and mtime form the
 * version gate ({@link NetworkIdentities#gate}) since network protocols expose no ETag.
 */
public record RemoteFile(String path, String name, long size, long lastModifiedMs) {

    public RemoteFile {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("remote file requires a path");
        }
        if (name == null || name.isBlank()) {
            name = path.substring(path.lastIndexOf('/') + 1);
        }
    }
}

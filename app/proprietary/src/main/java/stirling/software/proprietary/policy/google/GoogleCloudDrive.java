package stirling.software.proprietary.policy.google;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.remote.CloudDrive;
import stirling.software.proprietary.policy.remote.ContentHasher;

/**
 * Google Drive as a {@link CloudDrive}. Identity is parent folder plus name; the gate is the MD5
 * Drive reports. Drive has no conditional delete, so removal moves the file to the bin after the
 * caller's version check, accepting the narrow race between the two (as the network sources do).
 */
@Component
@RequiredArgsConstructor
public class GoogleCloudDrive implements CloudDrive<GoogleDriveConfig, GoogleFile> {

    private final GoogleConnectionResolver resolver;
    private final GoogleDriveClient drive;

    @Override
    public Set<String> types() {
        return Set.of(GoogleDriveInputSource.TYPE);
    }

    @Override
    public GoogleDriveConfig resolve(String type, Map<String, Object> options) {
        return resolver.resolve(options);
    }

    @Override
    public void checkReadable(GoogleDriveConfig location) throws IOException {
        drive.folderId(location);
    }

    @Override
    public void checkWritable(GoogleDriveConfig location) throws IOException {
        drive.folderId(location);
    }

    @Override
    public List<GoogleFile> list(GoogleDriveConfig location) throws IOException {
        return drive.list(location);
    }

    @Override
    public Optional<GoogleFile> stat(GoogleDriveConfig location, GoogleFile file)
            throws IOException {
        return drive.stat(location, file);
    }

    @Override
    public InputStream open(GoogleDriveConfig location, GoogleFile file) throws IOException {
        return drive.open(location, file);
    }

    @Override
    public boolean remove(GoogleDriveConfig location, GoogleFile file) throws IOException {
        drive.trash(location, file);
        return true;
    }

    @Override
    public String outputIdentity(GoogleDriveConfig location, String name) throws IOException {
        return GoogleFile.identity(drive.folderId(location), name);
    }

    @Override
    public ContentHasher newHasher() {
        MessageDigest md5;
        try {
            md5 = MessageDigest.getInstance("MD5");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("MD5 unavailable", e);
        }
        return new ContentHasher() {
            @Override
            public void update(byte[] bytes, int offset, int length) {
                md5.update(bytes, offset, length);
            }

            @Override
            public String gate() {
                return GoogleFile.gate(HexFormat.of().formatHex(md5.digest()), null);
            }
        };
    }

    @Override
    public Optional<GoogleFile> upload(GoogleDriveConfig location, String name, Path content)
            throws IOException {
        return drive.upload(location, drive.folderId(location), name, content);
    }

    @Override
    public String label() {
        return "Google Drive";
    }
}

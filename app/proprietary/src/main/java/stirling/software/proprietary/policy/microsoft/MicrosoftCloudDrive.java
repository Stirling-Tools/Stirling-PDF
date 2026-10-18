package stirling.software.proprietary.policy.microsoft;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.policy.remote.CloudDrive;
import stirling.software.proprietary.policy.remote.ContentHasher;

@Component
@RequiredArgsConstructor
public class MicrosoftCloudDrive implements CloudDrive<MicrosoftDriveConfig, DriveFile> {

    private static final Set<String> TYPES =
            new LinkedHashSet<>(
                    List.of(
                            MicrosoftDrive.ONEDRIVE.sourceType(),
                            MicrosoftDrive.SHAREPOINT.sourceType()));

    private final MicrosoftConnectionResolver resolver;
    private final GraphDriveClient graph;

    @Override
    public Set<String> types() {
        return TYPES;
    }

    @Override
    public MicrosoftDriveConfig resolve(String type, Map<String, Object> options) {
        return resolver.resolve(options, MicrosoftDrive.fromOption(type));
    }

    @Override
    public void checkReadable(MicrosoftDriveConfig location) throws IOException {
        graph.list(location.withRecursive(false));
    }

    @Override
    public void checkWritable(MicrosoftDriveConfig location) throws IOException {
        graph.root(location);
    }

    @Override
    public List<DriveFile> list(MicrosoftDriveConfig location) throws IOException {
        return graph.list(location);
    }

    @Override
    public Optional<DriveFile> stat(MicrosoftDriveConfig location, DriveFile file)
            throws IOException {
        return graph.stat(location, file);
    }

    @Override
    public InputStream open(MicrosoftDriveConfig location, DriveFile file) throws IOException {
        return graph.open(location, file);
    }

    @Override
    public boolean remove(MicrosoftDriveConfig location, DriveFile file) throws IOException {
        return graph.delete(location, file);
    }

    @Override
    public String outputIdentity(MicrosoftDriveConfig location, String name) throws IOException {
        DriveRoot root = graph.root(location);
        return MicrosoftDriveIdentities.identity(
                root.driveId(),
                root.key(),
                MicrosoftDriveIdentities.childPath(location.directory(), name));
    }

    @Override
    public ContentHasher newHasher() {
        QuickXorHash hash = new QuickXorHash();
        return new ContentHasher() {
            @Override
            public void update(byte[] bytes, int offset, int length) {
                hash.update(bytes, offset, length);
            }

            @Override
            public String gate() {
                return MicrosoftDriveIdentities.gate(hash.digestBase64(), null);
            }
        };
    }

    @Override
    public Optional<DriveFile> upload(MicrosoftDriveConfig location, String name, Path content)
            throws IOException {
        return graph.upload(location, location.directory(), name, content);
    }

    @Override
    public String label() {
        return "OneDrive/SharePoint";
    }
}

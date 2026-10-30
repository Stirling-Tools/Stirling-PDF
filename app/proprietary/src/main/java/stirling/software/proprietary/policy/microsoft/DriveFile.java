package stirling.software.proprietary.policy.microsoft;

import stirling.software.proprietary.policy.remote.CloudFile;

public record DriveFile(
        String driveId,
        String root,
        String itemId,
        String path,
        String name,
        long size,
        String eTag,
        String quickXorHash,
        String cTag)
        implements CloudFile {

    @Override
    public String identity() {
        return MicrosoftDriveIdentities.identity(driveId, root, path);
    }

    @Override
    public String version() {
        return MicrosoftDriveIdentities.gate(quickXorHash, cTag);
    }

    @Override
    public boolean hasContentHash() {
        return quickXorHash != null && !quickXorHash.isBlank();
    }
}

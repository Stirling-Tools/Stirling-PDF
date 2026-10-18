package stirling.software.proprietary.policy.microsoft;

import stirling.software.proprietary.policy.remote.CloudFile;

/**
 * One file in a OneDrive or SharePoint library. {@code root} is the folder the location is anchored
 * at ({@code root} for the library root, else a linked folder's item id) and {@code path} is
 * relative to it with no leading slash. Identity is keyed on those, so a file keeps its ledger row
 * across sweeps and an output can be recorded before it exists. {@code eTag} guards a delete
 * against a concurrent replacement.
 */
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

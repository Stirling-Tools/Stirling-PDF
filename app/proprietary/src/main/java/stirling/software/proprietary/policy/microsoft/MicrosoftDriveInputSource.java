package stirling.software.proprietary.policy.microsoft;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.remote.CloudDriveInputSource;

/**
 * Reads OneDrive and SharePoint folders ({@code onedrive}, {@code sharepoint}). Options:
 * "accountId" or "connectionId", "directory" (a folder, or a pasted folder link for a connected
 * account), "recursive", and "mode" as for every {@link CloudDriveInputSource}.
 */
@Service
public class MicrosoftDriveInputSource
        extends CloudDriveInputSource<MicrosoftDriveConfig, DriveFile> {

    public MicrosoftDriveInputSource(MicrosoftCloudDrive drive) {
        super(drive);
    }
}

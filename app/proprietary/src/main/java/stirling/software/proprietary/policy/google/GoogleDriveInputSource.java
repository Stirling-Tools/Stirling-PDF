package stirling.software.proprietary.policy.google;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.remote.CloudDriveInputSource;

/**
 * Reads Google Drive folders ({@code googledrive}). Options: "accountId" or "connectionId",
 * "directory" (a folder link, id, or My Drive path), "recursive", and "mode" as for every {@link
 * CloudDriveInputSource}; consume moves processed files to the bin.
 */
@Service
public class GoogleDriveInputSource extends CloudDriveInputSource<GoogleDriveConfig, GoogleFile> {

    public static final String TYPE = "googledrive";

    public GoogleDriveInputSource(GoogleCloudDrive drive) {
        super(drive);
    }
}

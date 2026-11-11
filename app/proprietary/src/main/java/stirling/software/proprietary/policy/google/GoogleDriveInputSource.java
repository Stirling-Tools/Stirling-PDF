package stirling.software.proprietary.policy.google;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.remote.CloudDriveInputSource;

@Service
public class GoogleDriveInputSource extends CloudDriveInputSource<GoogleDriveConfig, GoogleFile> {

    public static final String TYPE = "googledrive";

    public GoogleDriveInputSource(GoogleCloudDrive drive) {
        super(drive);
    }
}

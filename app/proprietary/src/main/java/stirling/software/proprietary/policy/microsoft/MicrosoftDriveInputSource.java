package stirling.software.proprietary.policy.microsoft;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.remote.CloudDriveInputSource;

@Service
public class MicrosoftDriveInputSource
        extends CloudDriveInputSource<MicrosoftDriveConfig, DriveFile> {

    public MicrosoftDriveInputSource(MicrosoftCloudDrive drive) {
        super(drive);
    }
}

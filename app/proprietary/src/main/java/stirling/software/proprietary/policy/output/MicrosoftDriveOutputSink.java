package stirling.software.proprietary.policy.output;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.microsoft.DriveFile;
import stirling.software.proprietary.policy.microsoft.MicrosoftCloudDrive;
import stirling.software.proprietary.policy.microsoft.MicrosoftDriveConfig;

/** Saves outputs to a OneDrive or SharePoint folder ({@code onedrive}, {@code sharepoint}). */
@Service
public class MicrosoftDriveOutputSink
        extends CloudDriveOutputSink<MicrosoftDriveConfig, DriveFile> {

    public MicrosoftDriveOutputSink(MicrosoftCloudDrive drive, ProcessedLedger processedLedger) {
        super(drive, processedLedger);
    }
}

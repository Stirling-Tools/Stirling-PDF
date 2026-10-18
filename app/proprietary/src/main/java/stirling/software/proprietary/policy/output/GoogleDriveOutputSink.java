package stirling.software.proprietary.policy.output;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.google.GoogleCloudDrive;
import stirling.software.proprietary.policy.google.GoogleDriveConfig;
import stirling.software.proprietary.policy.google.GoogleFile;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;

@Service
public class GoogleDriveOutputSink extends CloudDriveOutputSink<GoogleDriveConfig, GoogleFile> {

    public GoogleDriveOutputSink(GoogleCloudDrive drive, ProcessedLedger processedLedger) {
        super(drive, processedLedger);
    }
}

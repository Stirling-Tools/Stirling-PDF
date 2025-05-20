package stirling.software.SPDF.EE;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.SPDF.EE.KeygenLicenseVerifier.License;
import stirling.software.SPDF.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
class LicenseKeyCheckerTest {

    @Mock private KeygenLicenseVerifier verifier;

    @Test
    void premiumDisabled_skipsVerification() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(false);
        props.getPremium().setKey("dummy");

        LicenseKeyChecker checker = new LicenseKeyChecker(verifier, props);

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
        verifyNoInteractions(verifier);
    }

    @Test
    void directKey_verified() {
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("abc");
        when(verifier.verifyLicense("abc")).thenReturn(License.PRO);

        LicenseKeyChecker checker = new LicenseKeyChecker(verifier, props);

        assertEquals(License.PRO, checker.getPremiumLicenseEnabledResult());
        verify(verifier).verifyLicense("abc");
    }

    @Test
    void fileKey_verified(@TempDir Path temp) throws IOException {
        Path file = temp.resolve("license.txt");
        Files.writeString(file, "filekey");

        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("file:" + file.toString());
        when(verifier.verifyLicense("filekey")).thenReturn(License.ENTERPRISE);

        LicenseKeyChecker checker = new LicenseKeyChecker(verifier, props);

        assertEquals(License.ENTERPRISE, checker.getPremiumLicenseEnabledResult());
        verify(verifier).verifyLicense("filekey");
    }

    @Test
    void missingFile_resultsNormal(@TempDir Path temp) {
        Path file = temp.resolve("missing.txt");
        ApplicationProperties props = new ApplicationProperties();
        props.getPremium().setEnabled(true);
        props.getPremium().setKey("file:" + file.toString());

        LicenseKeyChecker checker = new LicenseKeyChecker(verifier, props);

        assertEquals(License.NORMAL, checker.getPremiumLicenseEnabledResult());
        verifyNoInteractions(verifier);
    }
}

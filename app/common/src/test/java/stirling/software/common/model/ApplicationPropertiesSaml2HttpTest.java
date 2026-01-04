package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

class ApplicationPropertiesSaml2HttpTest {

    @Test
    void spCert_else_branch_returns_FileSystemResource_for_filesystem_path() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // temporäre Datei simuliert "Filesystem"-Pfad (-> else-Zweig)
        Path tmp = Files.createTempFile("spdf-spcert-", ".crt");
        Files.writeString(tmp, "CERT");

        s.setSpCert(tmp.toString());
        Resource r = s.getSp().getCertResource();

        assertNotNull(r);
        assertInstanceOf(FileSystemResource.class, r, "Expected FileSystemResource for FS path");
        assertTrue(r.exists(), "Temp file should exist");
    }

    @Test
    void idpCert_else_branch_returns_FileSystemResource_even_if_missing() {
        var s = new ApplicationProperties.Security.SAML2();

        // bewusst nicht existierender Pfad -> else-Zweig wird trotzdem genommen
        String missing = "/this/path/does/not/exist/idp.crt";
        s.setIdpCert(missing);
        Resource r = s.getProvider().getCertResource();

        assertNotNull(r);
        assertInstanceOf(FileSystemResource.class, r, "Expected FileSystemResource for FS path");
        assertFalse(r.exists(), "Resource should not exist for missing file");
    }
}

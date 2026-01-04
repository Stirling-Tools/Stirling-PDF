package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

class ApplicationPropertiesSaml2ResourceTest {

    @Test
    void spCert_privateKey_null_classpath_and_filesystem() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // Test null values
        s.setSpCert(null);
        s.setPrivateKey(null);
        assertNull(s.getSp().getCertResource());
        assertNull(s.getSp().getPrivateKeyResource());

        // Test classpath resources
        s.setSpCert("classpath:saml/dummy.txt");
        s.setPrivateKey("classpath:saml/dummy.txt");
        Resource sp = s.getSp().getCertResource();
        Resource pk = s.getSp().getPrivateKeyResource();
        assertNotNull(sp);
        assertNotNull(pk);
        assertTrue(sp.exists());
        assertTrue(pk.exists());

        // Test filesystem resources
        Path tmp = Files.createTempFile("spdf-key-", ".pem");
        Files.writeString(tmp, "KEY");
        s.setPrivateKey(tmp.toString());
        Resource pkFs = s.getSp().getPrivateKeyResource();
        assertNotNull(pkFs);
        assertTrue(pkFs.exists());
    }

    @Test
    void idpCert_classpath_and_filesystem() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // Test null value
        s.setIdpCert(null);
        assertNull(s.getProvider().getCertResource());

        // Test classpath resource
        s.setIdpCert("classpath:saml/dummy.txt");
        Resource idp = s.getProvider().getCertResource();
        assertNotNull(idp);
        assertTrue(idp.exists());
    }
}

package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;

class ApplicationPropertiesSaml2ResourceTest {

    @Test
    void idpMetadataUri_classpath_is_resolved() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();
        s.setMetadataUri("classpath:saml/dummy.txt");

        try (InputStream in = s.getMetadataUriAsStream()) {
            assertNotNull(in, "Classpath InputStream should not be null");
            String txt = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(txt.contains("ok"));
        }
    }

    @Test
    void spCert_idpCert_privateKey_null_classpath_and_filesystem() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // Test null values via the nested structure
        assertNull(s.getSp().getCertResource());
        assertNull(s.getProvider().getCertResource());
        assertNull(s.getSp().getPrivateKeyResource());

        // Set classpath resources via the nested structure
        s.getSp().setCert("classpath:saml/dummy.txt");
        s.getProvider().setCert("classpath:saml/dummy.txt");
        s.getSp().setPrivateKey("classpath:saml/dummy.txt");
        Resource sp = s.getSp().getCertResource();
        Resource idp = s.getProvider().getCertResource();
        Resource pk = s.getSp().getPrivateKeyResource();
        assertTrue(sp.exists());
        assertTrue(idp.exists());
        assertTrue(pk.exists());

        Path tmp = Files.createTempFile("spdf-key-", ".pem");
        Files.writeString(tmp, "KEY");
        s.getSp().setPrivateKey(tmp.toString());
        Resource pkFs = s.getSp().getPrivateKeyResource();
        assertNotNull(pkFs);
        assertTrue(pkFs.exists());
    }
}

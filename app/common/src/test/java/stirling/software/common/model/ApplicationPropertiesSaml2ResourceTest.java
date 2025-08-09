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
        s.setIdpMetadataUri("classpath:saml/dummy.txt");

        try (InputStream in = s.getIdpMetadataUri()) {
            assertNotNull(in, "Classpath InputStream should not be null");
            String txt = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(txt.contains("ok"));
        }
    }

    @Test
    void spCert_idpCert_privateKey_null_classpath_and_filesystem() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        s.setSpCert(null);
        s.setIdpCert(null);
        s.setPrivateKey(null);
        assertNull(s.getSpCert());
        assertNull(s.getIdpCert());
        assertNull(s.getPrivateKey());

        s.setSpCert("classpath:saml/dummy.txt");
        s.setIdpCert("classpath:saml/dummy.txt");
        s.setPrivateKey("classpath:saml/dummy.txt");
        Resource sp = s.getSpCert();
        Resource idp = s.getIdpCert();
        Resource pk = s.getPrivateKey();
        assertTrue(sp.exists());
        assertTrue(idp.exists());
        assertTrue(pk.exists());

        Path tmp = Files.createTempFile("spdf-key-", ".pem");
        Files.writeString(tmp, "KEY");
        s.setPrivateKey(tmp.toString());
        Resource pkFs = s.getPrivateKey();
        assertNotNull(pkFs);
        assertTrue(pkFs.exists());
    }
}

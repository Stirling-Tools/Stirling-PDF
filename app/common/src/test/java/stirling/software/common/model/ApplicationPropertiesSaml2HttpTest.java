package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;

class ApplicationPropertiesSaml2HttpTest {

    @Test
    void idpMetadataUri_http_is_resolved_via_mockwebserver() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(
                    new MockResponse()
                            .setResponseCode(200)
                            .addHeader("Content-Type", MediaType.APPLICATION_XML_VALUE)
                            .setBody("<EntityDescriptor/>"));
            server.start();

            String url = server.url("/meta").toString();

            var s = new ApplicationProperties.Security.SAML2();
            s.setMetadataUri(url);

            try (InputStream in = s.getMetadataUriAsStream()) {
                String body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(body.contains("EntityDescriptor"));
            }
        }
    }

    @Test
    void idpMetadataUri_invalidUri_triggers_catch_and_throwsIOException() {
        // Ungültige URI -> new URI(...) wirft URISyntaxException -> catch -> IOException
        var s = new ApplicationProperties.Security.SAML2();
        s.setMetadataUri("http:##invalid uri"); // absichtlich kaputt (Leerzeichen + ##)

        assertThrows(IOException.class, s::getMetadataUriAsStream);
    }

    @Test
    void spCert_else_branch_returns_FileSystemResource_for_filesystem_path() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // temporäre Datei simuliert "Filesystem"-Pfad (-> else-Zweig)
        Path tmp = Files.createTempFile("spdf-spcert-", ".crt");
        Files.writeString(tmp, "CERT");

        s.getSp().setCert(tmp.toString());
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
        s.getProvider().setCert(missing);
        Resource r = s.getProvider().getCertResource();

        assertNotNull(r);
        assertInstanceOf(FileSystemResource.class, r, "Expected FileSystemResource for FS path");
        assertFalse(r.exists(), "Resource should not exist for missing file");
    }
}

package stirling.software.common.model;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.io.FileSystemResource;
import stirling.software.common.model.io.Resource;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;

/**
 * MIGRATION (Spring -> Quarkus): {@code ApplicationProperties.Security.SAML2#getSpCert()}/{@code
 * getIdpCert()} now return the migration-shim {@code stirling.software.common.model.io.Resource}
 * ({@code FileSystemResource} for filesystem paths). {@code MediaType.APPLICATION_XML_VALUE} is
 * inlined as the {@code "application/xml"} string. Behaviour is otherwise unchanged.
 */
class ApplicationPropertiesSaml2HttpTest {

    private static final String APPLICATION_XML = "application/xml";

    @Test
    void idpMetadataUri_http_is_resolved_via_mockwebserver() throws Exception {
        try (MockWebServer server = new MockWebServer()) {
            server.enqueue(
                    new MockResponse()
                            .setResponseCode(200)
                            .addHeader("Content-Type", APPLICATION_XML)
                            .setBody("<EntityDescriptor/>"));
            server.start();

            String url = server.url("/meta").toString();

            var s = new ApplicationProperties.Security.SAML2();
            s.setIdpMetadataUri(url);

            try (InputStream in = s.getIdpMetadataUri()) {
                String body = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                assertTrue(body.contains("EntityDescriptor"));
            }
        }
    }

    @Test
    void idpMetadataUri_invalidUri_triggers_catch_and_throwsIOException() {
        // Ungültige URI -> new URI(...) wirft URISyntaxException -> catch -> IOException
        var s = new ApplicationProperties.Security.SAML2();
        s.setIdpMetadataUri("http:##invalid uri"); // absichtlich kaputt (Leerzeichen + ##)

        assertThrows(IOException.class, s::getIdpMetadataUri);
    }

    @Test
    void spCert_else_branch_returns_FileSystemResource_for_filesystem_path() throws Exception {
        var s = new ApplicationProperties.Security.SAML2();

        // temporäre Datei simuliert "Filesystem"-Pfad (-> else-Zweig)
        Path tmp = Files.createTempFile("spdf-spcert-", ".crt");
        Files.writeString(tmp, "CERT");

        s.setSpCert(tmp.toString());
        Resource r = s.getSpCert();

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
        Resource r = s.getIdpCert();

        assertNotNull(r);
        assertInstanceOf(FileSystemResource.class, r, "Expected FileSystemResource for FS path");
        assertFalse(r.exists(), "Resource should not exist for missing file");
    }
}

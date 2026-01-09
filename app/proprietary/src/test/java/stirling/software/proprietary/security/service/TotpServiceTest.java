package stirling.software.proprietary.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.Instant;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.security.util.Base32Codec;

class TotpServiceTest {

    private TotpService buildService(String appName) {
        ApplicationProperties properties = new ApplicationProperties();
        ApplicationProperties.Ui ui = new ApplicationProperties.Ui();
        ui.setAppNameNavbar(appName);
        properties.setUi(ui);
        return new TotpService(properties);
    }

    @Test
    void generateSecretReturnsBase32String() {
        TotpService service = buildService("Test App");

        String secret = service.generateSecret();

        assertNotNull(secret);
        assertEquals(32, secret.length());
        assertTrue(secret.matches("[A-Z2-7]+"));
    }

    @Test
    void buildOtpAuthUriIncludesIssuerAndUsername() {
        TotpService service = buildService("Stirling Test");

        String uri = service.buildOtpAuthUri("user@example.com", "SECRET");

        assertTrue(uri.contains("issuer=Stirling%20Test"));
        assertTrue(uri.contains("Stirling%20Test%3Auser%40example.com"));
    }

    @Test
    void isValidCodeAcceptsCurrentAndAdjacentTimeSteps() throws Exception {
        TotpService service = buildService("Test App");
        byte[] secretBytes = "super-secret".getBytes(StandardCharsets.UTF_8);
        String secret = Base32Codec.encode(secretBytes);

        long timeStep = Instant.now().getEpochSecond() / 30;
        String currentCode = generateCode(service, secretBytes, timeStep);
        String nextCode = generateCode(service, secretBytes, timeStep + 1);

        assertTrue(service.isValidCode(secret, currentCode));
        assertEquals(timeStep, service.getValidTimeStep(secret, currentCode));
        assertTrue(service.isValidCode(secret, nextCode));
    }

    @Test
    void isValidCodeRejectsInvalidFormats() {
        TotpService service = buildService("Test App");

        assertFalse(service.isValidCode("SECRET", "ABCDEF"));
        assertFalse(service.isValidCode("SECRET", "12345"));
        assertFalse(service.isValidCode(null, "123456"));
    }

    private String generateCode(TotpService service, byte[] secretBytes, long timeStep)
            throws Exception {
        Method generateCode =
                TotpService.class.getDeclaredMethod("generateCode", byte[].class, long.class);
        generateCode.setAccessible(true);
        return (String) generateCode.invoke(service, secretBytes, timeStep);
    }
}

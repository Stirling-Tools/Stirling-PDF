package stirling.software.proprietary.policy.webhook;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;
import stirling.software.proprietary.policy.webhook.WebhookReceiverController.WebhookDeliveryResponse;

class WebhookReceiverControllerTest {

    private static final String WEBHOOK_ID = "receivertestid12";
    private static final String SECRET = "topsecret";
    private static final byte[] BODY = "a pdf".getBytes(StandardCharsets.UTF_8);

    @TempDir Path tempDir;

    private SourceStore sourceStore;
    private WebhookSpool spool;
    private WebhookTrigger trigger;
    private ApplicationProperties properties;
    private WebhookReceiverController controller;

    @BeforeEach
    void setUp() {
        sourceStore = new InProcessSourceStore();
        sourceStore.save(webhookSource(true));
        spool = new WebhookSpool(tempDir.resolve("spool"));
        trigger = mock(WebhookTrigger.class);
        properties = new ApplicationProperties();
        controller = new WebhookReceiverController(sourceStore, spool, trigger, properties);
    }

    private static Source webhookSource(boolean enabled) {
        return new Source(
                "s1",
                "Partner uploads",
                "webhook",
                Map.of("webhookId", WEBHOOK_ID, "signingSecret", SECRET, "mode", "consume"),
                enabled,
                "owner",
                null);
    }

    private static MockHttpServletRequest request(byte[] body) {
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/webhooks/" + WEBHOOK_ID);
        req.setContent(body);
        return req;
    }

    @Test
    void aValidDeliveryIsSpooledAndFiresTheTrigger() throws IOException {
        String signature = WebhookSignatures.sign(SECRET, BODY);

        ResponseEntity<WebhookDeliveryResponse> response =
                controller.receive(WEBHOOK_ID, signature, "invoice.pdf", request(BODY));

        assertEquals(202, response.getStatusCode().value());
        assertTrue(response.getBody().accepted());
        assertEquals("invoice.pdf", response.getBody().filename());
        assertEquals(1, spooledFiles().size());
        verify(trigger).fireForWebhook(WEBHOOK_ID);
    }

    @Test
    void aWrongSignatureIsRejectedAndStoresNothing() {
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                controller.receive(
                                        WEBHOOK_ID, "sha256=deadbeef", "x.pdf", request(BODY)));

        assertEquals(401, ex.getStatusCode().value());
        assertTrue(spooledFiles().isEmpty());
        verify(trigger, never()).fireForWebhook(WEBHOOK_ID);
    }

    @Test
    void anUnknownWebhookIsNotFound() {
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                controller.receive(
                                        "unknownwebhookid",
                                        WebhookSignatures.sign(SECRET, BODY),
                                        "x.pdf",
                                        request(BODY)));

        assertEquals(404, ex.getStatusCode().value());
    }

    @Test
    void aPausedSourceRejectsDeliveries() {
        sourceStore.save(webhookSource(false));
        String signature = WebhookSignatures.sign(SECRET, BODY);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.receive(WEBHOOK_ID, signature, "x.pdf", request(BODY)));

        assertEquals(403, ex.getStatusCode().value());
        assertTrue(spooledFiles().isEmpty());
    }

    @Test
    void anEmptyBodyIsRejected() {
        byte[] empty = new byte[0];
        String signature = WebhookSignatures.sign(SECRET, empty);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.receive(WEBHOOK_ID, signature, null, request(empty)));

        assertEquals(400, ex.getStatusCode().value());
    }

    @Test
    void anOversizeDeliveryIsRejectedBeforeStoring() {
        properties.getPolicies().setWebhookMaxBytes(2);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                controller.receive(
                                        WEBHOOK_ID,
                                        WebhookSignatures.sign(SECRET, BODY),
                                        "x.pdf",
                                        request(BODY)));

        assertEquals(413, ex.getStatusCode().value());
        assertTrue(spooledFiles().isEmpty());
    }

    @Test
    void aDeliveryWithoutAContentLengthIsRejected() {
        MockHttpServletRequest req =
                new MockHttpServletRequest("POST", "/api/v1/webhooks/" + WEBHOOK_ID);
        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () ->
                                controller.receive(
                                        WEBHOOK_ID,
                                        WebhookSignatures.sign(SECRET, BODY),
                                        "x.pdf",
                                        req));

        assertEquals(411, ex.getStatusCode().value());
        assertTrue(spooledFiles().isEmpty());
    }

    private List<Path> spooledFiles() {
        Path dir = spool.dirFor(WEBHOOK_ID);
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        try (Stream<Path> entries = Files.list(dir)) {
            return entries.filter(Files::isRegularFile)
                    .filter(p -> !p.getFileName().toString().startsWith("."))
                    .toList();
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}

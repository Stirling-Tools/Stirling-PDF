package stirling.software.proprietary.policy.webhook;

import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.WebhookTrigger;

@Slf4j
@RestController
@RequestMapping("/api/v1/webhooks")
@Hidden
@RequiredArgsConstructor
@Tag(name = "Webhooks", description = "Inbound webhook source receiver")
public class WebhookReceiverController {

    static final String SIGNATURE_HEADER = "X-Stirling-Signature";
    static final String FILENAME_HEADER = "X-Stirling-Filename";
    private static final String WEBHOOK_TYPE = "webhook";

    private final SourceStore sourceStore;
    private final WebhookDeliveries deliveries;
    private final WebhookTrigger webhookTrigger;
    private final ApplicationProperties applicationProperties;

    @PostMapping("/{webhookId}")
    @Operation(
            summary = "Deliver a document to a webhook source",
            description =
                    "The body is the raw document; sign it with the source's secret and present"
                            + " 'sha256=<hex>' in the X-Stirling-Signature header. Returns 202 once"
                            + " the document is stored for the referencing policies, which run"
                            + " asynchronously. A body that presents as a PDF is opened first:"
                            + " 422 if it needs a password (no pipeline can supply one), 400 if it"
                            + " cannot be parsed. Either means the document will fail every"
                            + " policy, so it is refused rather than accepted and parked.")
    public ResponseEntity<WebhookDeliveryResponse> receive(
            @PathVariable String webhookId,
            @RequestHeader(value = SIGNATURE_HEADER, required = false) String signature,
            @RequestHeader(value = FILENAME_HEADER, required = false) String filename,
            HttpServletRequest request) {
        if (!WebhookIds.isValidId(webhookId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such webhook");
        }
        Source source = findWebhookSource(webhookId);
        if (source == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such webhook");
        }

        WebhookConfig config = WebhookConfig.from(source.options());
        byte[] body = readBoundedBody(request);
        if (!WebhookSignatures.verify(config.signingSecret(), body, signature)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid signature");
        }
        if (!source.enabled()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN, "Webhook source is paused; deliveries are not accepted");
        }
        if (body.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty request body");
        }
        refuseWhatNoPipelineCanRead(filename, body);

        WebhookDelivery delivery = store(source, filename, request.getContentType(), body);

        webhookTrigger.fireForWebhook(webhookId);
        log.info(
                "Accepted webhook delivery '{}' ({} bytes) for {}",
                delivery.originalFilename(),
                body.length,
                webhookId);
        return ResponseEntity.accepted()
                .contentType(MediaType.APPLICATION_JSON)
                .body(new WebhookDeliveryResponse(true, delivery.originalFilename(), body.length));
    }

    private static void refuseWhatNoPipelineCanRead(String filename, byte[] body) {
        switch (InboundDocumentCheck.check(filename, body)) {
            case PASSWORD_PROTECTED ->
                    throw new ResponseStatusException(
                            HttpStatus.UNPROCESSABLE_ENTITY,
                            "The document is password-protected; remove the password before"
                                    + " delivering it");
            case CORRUPT ->
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST, "The document is not a readable PDF");
            case ACCEPTABLE -> {}
        }
    }

    private Source findWebhookSource(String webhookId) {
        for (Source source : sourceStore.all()) {
            if (!WEBHOOK_TYPE.equals(source.type())) {
                continue;
            }
            Object configured = source.options().get(WebhookConfig.WEBHOOK_ID_OPTION);
            if (configured != null && configured.toString().equals(webhookId)) {
                return source;
            }
        }
        return null;
    }

    private WebhookDelivery store(Source source, String filename, String contentType, byte[] body) {
        try {
            return deliveries.accept(source, filename, contentType, body);
        } catch (IOException e) {
            log.error("Could not store webhook delivery for {}: {}", source.id(), e.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not store delivery");
        } catch (IllegalStateException misconfigured) {
            // The sender did nothing wrong and should retry once the source is repaired.
            log.error(
                    "Webhook delivery for {} refused: {}", source.id(), misconfigured.getMessage());
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "The webhook source cannot store deliveries right now");
        }
    }

    private byte[] readBoundedBody(HttpServletRequest request) {
        long maxBytes = applicationProperties.getPolicies().getWebhookMaxBytes();
        long declared = request.getContentLengthLong();
        if (declared < 0) {
            throw new ResponseStatusException(
                    HttpStatus.LENGTH_REQUIRED, "A Content-Length header is required");
        }
        if (declared > maxBytes) {
            throw new ResponseStatusException(
                    HttpStatus.PAYLOAD_TOO_LARGE,
                    "Delivery exceeds the " + maxBytes + "-byte limit");
        }
        byte[] body = new byte[(int) declared];
        int total = 0;
        try (InputStream in = request.getInputStream()) {
            int read;
            while (total < body.length
                    && (read = in.read(body, total, body.length - total)) != -1) {
                total += read;
            }
            if (total == body.length && in.read() != -1) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Body exceeds the declared Content-Length");
            }
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Could not read request body");
        }
        return total == body.length ? body : Arrays.copyOf(body, total);
    }

    public record WebhookDeliveryResponse(boolean accepted, String filename, int bytes) {}
}

package stirling.software.proprietary.policy.input;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.webhook.WebhookConfig;
import stirling.software.proprietary.policy.webhook.WebhookDeliveries;
import stirling.software.proprietary.policy.webhook.WebhookDelivery;
import stirling.software.proprietary.policy.webhook.WebhookIds;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookInputSource implements InputSource {

    static final String TYPE = "webhook";

    private final WebhookDeliveries deliveries;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public void validate(InputSpec spec) {
        WebhookConfig.from(spec.options());
    }

    @Override
    public Map<String, Object> prepareOptionsForSave(
            Map<String, Object> options, boolean isCreate) {
        boolean hasId =
                options.get(WebhookConfig.WEBHOOK_ID_OPTION) != null
                        && !options.get(WebhookConfig.WEBHOOK_ID_OPTION).toString().isBlank();
        if (!isCreate && hasId) {
            return options;
        }
        Map<String, Object> prepared = new LinkedHashMap<>(options);
        prepared.put(WebhookConfig.WEBHOOK_ID_OPTION, WebhookIds.newWebhookId());
        prepared.put(WebhookConfig.SIGNING_SECRET_OPTION, WebhookIds.newSigningSecret());
        return prepared;
    }

    /** A webhook's deliveries are shared by every policy bound to that source. */
    @Override
    public List<ResolvedInput> resolve(Source source, ResolveContext ctx, String policyOwner)
            throws IOException {
        return resolve(source.toInputSpec(), ctx);
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec, ResolveContext ctx) throws IOException {
        WebhookConfig config = WebhookConfig.from(spec.options());
        List<WebhookDelivery> present = deliveries.pending(config.webhookId());
        ctx.reportPresent(present.stream().map(WebhookDelivery::identity).toList());

        List<ResolvedInput> work = new ArrayList<>();
        for (WebhookDelivery delivery : present) {
            if (!ctx.claim(delivery.identity(), delivery.gate(), null)) {
                continue;
            }
            Resource document;
            try {
                document = deliveries.open(delivery);
            } catch (IOException e) {
                // Claimed and unreadable is a verdict on this delivery, not a reason to leave the
                // claim in flight: settling it failed parks it where retention can reach it.
                log.warn("Could not open webhook delivery {}: {}", delivery.id(), e.getMessage());
                complete(ctx, delivery, false);
                continue;
            }
            work.add(
                    ResolvedInput.forFile(
                            PolicyInputs.of(List.of(document)),
                            delivery.identity(),
                            success -> complete(ctx, delivery, success)));
        }
        return work;
    }

    private void complete(ResolveContext ctx, WebhookDelivery delivery, boolean success) {
        ctx.settle(delivery.identity(), delivery.gate(), null, success);
        if (!success) {
            deliveries.recordFailure(delivery);
            return;
        }
        if (ctx.allSettledDone(delivery.identity())) {
            deliveries.discard(delivery);
        }
    }
}

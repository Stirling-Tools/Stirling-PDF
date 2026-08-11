package stirling.software.proprietary.policy.trigger;

import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.webhook.WebhookConfig;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookTrigger implements PolicyTrigger {

    static final String TYPE = "webhook";
    private static final String WEBHOOK_SOURCE_TYPE = "webhook";

    private final PolicyStore policyStore;
    private final PolicyRunner policyRunner;
    private final SourceStore sourceStore;
    private final ApplicationProperties applicationProperties;

    private volatile ScheduledExecutorService reconciler;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean requiresSource() {
        return true;
    }

    @Override
    public Set<String> supportedSourceTypes() {
        return Set.of(WEBHOOK_SOURCE_TYPE);
    }

    @Override
    public void validate(Policy policy, PipelineInput input) {
        boolean isWebhookSource = sourceStore
                .get(input.sourceId())
                .filter(source -> WEBHOOK_SOURCE_TYPE.equals(source.type()))
                .isPresent();
        if (!isWebhookSource) {
            throw new IllegalArgumentException("webhook trigger requires a webhook input source");
        }
    }

    @Override
    public synchronized void start() {
        if (reconciler != null) {
            return;
        }
        long reconcileSeconds = applicationProperties.getPolicies().getWatchReconcileSeconds();
        reconciler = Executors.newSingleThreadScheduledExecutor(
                Thread.ofVirtual().name("policy-webhook-reconcile-", 0).factory());
        reconciler.scheduleAtFixedRate(this::safeReconcile, 0, reconcileSeconds, TimeUnit.SECONDS);
        log.info("Webhook trigger started (reconcile every {}s)", reconcileSeconds);
    }

    @Override
    public synchronized void stop() {
        if (reconciler != null) {
            reconciler.shutdownNow();
            reconciler = null;
        }
    }

    /** Fire every webhook input fed by this webhook, pulling only that input's source. */
    public void fireForWebhook(String webhookId) {
        for (PolicyBinding binding : policyStore.findBindingsByTriggerType(TYPE)) {
            if (!referencesWebhook(binding.input(), webhookId)) {
                continue;
            }
            try {
                log.debug(
                        "Webhook input {}/{} saw a delivery",
                        binding.policy().id(),
                        binding.input().sourceId());
                policyRunner.runInput(binding.policy(), binding.input(), SweepKind.LIGHT);
            } catch (RuntimeException e) {
                log.warn(
                        "Webhook run failed for input {}/{}: {}",
                        binding.policy().id(),
                        binding.input().sourceId(),
                        e.getMessage());
            }
        }
    }

    private void safeReconcile() {
        try {
            for (PolicyBinding binding : policyStore.findBindingsByTriggerType(TYPE)) {
                try {
                    policyRunner.runInput(binding.policy(), binding.input(), SweepKind.FULL);
                } catch (RuntimeException e) {
                    log.warn(
                            "Webhook reconcile run failed for input {}/{}: {}",
                            binding.policy().id(),
                            binding.input().sourceId(),
                            e.getMessage());
                }
            }
        } catch (RuntimeException e) {
            log.error("Webhook reconcile failed: {}", e.getMessage(), e);
        }
    }

    /** Whether this input draws from the webhook source the delivery arrived on. */
    private boolean referencesWebhook(PipelineInput input, String webhookId) {
        Source source = sourceStore.get(input.sourceId()).orElse(null);
        if (source == null || !WEBHOOK_SOURCE_TYPE.equals(source.type())) {
            return false;
        }
        Object configured = source.options().get(WebhookConfig.WEBHOOK_ID_OPTION);
        return configured != null && configured.toString().equals(webhookId);
    }
}

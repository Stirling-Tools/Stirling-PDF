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
import stirling.software.proprietary.policy.model.Policy;
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
    public void validate(Policy policy) {
        boolean hasWebhookSource =
                policy.sourceIds().stream()
                        .map(sourceStore::get)
                        .flatMap(java.util.Optional::stream)
                        .anyMatch(source -> WEBHOOK_SOURCE_TYPE.equals(source.type()));
        if (!hasWebhookSource) {
            throw new IllegalArgumentException(
                    "webhook trigger requires at least one webhook input source");
        }
    }

    @Override
    public synchronized void start() {
        if (reconciler != null) {
            return;
        }
        long reconcileSeconds = applicationProperties.getPolicies().getWatchReconcileSeconds();
        reconciler =
                Executors.newSingleThreadScheduledExecutor(
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

    public void fireForWebhook(String webhookId) {
        for (Policy policy : policyStore.findByTriggerType(TYPE)) {
            if (!referencesWebhook(policy, webhookId)) {
                continue;
            }
            try {
                log.debug("Webhook policy {} ({}) saw a delivery", policy.id(), policy.name());
                policyRunner.run(policy, SweepKind.LIGHT);
            } catch (RuntimeException e) {
                log.warn("Webhook run failed for policy {}: {}", policy.id(), e.getMessage());
            }
        }
    }

    private void safeReconcile() {
        try {
            for (Policy policy : policyStore.findByTriggerType(TYPE)) {
                try {
                    policyRunner.run(policy);
                } catch (RuntimeException e) {
                    log.warn(
                            "Webhook reconcile run failed for policy {}: {}",
                            policy.id(),
                            e.getMessage());
                }
            }
        } catch (RuntimeException e) {
            log.error("Webhook reconcile failed: {}", e.getMessage(), e);
        }
    }

    private boolean referencesWebhook(Policy policy, String webhookId) {
        for (String sourceId : policy.sourceIds()) {
            Source source = sourceStore.get(sourceId).orElse(null);
            if (source == null || !WEBHOOK_SOURCE_TYPE.equals(source.type())) {
                continue;
            }
            Object configured = source.options().get(WebhookConfig.WEBHOOK_ID_OPTION);
            if (configured != null && configured.toString().equals(webhookId)) {
                return true;
            }
        }
        return false;
    }
}

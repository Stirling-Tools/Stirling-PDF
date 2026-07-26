package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.SweepKind;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

@ExtendWith(MockitoExtension.class)
class WebhookTriggerTest {

    private static final String TYPE = "webhook";

    @Mock private PolicyStore policyStore;
    @Mock private PolicyRunner policyRunner;

    private final SourceStore sourceStore = new InProcessSourceStore();
    private WebhookTrigger trigger;

    @BeforeEach
    void setUp() {
        trigger =
                new WebhookTrigger(
                        policyStore, policyRunner, sourceStore, new ApplicationProperties());
    }

    @Test
    void firesOnlyPoliciesReferencingTheDeliveredWebhook() {
        Policy matching = webhookPolicy("a", "whkA");
        Policy other = webhookPolicy("b", "whkB");
        when(policyStore.findByTriggerType(TYPE)).thenReturn(List.of(matching, other));

        trigger.fireForWebhook("whkA");

        verify(policyRunner).run(matching, SweepKind.LIGHT);
        verify(policyRunner, never()).run(other, SweepKind.LIGHT);
    }

    @Test
    void ignoresADeliveryForAnUnknownWebhookId() {
        Policy policy = webhookPolicy("a", "whkA");
        when(policyStore.findByTriggerType(TYPE)).thenReturn(List.of(policy));

        trigger.fireForWebhook("whkZ");

        verify(policyRunner, never()).run(any(), any(SweepKind.class));
    }

    @Test
    void validateRequiresAWebhookSource() {
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(policy("p", webhookTriggerConfig(), List.of())));
        trigger.validate(webhookPolicy("p", "whkA"));
    }

    private static TriggerConfig webhookTriggerConfig() {
        return new TriggerConfig(TYPE, Map.of());
    }

    private Policy webhookPolicy(String id, String webhookId) {
        String sourceId =
                sourceStore
                        .save(
                                new Source(
                                        null,
                                        "hook",
                                        "webhook",
                                        Map.of(
                                                "webhookId",
                                                webhookId,
                                                "signingSecret",
                                                "s",
                                                "mode",
                                                "consume"),
                                        true,
                                        "owner",
                                        null))
                        .id();
        return policy(id, webhookTriggerConfig(), List.of(sourceId));
    }

    private static Policy policy(String id, TriggerConfig trigger, List<String> sourceIds) {
        return new Policy(
                id,
                "hook",
                "owner",
                true,
                trigger,
                sourceIds,
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}

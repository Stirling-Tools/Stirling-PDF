package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Arrays;
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
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyBinding;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

@ExtendWith(MockitoExtension.class)
class WebhookTriggerTest {

    private static final String TYPE = "webhook";

    @Mock
    private PolicyStore policyStore;

    @Mock
    private PolicyRunner policyRunner;

    private final SourceStore sourceStore = new InProcessSourceStore();
    private WebhookTrigger trigger;

    @BeforeEach
    void setUp() {
        trigger = new WebhookTrigger(policyStore, policyRunner, sourceStore, new ApplicationProperties());
    }

    @Test
    void firesOnlyInputsReferencingTheDeliveredWebhook() {
        Policy matching = webhookPolicy("a", "whkA");
        Policy other = webhookPolicy("b", "whkB");
        when(policyStore.findBindingsByTriggerType(TYPE)).thenReturn(bindings(matching, other));

        trigger.fireForWebhook("whkA");

        verify(policyRunner).runInput(matching, matching.inputs().get(0), SweepKind.LIGHT);
        verify(policyRunner, never()).runInput(eq(other), any(), any());
    }

    @Test
    void ignoresADeliveryForAnUnknownWebhookId() {
        Policy policy = webhookPolicy("a", "whkA");
        when(policyStore.findBindingsByTriggerType(TYPE)).thenReturn(bindings(policy));

        trigger.fireForWebhook("whkZ");

        verify(policyRunner, never()).runInput(any(), any(), any());
    }

    @Test
    void validateRequiresAWebhookSource() {
        // A non-webhook source (here: an id that resolves to nothing) is rejected.
        Policy notWebhook = policy("p", PipelineInput.manual("missing-source"));
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(notWebhook, notWebhook.inputs().get(0)));

        Policy hooked = webhookPolicy("p", "whkA");
        trigger.validate(hooked, hooked.inputs().get(0));
    }

    /** Every (policy, input) binding across the given policies, as the store would return them. */
    private static List<PolicyBinding> bindings(Policy... policies) {
        return Arrays.stream(policies)
                .flatMap(policy -> policy.inputs().stream().map(in -> new PolicyBinding(policy, in)))
                .toList();
    }

    private Policy webhookPolicy(String id, String webhookId) {
        String sourceId = sourceStore
                .save(new Source(
                        null,
                        "hook",
                        "webhook",
                        Map.of("webhookId", webhookId, "signingSecret", "s", "mode", "consume"),
                        true,
                        "owner",
                        null))
                .id();
        return policy(id, new PipelineInput(sourceId, new TriggerConfig(TYPE, Map.of())));
    }

    private static Policy policy(String id, PipelineInput input) {
        return new Policy(
                id,
                "hook",
                "owner",
                true,
                List.of(input),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}

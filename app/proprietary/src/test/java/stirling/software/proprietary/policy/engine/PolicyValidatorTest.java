package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
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

import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;

/** Tests for {@link PolicyValidator}: routes each facet to its handler and surfaces failures. */
@ExtendWith(MockitoExtension.class)
class PolicyValidatorTest {

    @Mock private PolicyTrigger trigger;
    @Mock private InputSource inputSource;
    @Mock private PolicyOutputSink outputSink;

    private PolicyValidator validator;

    @BeforeEach
    void setUp() {
        validator =
                new PolicyValidator(List.of(trigger), List.of(inputSource), List.of(outputSink));
    }

    @Test
    void delegatesEachFacetToItsHandler() {
        when(trigger.type()).thenReturn("schedule");
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);
        Policy policy = policy("schedule");

        validator.validate(policy);

        verify(trigger).validate(policy.trigger());
        verify(inputSource).validate(policy.sources().get(0));
        verify(outputSink).validate(policy.output());
    }

    @Test
    void skipsTriggerValidationForAManualOnlyPolicy() {
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);

        validator.validate(manualOnly());

        verify(trigger, never()).validate(any());
    }

    @Test
    void surfacesAnInvalidConfigFromAHandler() {
        when(trigger.type()).thenReturn("schedule");
        doThrow(new IllegalArgumentException("invalid schedule")).when(trigger).validate(any());

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> validator.validate(policy("schedule")));
        assertTrue(ex.getMessage().contains("schedule"));
    }

    @Test
    void rejectsAnUnknownTriggerType() {
        when(trigger.type()).thenReturn("schedule");

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> validator.validate(policy("mystery")));
        assertTrue(ex.getMessage().contains("unknown trigger type"));
    }

    private static Policy policy(String triggerType) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                new TriggerConfig(triggerType, Map.of()),
                List.of(InputSpec.folder("/in")),
                List.of(),
                OutputSpec.inline());
    }

    private static Policy manualOnly() {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                null,
                List.of(InputSpec.folder("/in")),
                List.of(),
                OutputSpec.inline());
    }
}

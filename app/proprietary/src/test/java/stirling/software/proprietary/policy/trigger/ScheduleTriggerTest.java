package stirling.software.proprietary.policy.trigger;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.proprietary.policy.engine.PolicyEngine;
import stirling.software.proprietary.policy.engine.PolicyRunHandle;
import stirling.software.proprietary.policy.input.NoneInputSource;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.Schedule;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link ScheduleTrigger}'s due-firing logic via the package-visible {@code
 * sweep(Instant)}. Schedules default to UTC, so explicit UTC instants make these deterministic.
 */
@ExtendWith(MockitoExtension.class)
class ScheduleTriggerTest {

    @Mock private PolicyStore policyStore;
    @Mock private PolicyEngine policyEngine;

    private ScheduleTrigger trigger;

    @BeforeEach
    void setUp() {
        // Test policies use the default "none" input source, so each due policy yields one run.
        trigger =
                new ScheduleTrigger(
                        policyStore,
                        policyEngine,
                        List.of(new NoneInputSource()),
                        JsonMapper.builder().build());
    }

    @Test
    void firesOncePerScheduleWhenItComesDue() {
        Policy policy = scheduled("p1", new Schedule.Every(1, Schedule.Unit.MINUTES));
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r1", new CompletableFuture<>()));

        Instant t0 = Instant.parse("2026-06-05T10:00:30Z");
        trigger.sweep(t0); // first sight: baseline, must not fire immediately
        verify(policyEngine, never()).runPolicy(any(), any(), any());

        trigger.sweep(t0.plusSeconds(120)); // the one-minute mark has passed
        verify(policyEngine, times(1)).runPolicy(eq(policy), any(), any());
    }

    @Test
    void doesNotFireBeforeTheNextScheduledTime() {
        Policy policy = scheduled("p1", new Schedule.Daily(LocalTime.of(3, 0))); // 03:00 UTC daily
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        Instant t0 = Instant.parse("2026-06-05T10:00:00Z");
        trigger.sweep(t0);
        trigger.sweep(t0.plusSeconds(60)); // next 03:00 is far away

        verify(policyEngine, never()).runPolicy(any(), any(), any());
    }

    @Test
    void firesWeeklyOnAChosenDay() {
        // 2026-06-05 is a Friday; the next Monday 09:00 is the soonest firing.
        Policy policy =
                scheduled("p1", new Schedule.Weekly(Set.of(DayOfWeek.MONDAY), LocalTime.of(9, 0)));
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));
        when(policyEngine.runPolicy(any(), any(), any()))
                .thenReturn(new PolicyRunHandle("r1", new CompletableFuture<>()));

        Instant friday = Instant.parse("2026-06-05T10:00:00Z");
        trigger.sweep(friday); // baseline
        trigger.sweep(Instant.parse("2026-06-08T09:00:00Z")); // Monday 09:00

        verify(policyEngine, times(1)).runPolicy(eq(policy), any(), any());
    }

    @Test
    void skipsPoliciesWithAnInvalidSchedule() {
        Policy policy = scheduledWithRawOptions("p1", Map.of()); // no schedule
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        trigger.sweep(Instant.parse("2026-06-05T10:00:00Z"));

        verify(policyEngine, never()).runPolicy(any(), any(), any());
    }

    @Test
    void validateRejectsMissingSchedule() {
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(new TriggerConfig("schedule", Map.of())));
    }

    @Test
    void validateRejectsAnInvalidSchedule() {
        Map<String, Object> options =
                Map.of("schedule", Map.of("type", "every", "count", -5, "unit", "MINUTES"));
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(new TriggerConfig("schedule", options)));
    }

    @Test
    void validateAcceptsAValidScheduleAndZone() {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("schedule", new Schedule.Daily(LocalTime.of(2, 0)));
        options.put("zone", "Europe/London");
        trigger.validate(new TriggerConfig("schedule", options));
    }

    private static Policy scheduled(String id, Schedule schedule) {
        return scheduledWithRawOptions(id, Map.of("schedule", schedule));
    }

    private static Policy scheduledWithRawOptions(String id, Map<String, Object> options) {
        return new Policy(
                id,
                "nightly",
                "owner",
                true,
                new TriggerConfig("schedule", options),
                List.of(new PipelineStep("/api/v1/misc/compress-pdf", Map.of())),
                OutputSpec.inline());
    }
}

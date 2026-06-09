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

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.Schedule;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link ScheduleTrigger}'s due-firing logic via the package-visible {@code
 * sweep(Instant)}. The trigger only decides when a policy is due; pulling sources and starting runs
 * is the {@link PolicyRunner}'s job, so these assert it delegates to the runner. Schedules default
 * to UTC, so explicit UTC instants make these deterministic.
 */
@ExtendWith(MockitoExtension.class)
class ScheduleTriggerTest {

    @Mock private PolicyStore policyStore;
    @Mock private PolicyRunner policyRunner;

    private ScheduleTrigger trigger;

    @BeforeEach
    void setUp() {
        trigger =
                new ScheduleTrigger(
                        policyStore,
                        policyRunner,
                        JsonMapper.builder().build(),
                        new ApplicationProperties());
    }

    @Test
    void firesOncePerScheduleWhenItComesDue() {
        Policy policy = scheduled("p1", new Schedule.Every(1, Schedule.Unit.MINUTES));
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        Instant t0 = Instant.parse("2026-06-05T10:00:30Z");
        trigger.sweep(t0); // first sight: baseline, must not fire immediately
        verify(policyRunner, never()).run(any());

        trigger.sweep(t0.plusSeconds(120)); // the one-minute mark has passed
        verify(policyRunner, times(1)).run(eq(policy));
    }

    @Test
    void doesNotFireBeforeTheNextScheduledTime() {
        Policy policy = scheduled("p1", new Schedule.Daily(LocalTime.of(3, 0))); // 03:00 UTC daily
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        Instant t0 = Instant.parse("2026-06-05T10:00:00Z");
        trigger.sweep(t0);
        trigger.sweep(t0.plusSeconds(60)); // next 03:00 is far away

        verify(policyRunner, never()).run(any());
    }

    @Test
    void firesWeeklyOnAChosenDay() {
        // 2026-06-05 is a Friday; the next Monday 09:00 is the soonest firing.
        Policy policy =
                scheduled("p1", new Schedule.Weekly(Set.of(DayOfWeek.MONDAY), LocalTime.of(9, 0)));
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        Instant friday = Instant.parse("2026-06-05T10:00:00Z");
        trigger.sweep(friday); // baseline
        trigger.sweep(Instant.parse("2026-06-08T09:00:00Z")); // Monday 09:00

        verify(policyRunner, times(1)).run(eq(policy));
    }

    @Test
    void skipsPoliciesWithAnInvalidSchedule() {
        Policy policy = scheduledWithRawOptions("p1", Map.of()); // no schedule
        when(policyStore.findByTriggerType("schedule")).thenReturn(List.of(policy));

        trigger.sweep(Instant.parse("2026-06-05T10:00:00Z"));

        verify(policyRunner, never()).run(any());
    }

    @Test
    void validateRejectsMissingSchedule() {
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(scheduledWithRawOptions("p1", Map.of())));
    }

    @Test
    void validateRejectsAnInvalidSchedule() {
        Map<String, Object> options =
                Map.of("schedule", Map.of("type", "every", "count", -5, "unit", "MINUTES"));
        assertThrows(
                IllegalArgumentException.class,
                () -> trigger.validate(scheduledWithRawOptions("p1", options)));
    }

    @Test
    void validateAcceptsAValidScheduleAndZone() {
        Map<String, Object> options = new LinkedHashMap<>();
        options.put("schedule", new Schedule.Daily(LocalTime.of(2, 0)));
        options.put("zone", "Europe/London");
        trigger.validate(scheduledWithRawOptions("p1", options));
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

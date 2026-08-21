package stirling.software.proprietary.policy.trigger;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
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
import stirling.software.proprietary.policy.model.Schedule;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.ObjectMapper;

/**
 * Fires policy inputs on a {@link Schedule}: a fixed-interval sweep pulls each due "schedule"
 * input, independently of the policy's other inputs.
 *
 * <p>Last-fire times are in memory, so this assumes a single node and resets on restart.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduleTrigger implements PolicyTrigger {

    private static final String TYPE = "schedule";

    private final PolicyStore policyStore;
    private final PolicyRunner policyRunner;
    private final ObjectMapper objectMapper;
    private final ApplicationProperties applicationProperties;

    private final Map<BindingKey, Instant> lastFiredByBinding = new ConcurrentHashMap<>();
    private volatile ScheduledExecutorService scheduler;

    /** Identifies a schedule binding: one input (by source) of one policy. */
    private record BindingKey(String policyId, String sourceId) {}

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void validate(Policy policy, PipelineInput input) {
        ScheduleConfig.from(objectMapper, input.trigger().options());
    }

    @Override
    public synchronized void start() {
        if (scheduler != null) {
            return;
        }
        long sweepSeconds = applicationProperties.getPolicies().getScheduleSweepSeconds();
        scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        Thread.ofVirtual().name("policy-schedule-", 0).factory());
        scheduler.scheduleAtFixedRate(
                this::safeSweep, sweepSeconds, sweepSeconds, TimeUnit.SECONDS);
        log.info("Schedule trigger started (sweep every {}s)", sweepSeconds);
    }

    @Override
    public synchronized void stop() {
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
    }

    private void safeSweep() {
        try {
            sweep(Instant.now());
        } catch (RuntimeException e) {
            log.error("Schedule sweep failed: {}", e.getMessage(), e);
        }
    }

    /** Fire every scheduled input that is due as of {@code now}. Package-visible for testing. */
    void sweep(Instant now) {
        for (PolicyBinding binding : policyStore.findBindingsByTriggerType(TYPE)) {
            Policy policy = binding.policy();
            PipelineInput input = binding.input();
            ScheduleConfig config;
            try {
                config = ScheduleConfig.from(objectMapper, input.trigger().options());
            } catch (IllegalArgumentException e) {
                log.warn(
                        "Scheduled input {}/{} is misconfigured: {}",
                        policy.id(),
                        input.sourceId(),
                        e.getMessage());
                continue;
            }

            // Baseline a newly-seen binding to now so it does not fire immediately.
            BindingKey key = new BindingKey(policy.id(), input.sourceId());
            Instant last = lastFiredByBinding.computeIfAbsent(key, id -> now);
            ZonedDateTime next = config.schedule().nextAfter(last.atZone(config.zone()));
            if (next.toInstant().isAfter(now)) {
                continue;
            }
            ZonedDateTime later = config.schedule().nextAfter(next);
            while (!later.toInstant().isAfter(now)) {
                next = later;
                later = config.schedule().nextAfter(later);
            }
            lastFiredByBinding.put(key, next.toInstant());
            log.info(
                    "Scheduled input {}/{} ({}) is due",
                    policy.id(),
                    input.sourceId(),
                    policy.name());
            policyRunner.runInput(policy, input, SweepKind.FULL);
        }
    }

    /**
     * Validated schedule-trigger options: the {@link Schedule} and the zone it runs in (UTC by
     * default).
     */
    record ScheduleConfig(Schedule schedule, ZoneId zone) {

        private static final String SCHEDULE_OPTION = "schedule";
        private static final String ZONE_OPTION = "zone";

        static ScheduleConfig from(ObjectMapper mapper, Map<String, Object> options) {
            Object scheduleNode = options.get(SCHEDULE_OPTION);
            if (scheduleNode == null) {
                throw new IllegalArgumentException("schedule trigger requires a 'schedule'");
            }
            Schedule schedule;
            try {
                schedule = mapper.convertValue(scheduleNode, Schedule.class);
            } catch (RuntimeException e) {
                throw new IllegalArgumentException("invalid schedule: " + rootMessage(e), e);
            }

            ZoneId zone = ZoneOffset.UTC;
            Object zoneNode = options.get(ZONE_OPTION);
            if (zoneNode != null && !zoneNode.toString().isBlank()) {
                try {
                    zone = ZoneId.of(zoneNode.toString());
                } catch (RuntimeException e) {
                    throw new IllegalArgumentException("invalid zone '" + zoneNode + "'");
                }
            }
            return new ScheduleConfig(schedule, zone);
        }

        private static String rootMessage(Throwable t) {
            Throwable cause = t;
            while (cause.getCause() != null) {
                cause = cause.getCause();
            }
            return cause.getMessage();
        }
    }
}

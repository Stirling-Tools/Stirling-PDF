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

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.Schedule;
import stirling.software.proprietary.policy.store.PolicyStore;

import tools.jackson.databind.ObjectMapper;

/**
 * Fires policies on a {@link Schedule}. On {@link #start()} it sweeps on a fixed interval; each
 * sweep finds the enabled "schedule" policies and runs any whose next firing has come due since it
 * last fired.
 *
 * <p>The trigger only decides <em>when</em>: once a policy is due it hands it to the {@link
 * PolicyRunner}, which pulls from the policy's configured sources and starts the runs. The trigger
 * knows nothing about folders, buckets, or how many runs a sweep produces.
 *
 * <p>Caveat: last-fire times are tracked <b>in memory</b>, so this assumes a single node and resets
 * on restart; cluster-wide coordination (leader election) is a follow-up.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduleTrigger implements PolicyTrigger {

    private static final String TYPE = "schedule";

    private final PolicyStore policyStore;
    private final PolicyRunner policyRunner;
    private final ObjectMapper objectMapper;

    @Value("${stirling.policies.scheduleSweepSeconds:60}")
    private long sweepSeconds;

    private final Map<String, Instant> lastFiredByPolicy = new ConcurrentHashMap<>();
    private volatile ScheduledExecutorService scheduler;

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public void validate(Policy policy) {
        ScheduleConfig.from(objectMapper, policy.trigger().options());
    }

    @Override
    public synchronized void start() {
        if (scheduler != null) {
            return;
        }
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

    /** Fire every scheduled policy that is due as of {@code now}. Package-visible for testing. */
    void sweep(Instant now) {
        for (Policy policy : policyStore.findByTriggerType(TYPE)) {
            ScheduleConfig config;
            try {
                config = ScheduleConfig.from(objectMapper, policy.trigger().options());
            } catch (IllegalArgumentException e) {
                log.warn("Scheduled policy {} is misconfigured: {}", policy.id(), e.getMessage());
                continue;
            }

            // First time we see a policy, baseline its last-fire to now so it does not fire
            // immediately; subsequent sweeps fire it once its next firing has passed.
            Instant last = lastFiredByPolicy.computeIfAbsent(policy.id(), id -> now);
            ZonedDateTime next = config.schedule().nextAfter(last.atZone(config.zone()));
            if (!next.toInstant().isAfter(now)) {
                lastFiredByPolicy.put(policy.id(), now);
                log.info("Scheduled policy {} ({}) is due", policy.id(), policy.name());
                policyRunner.run(policy);
            }
        }
    }

    /**
     * The typed, validated form of a schedule trigger's options: the {@link Schedule} and the zone
     * its wall-clock kinds are evaluated in (default UTC). Construction fails for a missing/invalid
     * schedule or zone.
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

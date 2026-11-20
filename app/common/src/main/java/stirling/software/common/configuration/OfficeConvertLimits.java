package stirling.software.common.configuration;

import java.time.Duration;

import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.memory.Admission;

/**
 * Configures the queue in-process Office Convert work runs through: Office Convert's {@link
 * Admission}, which holds each conversion until its estimated memory and a slot are free. It is the
 * counterpart of {@code ProcessExecutor}'s per-tool limits and reads the same {@code
 * processExecutor} settings. The wait has no limit, so a busy server queues work rather than
 * refusing it; the request timeout still applies.
 */
@Component
@RequiredArgsConstructor
public class OfficeConvertLimits {

    private final ApplicationProperties applicationProperties;

    @PostConstruct
    void apply() {
        int maxConcurrent =
                applicationProperties
                        .getProcessExecutor()
                        .getSessionLimit()
                        .getOfficeConvertSessionLimit();
        Admission.Limits defaults = Admission.Limits.defaults();
        Admission.configure(
                new Admission.Limits(
                        defaults.memoryBudgetPercent(), maxConcurrent, Duration.ZERO, false));
    }
}

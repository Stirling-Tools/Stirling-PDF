package stirling.software.common.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.officeconvert.memory.Admission;

class OfficeConvertLimitsTest {

    @AfterEach
    void restoreDefaults() {
        Admission.configure(Admission.Limits.defaults());
    }

    @Test
    void queuesWithoutAWaitLimitAndAppliesTheSessionLimit() {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getProcessExecutor().getSessionLimit().setOfficeConvertSessionLimit(3);

        new OfficeConvertLimits(properties).apply();

        Admission.Limits limits = Admission.jvm().limits();
        assertThat(limits.maxWait()).isZero();
        assertThat(limits.maxConcurrent()).isEqualTo(3);
        assertThat(limits.refuseOversize()).isFalse();
    }

    @Test
    void unsetSessionLimitLeavesTheSlotsAutomatic() {
        new OfficeConvertLimits(new ApplicationProperties()).apply();

        assertThat(Admission.jvm().limits().maxConcurrent()).isZero();
    }
}

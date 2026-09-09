package stirling.software.proprietary.integration.service;

import java.util.List;

/**
 * Reports what still references an integration config, so deletion can be refused instead of
 * pulling a connection out from under a live consumer. Implementations are beans discovered by
 * {@link IntegrationConfigService} (e.g. the policy subsystem reporting sources and pipelines that
 * reference a connection).
 */
public interface IntegrationConfigUsageCheck {

    /** Human-readable labels of everything still using the config; empty when unreferenced. */
    List<String> usagesOf(long configId);
}

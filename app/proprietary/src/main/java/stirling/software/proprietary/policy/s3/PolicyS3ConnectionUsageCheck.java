package stirling.software.proprietary.policy.s3;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.integration.service.IntegrationConfigUsageCheck;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;

/**
 * Reports the policy sources and pipeline outputs referencing an S3 connection, so the connection
 * cannot be deleted out from under them (mirrors {@code SourceController}'s referenced-source
 * delete guard). Scans in memory - fine at admin-dashboard scale, always consistent with the live
 * stores.
 */
@Component
@RequiredArgsConstructor
@ConditionalOnBooleanProperty(name = "policies.enabled")
public class PolicyS3ConnectionUsageCheck implements IntegrationConfigUsageCheck {

    private final SourceStore sourceStore;
    private final PolicyStore policyStore;

    @Override
    public List<String> usagesOf(long configId) {
        List<String> usages = new ArrayList<>();
        for (Source source : sourceStore.all()) {
            if (references(source.options(), configId)) {
                usages.add("source '" + source.name() + "'");
            }
        }
        for (Policy policy : policyStore.all()) {
            if (references(policy.output().options(), configId)) {
                usages.add("pipeline '" + policy.name() + "'");
            }
        }
        return usages;
    }

    private static boolean references(Map<String, Object> options, long configId) {
        try {
            Long reference = S3ConnectionResolver.connectionId(options);
            return reference != null && reference == configId;
        } catch (IllegalArgumentException unparseable) {
            return false;
        }
    }
}

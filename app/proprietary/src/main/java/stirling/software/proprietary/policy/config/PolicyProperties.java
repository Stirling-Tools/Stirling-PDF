package stirling.software.proprietary.policy.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;

/**
 * Application-owned policy settings under {@code stirling.policies}. Today this is the
 * folder-access allowlist: the absolute base directories that folder input sources and output sinks
 * are permitted to read from or write to.
 *
 * <p>The list is empty by default, which means <b>folder access is disabled</b> (fail closed). An
 * operator must explicitly opt in by configuring the directories automations may touch, so a policy
 * can never be pointed at an arbitrary server path.
 */
@Component
@ConfigurationProperties(prefix = "stirling.policies")
@Data
public class PolicyProperties {

    /** Absolute directories within which folder sources and sinks may operate. */
    private List<String> allowedFolderRoots = new ArrayList<>();
}

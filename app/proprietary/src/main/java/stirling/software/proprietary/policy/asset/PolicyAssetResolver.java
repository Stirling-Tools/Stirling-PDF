package stirling.software.proprietary.policy.asset;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.ConditionalOnProcessor;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Loads a stored policy's referenced supporting files into a run's inputs, so a triggered or
 * scheduled run has the certificate/image/overlay its steps need without anyone uploading it at run
 * time. Assets are matched to the policy's own team (both stamped server-side), so a forged asset
 * id in a policy JSON can't pull another team's file - run-time has no principal to check instead.
 *
 * <p>Stored assets win: a binding the policy stores is overwritten with the policy's own asset, so
 * a member who can run the policy (runs are not leader-gated) can't swap the pinned certificate by
 * posting {@code assets[i].key=<id>}. A binding that names no stored asset keeps whatever the run
 * supplied, which is what a binding meant before assets could be stored.
 *
 * <p>Resolution is all or nothing per binding: a partly resolvable one is dropped so it surfaces as
 * the executor's existing missing-supporting-file error, rather than running the step short a file.
 */
@Slf4j
@Service
@ConditionalOnProcessor
@RequiredArgsConstructor
public class PolicyAssetResolver {

    private final PolicyAssetStore assetStore;

    /** Inputs with the policy's stored assets merged in under each step's asset key. */
    public PolicyInputs resolve(Policy policy, PolicyInputs inputs) {
        Map<String, List<Resource>> supporting = null;
        // Track loaded keys separately: `supporting` starts as a copy of the run's own files, so
        // it can't tell "already loaded" from "the run supplied this one" - which is what we
        // deliberately overwrite.
        Set<String> loaded = new HashSet<>();
        for (PipelineStep step : policy.steps()) {
            for (String assetKey : step.fileParameters().values()) {
                if (assetKey == null || assetKey.isBlank() || !loaded.add(assetKey)) {
                    continue;
                }
                List<Resource> resources = load(policy, assetKey);
                if (resources.isEmpty()) {
                    // A stored binding that has gone dead must not fall back to whatever the run
                    // posted under its key: that is the override this class exists to prevent.
                    if (PolicyAssetRefs.isAssetRef(assetKey)
                            && inputs.supportingFiles().containsKey(assetKey)) {
                        if (supporting == null) {
                            supporting = new LinkedHashMap<>(inputs.supportingFiles());
                        }
                        supporting.remove(assetKey);
                    }
                    continue;
                }
                if (supporting == null) {
                    supporting = new LinkedHashMap<>(inputs.supportingFiles());
                }
                supporting.put(assetKey, resources);
            }
        }
        return supporting == null ? inputs : new PolicyInputs(inputs.primary(), supporting);
    }

    /** Every id or none: a part-loaded binding would run the step with fewer files than it asks. */
    private List<Resource> load(Policy policy, String assetKey) {
        List<Resource> resources = new ArrayList<>();
        for (String id : PolicyAssetRefs.assetIds(assetKey)) {
            PolicyAsset asset = assetStore.get(id).orElse(null);
            if (asset == null || !Objects.equals(asset.teamId(), policy.teamId())) {
                log.warn(
                        "Policy {} references stored asset {} which is missing or inaccessible;"
                                + " dropping its binding",
                        policy.id(),
                        id);
                return List.of();
            }
            byte[] content = assetStore.content(id).orElse(null);
            if (content == null) {
                log.warn(
                        "Policy {} stored asset {} has no content; dropping its binding",
                        policy.id(),
                        id);
                return List.of();
            }
            resources.add(named(content, asset.fileName()));
        }
        return resources;
    }

    /** The asset bytes as a Resource carrying its original filename (tools read the extension). */
    private static Resource named(byte[] content, String fileName) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return fileName;
            }
        };
    }
}

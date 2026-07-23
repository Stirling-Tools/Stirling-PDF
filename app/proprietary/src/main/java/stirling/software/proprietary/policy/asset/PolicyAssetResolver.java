package stirling.software.proprietary.policy.asset;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * Loads a stored policy's referenced supporting files into a run's inputs, so a triggered or
 * scheduled run has the certificate/image/overlay its steps need without anyone uploading it at run
 * time. Assets are matched to the policy's own team (both stamped server-side), so a forged asset
 * id in a policy JSON can't pull another team's file — run-time has no principal to check instead.
 *
 * <p>Run-supplied assets win: a key already present in the inputs (from the multipart {@code
 * assets[i]} form) is left untouched. Unresolvable ids are skipped here and surface as the
 * executor's existing missing-supporting-file error at step time.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PolicyAssetResolver {

    private final PolicyAssetStore assetStore;

    /** Inputs with the policy's stored assets merged in under each step's asset key. */
    public PolicyInputs resolve(Policy policy, PolicyInputs inputs) {
        Map<String, List<Resource>> supporting = null;
        for (PipelineStep step : policy.steps()) {
            for (String assetKey : step.fileParameters().values()) {
                if (assetKey == null
                        || assetKey.isBlank()
                        || inputs.supportingFiles().containsKey(assetKey)
                        || (supporting != null && supporting.containsKey(assetKey))) {
                    continue;
                }
                List<Resource> resources = load(policy, assetKey);
                if (resources.isEmpty()) {
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

    private List<Resource> load(Policy policy, String assetKey) {
        List<Resource> resources = new ArrayList<>();
        for (String id : PolicyAssetRefs.assetIds(assetKey)) {
            PolicyAsset asset = assetStore.get(id).orElse(null);
            if (asset == null || !Objects.equals(asset.teamId(), policy.teamId())) {
                log.warn(
                        "Policy {} references stored asset {} which is missing or inaccessible",
                        policy.id(),
                        id);
                continue;
            }
            byte[] content = assetStore.content(id).orElse(null);
            if (content == null) {
                log.warn("Stored asset {} has no content; skipping", id);
                continue;
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

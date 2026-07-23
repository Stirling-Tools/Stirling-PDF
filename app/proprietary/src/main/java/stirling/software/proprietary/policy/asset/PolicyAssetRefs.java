package stirling.software.proprietary.policy.asset;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * Parses stored-asset references out of pipeline steps. A step's {@code fileParameters} value is an
 * asset key; for stored policies that key is one asset id, or several comma-separated ids when one
 * tool field carries multiple files (e.g. attachments). The executor looks supporting files up by
 * the whole key, so resolution keeps the full value as the map key and only splits it to load each
 * asset.
 */
public final class PolicyAssetRefs {

    private PolicyAssetRefs() {}

    /** The individual asset ids inside one {@code fileParameters} value. */
    public static List<String> assetIds(String fileParameterValue) {
        List<String> ids = new ArrayList<>();
        if (fileParameterValue == null) {
            return ids;
        }
        for (String token : fileParameterValue.split(",")) {
            String id = token.trim();
            if (!id.isEmpty()) {
                ids.add(id);
            }
        }
        return ids;
    }

    /** Every asset id referenced by any step's {@code fileParameters}, in encounter order. */
    public static Set<String> referencedAssetIds(List<PipelineStep> steps) {
        Set<String> ids = new LinkedHashSet<>();
        for (PipelineStep step : steps) {
            for (String value : step.fileParameters().values()) {
                ids.addAll(assetIds(value));
            }
        }
        return ids;
    }
}

package stirling.software.proprietary.policy.asset;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import stirling.software.proprietary.policy.model.PipelineStep;

/**
 * Parses stored-asset references out of pipeline steps. A step's {@code fileParameters} value takes
 * one of two forms:
 *
 * <ul>
 *   <li>{@code asset:<id>[,<id>...]} - stored assets, loaded from the asset store at run time.
 *       Several ids appear when one tool field carries multiple files (e.g. attachments).
 *   <li>anything else - the name of a file supplied with the run itself (the multipart {@code
 *       assets[i].key} form), which is all a binding could mean before assets could be stored.
 * </ul>
 *
 * <p>The prefix is what keeps the two apart: without it a run-supplied key reads as a missing asset
 * id, and a stored binding can be satisfied by whatever file the run supplies. The executor looks
 * supporting files up by the whole value, so resolution keeps it as the map key and only splits it
 * to load each asset.
 */
public final class PolicyAssetRefs {

    /** Marks a {@code fileParameters} value as stored asset ids rather than a run-supplied key. */
    public static final String PREFIX = "asset:";

    private PolicyAssetRefs() {}

    /** Whether a {@code fileParameters} value names stored assets. */
    public static boolean isAssetRef(String fileParameterValue) {
        return fileParameterValue != null && fileParameterValue.startsWith(PREFIX);
    }

    /** The individual asset ids inside one {@code fileParameters} value; none if it isn't a ref. */
    public static List<String> assetIds(String fileParameterValue) {
        List<String> ids = new ArrayList<>();
        if (!isAssetRef(fileParameterValue)) {
            return ids;
        }
        for (String token : fileParameterValue.substring(PREFIX.length()).split(",")) {
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

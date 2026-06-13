package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.util.List;

import org.springframework.core.io.Resource;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Delivers a finished run's output files to a destination, returning durable {@link ResultFile}
 * descriptors (fileId + metadata) for the run record.
 *
 * <p>Implementations are Spring beans selected by {@link #supports(OutputSpec)}. New destinations
 * (folder, S3) are added as new beans without changing the engine.
 */
public interface PolicyOutputSink {

    /** Stable identifier for this sink, matching {@code OutputSpec.type()} (e.g. "inline"). */
    String type();

    /** Whether this sink can handle the given output spec. */
    boolean supports(OutputSpec spec);

    /**
     * Check that an output spec is usable, throwing {@link IllegalArgumentException} if not. Called
     * when a policy is saved so misconfiguration fails fast rather than at run time.
     */
    default void validate(OutputSpec spec) {}

    /**
     * Persist/deliver the output files and return their descriptors.
     *
     * @param runId the run these outputs belong to
     * @param outputs the final pipeline output resources
     * @param spec the requested destination
     */
    List<ResultFile> deliver(String runId, List<Resource> outputs, OutputSpec spec)
            throws IOException;
}

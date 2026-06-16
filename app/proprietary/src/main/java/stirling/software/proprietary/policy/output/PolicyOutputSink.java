package stirling.software.proprietary.policy.output;

import java.io.IOException;
import java.util.List;

import org.springframework.core.io.Resource;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Delivers a finished run's outputs to a destination, returning {@link ResultFile} descriptors for
 * the run record. Implementations are beans selected by {@link #supports(OutputSpec)}, so a new
 * destination (folder, S3) is just a new bean.
 */
public interface PolicyOutputSink {

    /** Stable identifier for this sink, matching {@code OutputSpec.type()} (e.g. "inline"). */
    String type();

    /** Whether this sink can handle the given output spec. */
    boolean supports(OutputSpec spec);

    /** Throws {@link IllegalArgumentException} on bad config. Called on save to fail fast. */
    default void validate(OutputSpec spec) {}

    /** Persist/deliver the output files and return their descriptors. */
    List<ResultFile> deliver(String runId, List<Resource> outputs, OutputSpec spec)
            throws IOException;
}

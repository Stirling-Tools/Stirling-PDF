package stirling.software.proprietary.policy.output;

import java.util.List;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import stirling.software.common.model.job.ResultFile;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * Swallows a run's output files: the run's side effects (knowledge-base indexing, exports pushed to
 * explicit destinations) still happen and the run report is kept, but no processed file is stored
 * or written back. The default for ingestion policies, whose product is the index, not a
 * transformed PDF.
 */
@Service
public class DiscardOutputSink implements PolicyOutputSink {

    private static final String TYPE = "discard";

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(OutputSpec spec) {
        return spec != null && TYPE.equals(spec.type());
    }

    @Override
    public List<ResultFile> deliver(
            OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) {
        return List.of();
    }
}

package stirling.software.proprietary.policy.input;

import java.util.List;

import org.springframework.stereotype.Service;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.PolicyInputs;

/**
 * The default input source: no files. A scheduled policy with this source runs as a generator (its
 * pipeline produces output from nothing). Also the resolution for a policy with no input
 * configured.
 */
@Service
public class NoneInputSource implements InputSource {

    private static final String TYPE = "none";

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public boolean supports(InputSpec spec) {
        return spec == null || spec.type() == null || TYPE.equals(spec.type());
    }

    @Override
    public List<ResolvedInput> resolve(InputSpec spec) {
        return List.of(ResolvedInput.of(PolicyInputs.of(List.of())));
    }
}

package stirling.software.proprietary.policy.output;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;

import stirling.software.proprietary.policy.model.OutputSpec;

class DiscardOutputSinkTest {

    private final DiscardOutputSink sink = new DiscardOutputSink();

    @Test
    void supportsOnlyDiscardSpecs() {
        assertTrue(sink.supports(new OutputSpec("discard", Map.of())));
        assertFalse(sink.supports(OutputSpec.inline()));
        assertFalse(sink.supports(null));
    }

    @Test
    void deliverSwallowsOutputsAndReturnsNoResults() {
        List<org.springframework.core.io.Resource> outputs =
                List.of(new ByteArrayResource(new byte[] {1, 2, 3}));
        assertEquals(List.of(), sink.deliver(null, outputs, new OutputSpec("discard", Map.of())));
    }
}

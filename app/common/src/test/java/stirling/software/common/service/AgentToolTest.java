package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

class AgentToolTest {

    @Test
    void byIdResolvesKnownAgentToEndpointPath() {
        Optional<AgentTool> tool = AgentTool.byId("pdfCommentAgent");

        assertTrue(tool.isPresent(), "pdfCommentAgent should resolve");
        assertEquals("/api/v1/ai/pdf-comment-agent", tool.get().path());
    }

    @Test
    void byIdResolvesMathAuditorAgent() {
        Optional<AgentTool> tool = AgentTool.byId("mathAuditorAgent");

        assertTrue(tool.isPresent(), "mathAuditorAgent should resolve");
        assertEquals("/api/v1/ai/math-auditor-agent", tool.get().path());
    }

    @Test
    void byIdReturnsEmptyForUnknownId() {
        assertFalse(AgentTool.byId("unknownAgent").isPresent());
        assertFalse(AgentTool.byId("").isPresent());
        assertFalse(AgentTool.byId(null).isPresent());
    }

    @Test
    void allPathsContainsEveryRegisteredPath() {
        Set<String> paths = AgentTool.allPaths();

        assertTrue(paths.contains("/api/v1/ai/pdf-comment-agent"));
        assertTrue(paths.contains("/api/v1/ai/math-auditor-agent"));
        assertEquals(AgentTool.values().length, paths.size());
    }
}

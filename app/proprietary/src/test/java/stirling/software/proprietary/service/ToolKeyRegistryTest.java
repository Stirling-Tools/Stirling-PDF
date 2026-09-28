package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Binds {@link ToolKeyRegistry} to the frontend's tool ids. The registry is a hand-maintained copy
 * of a list that lives in TypeScript, so without this a tool added to the UI would silently stop
 * being recorded - the least visible failure this feature has, since the ranking would simply never
 * mention it.
 */
class ToolKeyRegistryTest {

    /** Each {@code export const SOMETHING_TOOL_IDS = [...] as const;} block. */
    private static final Pattern TOOL_ID_ARRAY =
            Pattern.compile(
                    "export const \\w*TOOL_IDS\\s*=\\s*\\[(.*?)\\]\\s*as const;", Pattern.DOTALL);

    private static final Pattern QUOTED = Pattern.compile("\"([^\"]+)\"");

    /**
     * Every file that defines ids. The core file's proprietary and prototype imports resolve to
     * empty stubs; the build-specific overrides beside them are where those ids actually live.
     */
    private static final List<String> SOURCES =
            List.of(
                    "frontend/editor/src/core/types/toolId.ts",
                    "frontend/editor/src/proprietary/types/proprietaryToolId.ts",
                    "frontend/editor/src/prototypes/types/prototypeToolId.ts");

    @Test
    @DisplayName("the registry lists exactly the tool ids the frontend can send")
    void registryMatchesFrontend() throws IOException {
        Path root = repositoryRoot();
        assumeTrue(root != null, "frontend sources not present in this build");

        Set<String> fromFrontend = new LinkedHashSet<>();
        for (String source : SOURCES) {
            fromFrontend.addAll(toolIdsIn(Files.readString(root.resolve(source))));
        }

        assertThat(fromFrontend).isNotEmpty();
        assertThat(ToolKeyRegistry.DEFAULT_KEYS)
                .as(
                        "ToolKeyRegistry and the frontend tool ids have drifted; add the new id to"
                                + " the registry so its usage is recorded")
                .containsExactlyInAnyOrderElementsOf(fromFrontend);
    }

    @Test
    @DisplayName("the chain column fits a full-length chain of the longest keys")
    void keysFitTheChainColumn() {
        assertThat(ToolKeyRegistry.MAX_KEY_LENGTH).isGreaterThan(0);
        assertThat(ToolKeyRegistry.DEFAULT_KEYS)
                .allSatisfy(key -> assertThat(key).doesNotContain(">"));
    }

    private static Set<String> toolIdsIn(String source) {
        Set<String> ids = new LinkedHashSet<>();
        Matcher arrays = TOOL_ID_ARRAY.matcher(source);
        while (arrays.find()) {
            Matcher quoted = QUOTED.matcher(arrays.group(1));
            while (quoted.find()) {
                ids.add(quoted.group(1));
            }
        }
        return ids;
    }

    /** Walks up from the working directory, which varies with how the test was launched. */
    private static Path repositoryRoot() {
        Path candidate = Paths.get("").toAbsolutePath();
        while (candidate != null) {
            if (Files.exists(candidate.resolve(SOURCES.get(0)))) {
                return candidate;
            }
            candidate = candidate.getParent();
        }
        return null;
    }
}

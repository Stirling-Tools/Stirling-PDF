package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** The shared cases in {@code testing/tool-io-cases.json}, which all three implementations run. */
class ToolChainValidatorConformanceTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @TestFactory
    Stream<DynamicTest> sharedCases() throws IOException {
        JsonNode root = MAPPER.readTree(Files.readString(casesFile()));
        Map<String, ToolIOSpec> specs = readSpecs(root.get("specs"));

        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode testCase : root.get("cases")) {
            tests.add(
                    DynamicTest.dynamicTest(
                            testCase.get("name").asString(), () -> runCase(testCase, specs)));
        }
        return tests.stream();
    }

    private static void runCase(JsonNode testCase, Map<String, ToolIOSpec> specs) {
        Map<String, ToolIOSpec> registry = new HashMap<>();
        List<ToolChainValidator.Step> steps = new ArrayList<>();

        int index = 0;
        for (JsonNode stepNode : testCase.get("steps")) {
            // Each step gets its own path so the same spec can appear twice in a chain.
            String operation = "/op/" + index++;
            JsonNode specName = stepNode.get("spec");
            if (specName != null && !specName.isNull()) {
                registry.put(operation, specs.get(specName.asString()));
            }
            steps.add(new ToolChainValidator.Step(operation, readParameters(stepNode)));
        }

        JsonNode sourceNode = testCase.get("sourceFormat");
        ToolFormat sourceFormat =
                sourceNode == null || sourceNode.isNull()
                        ? null
                        : ToolFormat.valueOf(sourceNode.asString());

        List<ToolDiagnostic> actual =
                new ToolChainValidator(ToolIOSource.of(registry)).validate(steps, sourceFormat);

        assertEquals(summarise(testCase.get("expected")), summarise(actual), describe(actual));
    }

    private static Map<String, Object> readParameters(JsonNode stepNode) {
        JsonNode parameters = stepNode.get("parameters");
        if (parameters == null || parameters.isNull()) {
            return null;
        }
        Map<String, Object> values = new HashMap<>();
        parameters.propertyStream().forEach(e -> values.put(e.getKey(), e.getValue().asString()));
        return values;
    }

    private static Map<String, ToolIOSpec> readSpecs(JsonNode node) {
        Map<String, ToolIOSpec> specs = new HashMap<>();
        node.propertyStream()
                .forEach(entry -> specs.put(entry.getKey(), readSpec(entry.getValue())));
        return specs;
    }

    private static ToolIOSpec readSpec(JsonNode node) {
        Set<ToolFormat> accepts = new LinkedHashSet<>();
        for (JsonNode format : node.get("accepts")) {
            accepts.add(ToolFormat.valueOf(format.asString()));
        }
        List<ToolIOSpec.Case> cases = new ArrayList<>();
        for (JsonNode rule : node.get("cases")) {
            List<ToolIOSpec.When> when = new ArrayList<>();
            for (JsonNode condition : rule.get("when")) {
                List<String> matches = new ArrayList<>();
                for (JsonNode match : condition.get("matches")) {
                    matches.add(match.asString());
                }
                when.add(new ToolIOSpec.When(condition.get("param").asString(), matches));
            }
            cases.add(
                    new ToolIOSpec.Case(
                            when,
                            ToolFormat.valueOf(rule.get("produces").asString()),
                            ToolArity.valueOf(rule.get("arity").asString())));
        }
        return new ToolIOSpec(
                accepts,
                ToolFormat.valueOf(node.get("produces").asString()),
                ToolArity.valueOf(node.get("arity").asString()),
                cases);
    }

    /** Messages are free text, so compare only the contractual parts. */
    private static List<String> summarise(List<ToolDiagnostic> diagnostics) {
        return diagnostics.stream()
                .map(d -> d.stepIndex() + ":" + d.severity() + ":" + d.code())
                .toList();
    }

    private static List<String> summarise(JsonNode expected) {
        List<String> summary = new ArrayList<>();
        for (JsonNode node : expected) {
            summary.add(
                    node.get("stepIndex").asInt()
                            + ":"
                            + node.get("severity").asString()
                            + ":"
                            + node.get("code").asString());
        }
        return summary;
    }

    private static String describe(List<ToolDiagnostic> actual) {
        return actual.stream()
                .map(ToolDiagnostic::message)
                .reduce((a, b) -> a + " | " + b)
                .orElse("no diagnostics");
    }

    /** Shared with the frontend and engine, so it lives at the repo root. */
    private static Path casesFile() {
        Path current = Path.of("").toAbsolutePath();
        while (current != null) {
            Path candidate = current.resolve("testing/tool-io-cases.json");
            if (Files.exists(candidate)) {
                return candidate;
            }
            current = current.getParent();
        }
        throw new IllegalStateException(
                "testing/tool-io-cases.json not found above the working directory");
    }
}

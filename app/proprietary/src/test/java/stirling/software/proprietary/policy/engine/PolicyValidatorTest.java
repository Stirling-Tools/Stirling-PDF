package stirling.software.proprietary.policy.engine;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIOSource;
import stirling.software.common.model.tool.ToolIOSpec;
import stirling.software.common.service.ToolChainValidator;
import stirling.software.proprietary.policy.engine.steps.RedactStepValidator;
import stirling.software.proprietary.policy.engine.steps.WatermarkStepValidator;
import stirling.software.proprietary.policy.input.InputSource;
import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.source.InProcessSourceStore;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.trigger.PolicyTrigger;

/** Tests for {@link PolicyValidator}: routes each facet to its handler and surfaces failures. */
@ExtendWith(MockitoExtension.class)
class PolicyValidatorTest {

    @Mock private PolicyTrigger trigger;
    @Mock private InputSource inputSource;
    @Mock private PolicyOutputSink outputSink;
    @Mock private PipelineStepValidator stepValidator;

    private final SourceStore sourceStore = new InProcessSourceStore();
    private PolicyValidator validator;

    @BeforeEach
    void setUp() {
        validator =
                new PolicyValidator(
                        List.of(trigger),
                        List.of(inputSource),
                        List.of(outputSink),
                        List.of(
                                stepValidator,
                                new WatermarkStepValidator(),
                                new RedactStepValidator()),
                        sourceStore,
                        new ToolChainValidator(path -> java.util.Optional.empty()));
    }

    @Test
    void delegatesEachFacetToItsHandler() {
        when(trigger.type()).thenReturn("schedule");
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);
        Policy policy = policy("schedule");

        validator.validate(policy);

        verify(trigger).validate(policy, policy.inputs().get(0));
        verify(inputSource).validate(InputSpec.folder("/in"));
        verify(outputSink).validate(policy.output());
    }

    @Test
    void skipsTriggerValidationForAManualOnlyInput() {
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);

        validator.validate(manualOnly());

        verify(trigger, never()).validate(any(), any());
    }

    @Test
    void surfacesAnInvalidConfigFromAHandler() {
        when(trigger.type()).thenReturn("schedule");
        doThrow(new IllegalArgumentException("invalid schedule"))
                .when(trigger)
                .validate(any(), any());

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> validator.validate(policy("schedule")));
        assertTrue(ex.getMessage().contains("schedule"));
    }

    @Test
    void validateOutputDelegatesToTheSink() {
        when(outputSink.supports(any())).thenReturn(true);
        OutputSpec output = new OutputSpec("s3", Map.of("connectionId", 1));

        validator.validateOutput(output);

        verify(outputSink).validate(output);
    }

    @Test
    void validateOutputSurfacesAnInaccessibleConnection() {
        when(outputSink.supports(any())).thenReturn(true);
        doThrow(new IllegalArgumentException("unknown or inaccessible s3 connection"))
                .when(outputSink)
                .validate(any());

        assertThrows(
                IllegalArgumentException.class,
                () -> validator.validateOutput(new OutputSpec("s3", Map.of("connectionId", 1))));
    }

    @Test
    void rejectsAnUnknownTriggerType() {
        when(trigger.type()).thenReturn("schedule");

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> validator.validate(policy("mystery")));
        assertTrue(ex.getMessage().contains("unknown trigger type"));
    }

    @Test
    void rejectsATextWatermarkStepWithNoText() {
        when(inputSource.supports(any())).thenReturn(true);
        // No outputSink stub: steps are validated before the output, so the sink is never reached.
        Policy policy =
                withConfiguredSteps(
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of("watermarkType", "text", "watermarkText", "  "),
                                Map.of()));

        assertThrows(IllegalArgumentException.class, () -> validator.validate(policy));
    }

    @Test
    void rejectsAnAutomaticRedactStepWithNoPatterns() {
        when(inputSource.supports(any())).thenReturn(true);
        // No outputSink stub: steps are validated before the output, so the sink is never reached.
        Policy policy =
                withConfiguredSteps(
                        new PipelineStep(
                                "/api/v1/security/auto-redact",
                                Map.of("useRegex", true, "listOfText", "  "),
                                Map.of()));

        assertThrows(IllegalArgumentException.class, () -> validator.validate(policy));
    }

    @Test
    void acceptsConfiguredSecuritySteps() {
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);
        Policy policy =
                withConfiguredSteps(
                        new PipelineStep(
                                "/api/v1/security/add-watermark",
                                Map.of("watermarkType", "text", "watermarkText", "Confidential"),
                                Map.of()),
                        new PipelineStep(
                                "/api/v1/security/auto-redact",
                                Map.of("useRegex", true, "listOfText", "\\d{3}-\\d{2}-\\d{4}"),
                                Map.of()));

        validator.validate(policy);
    }

    /** A manual-input policy carrying the given configured steps. */
    private Policy withConfiguredSteps(PipelineStep... steps) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(PipelineInput.manual(folderSourceId())),
                List.of(steps),
                OutputSpec.inline());
    }

    @Test
    void rejectsAChainWhoseStepsCannotRunOnEachOther() {
        // Extracting images then rotating them saves fine today and fails part-way through the
        // first run, which for a scheduled policy can be long after the mistake was made.
        // The chain is checked before the output, so the sink is never reached here.
        when(inputSource.supports(any())).thenReturn(true);
        PolicyValidator strict = validatorWith(IMAGE_THEN_PDF);

        IllegalArgumentException ex =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> strict.validate(withSteps(EXTRACT_IMAGES, ROTATE)));

        assertTrue(ex.getMessage().contains("cannot run in this order"), ex.getMessage());
    }

    @Test
    void acceptsAChainWhoseStepsLineUp() {
        when(inputSource.supports(any())).thenReturn(true);
        when(outputSink.supports(any())).thenReturn(true);
        PolicyValidator strict = validatorWith(IMAGE_THEN_PDF);

        strict.validate(withSteps(ROTATE, ROTATE));

        verify(outputSink).validate(any());
    }

    private static final String EXTRACT_IMAGES = "/api/v1/misc/extract-images";
    private static final String ROTATE = "/api/v1/general/rotate-pdf";

    private static final ToolIOSource IMAGE_THEN_PDF =
            ToolIOSource.of(
                    Map.of(
                            EXTRACT_IMAGES,
                            new ToolIOSpec(
                                    Set.of(ToolFormat.PDF),
                                    ToolFormat.IMAGE,
                                    ToolArity.SIMO,
                                    List.of()),
                            ROTATE,
                            new ToolIOSpec(
                                    Set.of(ToolFormat.PDF),
                                    ToolFormat.PDF,
                                    ToolArity.SISO,
                                    List.of())));

    private PolicyValidator validatorWith(ToolIOSource toolIO) {
        return new PolicyValidator(
                List.of(trigger),
                List.of(inputSource),
                List.of(outputSink),
                List.of(stepValidator),
                sourceStore,
                new ToolChainValidator(toolIO));
    }

    private Policy withSteps(String... operations) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(PipelineInput.manual(folderSourceId())),
                java.util.Arrays.stream(operations)
                        .map(op -> new PipelineStep(op, Map.of(), Map.of()))
                        .toList(),
                OutputSpec.inline());
    }

    // The one-input/one-output caps are a product decision, not a model limit: the lists stay so
    // multiple can be supported later, but saving more than one of either is rejected today.

    @Test
    void rejectsMoreThanOneInput() {
        Policy twoInputs =
                new Policy(
                        "p1",
                        "p",
                        "owner",
                        true,
                        List.of(
                                PipelineInput.manual(folderSourceId()),
                                PipelineInput.manual(folderSourceId())),
                        List.of(),
                        OutputSpec.inline());

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> validator.validate(twoInputs));
        assertTrue(ex.getMessage().contains("at most one input"));
    }

    @Test
    void rejectsMoreThanOneOutput() {
        Policy twoOutputs = manualOnly().withOutputIds(List.of("out-a", "out-b"));

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> validator.validate(twoOutputs));
        assertTrue(ex.getMessage().contains("at most one output"));
    }

    @Test
    void allowsZeroInputsAndZeroOutputs() {
        when(outputSink.supports(any())).thenReturn(true);
        Policy bare =
                new Policy("p1", "p", "owner", true, List.of(), List.of(), OutputSpec.inline());

        validator.validate(bare);
    }

    private Policy policy(String triggerType) {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(
                        new PipelineInput(
                                folderSourceId(), new TriggerConfig(triggerType, Map.of()))),
                List.of(),
                OutputSpec.inline());
    }

    private Policy manualOnly() {
        return new Policy(
                "p1",
                "p",
                "owner",
                true,
                List.of(PipelineInput.manual(folderSourceId())),
                List.of(),
                OutputSpec.inline());
    }

    /** Persists a folder source ("/in") and returns its id for a policy to reference. */
    private String folderSourceId() {
        InputSpec spec = InputSpec.folder("/in");
        return sourceStore
                .save(new Source(null, "src", spec.type(), spec.options(), true, "owner", null))
                .id();
    }
}

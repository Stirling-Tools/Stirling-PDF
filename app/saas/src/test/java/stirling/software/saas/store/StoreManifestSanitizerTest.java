package stirling.software.saas.store;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.tool.ToolDiagnostic;
import stirling.software.proprietary.policy.model.EditorConfig;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineInput;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.model.TriggerConfig;
import stirling.software.proprietary.policy.source.Source;

/** The sanitiser is the store's safety floor: every strip, clear and block has a case here. */
class StoreManifestSanitizerTest {

    private static final PublishRequest DETAILS =
            new PublishRequest(
                    "p1",
                    "Invoice intake cleanup",
                    "A description that is long enough.",
                    "ingestion",
                    null);

    private final StoreManifestSanitizer sanitizer = new StoreManifestSanitizer();

    private static Policy policy(
            List<PipelineInput> inputs, List<String> outputIds, PipelineStep... steps) {
        return new Policy(
                "p1",
                "Invoice intake cleanup",
                "alice",
                true,
                false,
                "route",
                inputs,
                List.of(steps),
                OutputSpec.inline(),
                outputIds,
                7L,
                EditorConfig.disabled());
    }

    private static PipelineStep step(String operation, Map<String, Object> params) {
        return new PipelineStep(operation, params, Map.of());
    }

    private static Optional<Source> source(String id) {
        return switch (id) {
            case "src-1" ->
                    Optional.of(
                            new Source(
                                    id,
                                    "Claims intake",
                                    "folder",
                                    Map.of("directory", "/srv/in"),
                                    true,
                                    "alice",
                                    7L));
            case "dst-1" ->
                    Optional.of(
                            new Source(id, "Archive bucket", "s3", Map.of(), true, "alice", 7L));
            default -> Optional.empty();
        };
    }

    @Test
    void stripsSourcesDestinationsAndScheduleAndSaysSo() {
        Policy policy =
                policy(
                        List.of(
                                new PipelineInput(
                                        "src-1", new TriggerConfig("schedule", Map.of()))),
                        List.of("dst-1"),
                        step("/api/v1/misc/compress-pdf", Map.of("optimizeLevel", 6)));

        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(policy, DETAILS, StoreManifestSanitizerTest::source, List.of());

        assertThat(result.findings())
                .extracting(StoreFinding::code)
                .containsExactly("source-removed", "schedule-removed", "destination-removed");
        assertThat(result.findings()).allMatch(f -> f.severity() == StoreFinding.Severity.INFO);
        assertThat(result.findings().get(0).title()).contains("Claims intake (folder)");
        assertThat(result.manifest().suggestedTrigger()).isEqualTo("on a schedule");
        assertThat(result.manifest().requiredOnInstall())
                .extracting(StoreManifest.RequiredOnInstall::kind)
                .containsExactly("source", "destination");
        assertThat(result.manifest().steps()).hasSize(1);
        assertThat(result.manifest().steps().get(0).parameters()).containsEntry("optimizeLevel", 6);
        assertThat(result.tools()).containsExactly("/api/v1/misc/compress-pdf");
        assertThat(result.needsSetup()).isFalse();
    }

    @Test
    void clearsSecretsIntoRequiredOnInstallAndKeepsHarmlessKeys() {
        Policy policy =
                policy(
                        List.of(),
                        List.of(),
                        step(
                                "/api/v1/security/add-password",
                                Map.of(
                                        "password",
                                        "hunter2",
                                        "ownerPassword",
                                        "owner2",
                                        "keyLength",
                                        256,
                                        "preventPrinting",
                                        true)));

        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(policy, DETAILS, StoreManifestSanitizerTest::source, List.of());

        Map<String, Object> kept = result.manifest().steps().get(0).parameters();
        assertThat(kept).containsOnlyKeys("keyLength", "preventPrinting");
        assertThat(result.manifest().requiredOnInstall())
                .filteredOn(r -> "parameter".equals(r.kind()))
                .extracting(StoreManifest.RequiredOnInstall::field)
                .containsExactlyInAnyOrder("password", "ownerPassword");
        assertThat(result.findings())
                .filteredOn(f -> "secret-cleared".equals(f.code()))
                .singleElement()
                .satisfies(
                        f -> {
                            assertThat(f.severity()).isEqualTo(StoreFinding.Severity.WARN);
                            assertThat(f.title()).contains("Add password");
                        });
        assertThat(result.needsSetup()).isTrue();
    }

    @Test
    void sensitiveKeyMatchingIsTokenBased() {
        assertThat(StoreManifestSanitizer.isSensitiveKey("ownerPassword")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("apiKey")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("api_key")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("connectionId")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("secretAccessKey")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("certPassphrase")).isTrue();
        assertThat(StoreManifestSanitizer.isSensitiveKey("keyLength")).isFalse();
        assertThat(StoreManifestSanitizer.isSensitiveKey("author")).isFalse();
        assertThat(StoreManifestSanitizer.isSensitiveKey("watermarkText")).isFalse();
        assertThat(StoreManifestSanitizer.isSensitiveKey("authorizationRequired")).isTrue();
    }

    @Test
    void blocksIntegrationStepsSupportingFilesAndPrivateAddresses() {
        PipelineStep integration =
                step(
                        "/api/v1/integration/webhook-post",
                        Map.of("connectionId", "c1", "path", "/x"));
        PipelineStep watermark =
                new PipelineStep(
                        "/api/v1/security/add-watermark",
                        Map.of("watermarkType", "image"),
                        Map.of("watermarkImage", "asset:abc"));
        PipelineStep external =
                step(
                        "/api/v1/misc/auto-rename",
                        Map.of("endpoint", "https://10.0.4.12/dms/ingest"));
        PipelineStep path = step("/api/v1/misc/compress-pdf", Map.of("outputDir", "/srv/out"));
        PipelineStep email = step("/api/v1/misc/compress-pdf", Map.of("notify", "ops@example.com"));
        PipelineStep url =
                step("/api/v1/misc/compress-pdf", Map.of("tsa", "http://timestamp.digicert.com"));

        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(
                        policy(
                                List.of(),
                                List.of(),
                                integration,
                                watermark,
                                external,
                                path,
                                email,
                                url),
                        DETAILS,
                        StoreManifestSanitizerTest::source,
                        List.of());

        assertThat(result.findings())
                .filteredOn(StoreFinding::blocks)
                .extracting(StoreFinding::code)
                .containsExactlyInAnyOrder(
                        "integration-step",
                        "supporting-file",
                        "private-address",
                        "filesystem-path",
                        "email-in-settings");
        assertThat(result.findings())
                .filteredOn(f -> "public-url".equals(f.code()))
                .singleElement()
                .satisfies(f -> assertThat(f.severity()).isEqualTo(StoreFinding.Severity.WARN));
        assertThat(result.findings())
                .filteredOn(f -> "private-address".equals(f.code()))
                .singleElement()
                .satisfies(f -> assertThat(f.where().stepIndex()).isEqualTo(2));
    }

    @Test
    void blocksUnknownOperationsAndChainErrors() {
        PipelineStep bogus = step("not-a-tool", Map.of());
        PipelineStep ok = step("/api/v1/misc/compress-pdf", Map.of());
        List<ToolDiagnostic> diagnostics =
                List.of(
                        ToolDiagnostic.error(
                                1, "format-mismatch", "Compress cannot take an image"));

        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(
                        policy(List.of(), List.of(), bogus, ok),
                        DETAILS,
                        StoreManifestSanitizerTest::source,
                        diagnostics);

        assertThat(result.findings())
                .filteredOn(StoreFinding::blocks)
                .extracting(StoreFinding::code)
                .containsExactlyInAnyOrder("unknown-operation", "format-mismatch");
    }

    @Test
    void emptyChainBlocks() {
        StoreManifestSanitizer.Result result =
                sanitizer.sanitize(
                        policy(List.of(), List.of()),
                        DETAILS,
                        StoreManifestSanitizerTest::source,
                        List.of());
        assertThat(result.findings()).extracting(StoreFinding::code).contains("no-steps");
    }

    @Test
    void privateAddressDetection() {
        assertThat(StoreManifestSanitizer.isPrivateAddress("https://10.0.4.12/x")).isTrue();
        assertThat(StoreManifestSanitizer.isPrivateAddress("http://dms.internal/api")).isTrue();
        assertThat(StoreManifestSanitizer.isPrivateAddress("http://localhost:8080")).isTrue();
        assertThat(StoreManifestSanitizer.isPrivateAddress("ARCHIVE COPY")).isFalse();
        assertThat(StoreManifestSanitizer.isPrivateAddress("https://timestamp.digicert.com"))
                .isFalse();
    }
}

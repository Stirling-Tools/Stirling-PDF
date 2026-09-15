package stirling.software.proprietary.accountlink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.IntStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockMultipartHttpServletRequest;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.MultiValueMap;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.AutomationRunContext;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.billing.UnitCalcPolicy;
import stirling.software.proprietary.policy.engine.PolicyExecutionResult;
import stirling.software.proprietary.policy.engine.PolicyExecutor;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PipelineStep;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;

import tools.jackson.databind.json.JsonMapper;

/** Exercises workflow file propagation through the real interceptor and persisted usage meter. */
@DataJpaTest(showSql = false)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@ExtendWith(MockitoExtension.class)
class PolicyAutomationBillingDbTest {

    private static final String ROTATE = "/api/v1/general/rotate-pdf";
    private static final String SPLIT = "/api/v1/general/split-pages";
    private static final String MERGE = "/api/v1/general/merge-pdfs";
    private static final LocalDateTime PERIOD = LocalDateTime.of(2026, 6, 1, 0, 0);

    @Autowired private UsageCounterRepository counters;
    @Autowired private MeteredInputSignatureRepository signatures;
    @Mock private InternalApiClient internalApiClient;
    @Mock private ToolMetadataService metadata;
    @Mock private InstanceEntitlementGate gate;
    @Mock private FreeTierUsageService freeTierUsageService;
    @Mock private EntitlementCache entitlementCache;
    @Mock private ObjectProvider<UsageMeterService> meterProvider;
    @TempDir Path tempDir;

    private PolicyExecutor executor;
    private InstanceEntitlementInterceptor interceptor;

    @BeforeEach
    void setUp() throws IOException {
        ApplicationProperties properties = new ApplicationProperties();
        properties.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        TempFileManager tempFiles = new TempFileManager(new TempFileRegistry(), properties);
        executor =
                new PolicyExecutor(
                        internalApiClient, metadata, tempFiles, JsonMapper.builder().build());
        interceptor =
                new InstanceEntitlementInterceptor(
                        gate, entitlementCache, meterProvider, freeTierUsageService, tempFiles);
        when(gate.evaluate(anyBoolean()))
                .thenReturn(GateDecision.allow(GateDecision.Reason.ENTITLED));
        when(meterProvider.getIfAvailable())
                .thenReturn(
                        new UsageMeterService(counters, signatures, new AccountLinkProperties()));
        when(metadata.isMultiInput(anyString()))
                .thenAnswer(invocation -> MERGE.equals(invocation.getArgument(0)));
        when(metadata.shouldUnpackZipResponse(anyString()))
                .thenAnswer(invocation -> SPLIT.equals(invocation.getArgument(0)));
        when(internalApiClient.post(anyString(), any()))
                .thenAnswer(
                        invocation ->
                                dispatch(invocation.getArgument(0), invocation.getArgument(1)));
    }

    @AfterEach
    void cleanUp() {
        counters.deleteAllInBatch();
        signatures.deleteAllInBatch();
    }

    @Test
    void splitProcessAndRemergeBillsTheOriginalDocumentOnce() throws IOException {
        PolicyExecutionResult result = execute(1, 20, SPLIT, ROTATE, MERGE, ROTATE);

        assertThat(totalUnits()).isEqualTo(1);
        assertThat(signatures.count()).isEqualTo(1);
        assertThat(stepCount("run:0")).isEqualTo(5);
        assertThat(result.origins()).containsExactly(0);
    }

    @Test
    void processedDocumentsKeepTheirBillingGroupThroughMergesAndSplits() throws IOException {
        PolicyExecutionResult result = execute(2, 20, ROTATE, MERGE, SPLIT, ROTATE, MERGE);

        assertThat(totalUnits()).isEqualTo(2);
        assertThat(signatures.count()).isEqualTo(2);
        assertThat(stepCount("run:0")).isEqualTo(1);
        assertThat(stepCount("run:1")).isEqualTo(6);
        assertThat(result.origins()).hasSize(1).containsOnlyNulls();
    }

    @Test
    void mergingFirstStillBillsAllOriginalInputs() throws IOException {
        PolicyExecutionResult result = execute(2, 20, MERGE, SPLIT, ROTATE, MERGE);

        assertThat(totalUnits()).isEqualTo(2);
        assertThat(signatures.count()).isEqualTo(1);
        assertThat(stepCount("run:1")).isEqualTo(5);
        assertThat(result.origins()).hasSize(1).containsOnlyNulls();
    }

    @Test
    void mergeAtTheStepLimitBillsItsCurrentInputs() throws IOException {
        execute(1, 3, SPLIT, ROTATE, MERGE, ROTATE);

        assertThat(totalUnits()).isEqualTo(3);
        assertThat(signatures.count()).isEqualTo(1);
        assertThat(stepCount("run:0")).isEqualTo(2);
    }

    private PolicyExecutionResult execute(int inputCount, int stepLimit, String... operations)
            throws IOException {
        when(entitlementCache.current())
                .thenReturn(
                        Optional.of(
                                new InstanceEntitlement(
                                        true,
                                        100,
                                        0,
                                        null,
                                        EntitlementState.OK,
                                        new UnitCalcPolicy(25, 1024, 1, 1000),
                                        PERIOD,
                                        PERIOD.plusMonths(1),
                                        null,
                                        stepLimit)));
        List<Resource> inputs =
                IntStream.range(0, inputCount)
                        .mapToObj(
                                index -> file("input-" + index + ".bin", new byte[] {(byte) index}))
                        .toList();
        PipelineDefinition definition =
                new PipelineDefinition(
                        "test",
                        Arrays.stream(operations)
                                .map(operation -> new PipelineStep(operation, Map.of()))
                                .toList(),
                        OutputSpec.inline());
        PolicyExecutionResult result;
        try (AutomationRunContext.Scope run = AutomationRunContext.open("run")) {
            result =
                    executor.execute(
                            definition, PolicyInputs.of(inputs), PolicyProgressListener.NOOP);
            assertThat(AutomationRunContext.currentDocument()).isNull();
        }
        return result;
    }

    private ResponseEntity<Resource> dispatch(String operation, MultiValueMap<String, Object> body)
            throws Exception {
        MockMultipartHttpServletRequest request = new MockMultipartHttpServletRequest();
        request.setRequestURI(operation);
        request.addHeader(InternalApiClient.AUTOMATION_HEADER, "true");
        request.addHeader(AutomationRunContext.RUN_ID_HEADER, AutomationRunContext.current());
        String documentId = AutomationRunContext.currentDocument();
        if (documentId != null) {
            request.addHeader(AutomationRunContext.DOCUMENT_ID_HEADER, documentId);
        }
        for (Object input : body.get("fileInput")) {
            Resource resource = (Resource) input;
            try (var stream = resource.getInputStream()) {
                request.addFile(
                        new MockMultipartFile(
                                "fileInput",
                                resource.getFilename(),
                                "application/octet-stream",
                                stream));
            }
        }
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertThat(interceptor.preHandle(request, response, this)).isTrue();
        Resource output =
                switch (operation) {
                    case SPLIT -> splitOutput();
                    case MERGE -> file("merged.bin", new byte[] {1, 2});
                    default -> (Resource) body.getFirst("fileInput");
                };
        interceptor.afterCompletion(request, response, this, null);
        return ResponseEntity.ok(output);
    }

    private static Resource splitOutput() throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (int index = 0; index < 2; index++) {
                zip.putNextEntry(new ZipEntry("part-" + index + ".bin"));
                zip.write(index);
                zip.closeEntry();
            }
        }
        return file("split.zip", bytes.toByteArray());
    }

    private static Resource file(String name, byte[] content) {
        return new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return name;
            }
        };
    }

    private long totalUnits() {
        return counters.findAll().stream().mapToLong(UsageCounter::getCumulativeUnits).sum();
    }

    private Integer stepCount(String key) {
        return signatures.findByPeriodStartAndSignature(PERIOD, key).orElseThrow().getStepCount();
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}

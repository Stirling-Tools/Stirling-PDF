package stirling.software.proprietary.policy.engine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.job.ResultFile;
import stirling.software.common.service.FileStorage;
import stirling.software.common.service.InternalApiClient;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.service.JobQueue;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.service.ResourceMonitor;
import stirling.software.common.service.TaskManager;
import stirling.software.common.service.ToolMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.proprietary.failure.PolicyFailureRecorder;
import stirling.software.proprietary.policy.asset.InProcessPolicyAssetStore;
import stirling.software.proprietary.policy.asset.PolicyAssetResolver;
import stirling.software.proprietary.policy.model.MatchOperator;
import stirling.software.proprietary.policy.model.OutputSpec;
import stirling.software.proprietary.policy.model.PipelineDefinition;
import stirling.software.proprietary.policy.model.PolicyInputs;
import stirling.software.proprietary.policy.model.PolicyRun;
import stirling.software.proprietary.policy.model.PolicyRunStatus;
import stirling.software.proprietary.policy.model.RoutedDestination;
import stirling.software.proprietary.policy.model.RoutingRule;
import stirling.software.proprietary.policy.output.InlineOutputSink;
import stirling.software.proprietary.policy.output.OutputDelivery;
import stirling.software.proprietary.policy.output.PolicyOutputResolver;
import stirling.software.proprietary.policy.output.PolicyOutputSink;
import stirling.software.proprietary.policy.progress.PolicyProgressListener;
import stirling.software.proprietary.policy.source.InProcessSourceStore;

import tools.jackson.databind.json.JsonMapper;

/**
 * End-to-end cover for the routing delivery path in {@link PolicyEngine}: a document goes to the
 * destination its first matching rule names, and one no rule claims goes to the fallback.
 */
@ExtendWith(MockitoExtension.class)
class PolicyEngineRoutingTest {

    @Mock private InternalApiClient internalApiClient;
    @Mock private ToolMetadataService toolMetadataService;
    @Mock private TaskManager taskManager;
    @Mock private FileStorage fileStorage;
    @Mock private JobOwnershipService jobOwnershipService;
    @Mock private ResourceMonitor resourceMonitor;
    @Mock private JobQueue jobQueue;
    @Mock private PolicyFailureRecorder failureRecorder;

    @TempDir Path tempDir;

    private final RecordingSink sink = new RecordingSink();
    private PolicyEngine engine;

    @BeforeEach
    void setUp() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().getTempFileManagement().setBaseTmpDir(tempDir.toString());
        props.getSystem().getTempFileManagement().setPrefix("routing-test-");
        PolicyExecutor executor =
                new PolicyExecutor(
                        internalApiClient,
                        toolMetadataService,
                        new TempFileManager(new TempFileRegistry(), props),
                        JsonMapper.builder().build());
        engine =
                new PolicyEngine(
                        executor,
                        taskManager,
                        new PolicyRunRegistry(props),
                        failureRecorder,
                        fileStorage,
                        jobOwnershipService,
                        List.of(new InlineOutputSink(fileStorage), sink),
                        new PolicyOutputResolver(new InProcessSourceStore()),
                        resourceMonitor,
                        jobQueue,
                        new PolicyAssetResolver(new InProcessPolicyAssetStore()));
        when(jobOwnershipService.createScopedJobKey(anyString()))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void routesEachDocumentToItsFirstMatchingRuleAndTheRestToTheFallback() throws Exception {
        Resource invoice = classifiedPdf("invoice.pdf", "invoice");
        Resource contract = classifiedPdf("contract.pdf", "contract");
        Resource unlabelled = classifiedPdf("misc.pdf");

        PipelineDefinition definition =
                new PipelineDefinition(
                        "routing",
                        List.of(),
                        List.of(new OutputSpec("record", java.util.Map.of("dest", "fallback"))),
                        List.of(routed("invoice", "finance"), routed("contract", "legal")));

        PolicyRun run =
                engine.submit(
                                definition,
                                PolicyInputs.of(List.of(invoice, contract, unlabelled)),
                                PolicyProgressListener.NOOP)
                        .completion()
                        .get(20, TimeUnit.SECONDS);

        assertThat(run.getStatus()).isEqualTo(PolicyRunStatus.COMPLETED);
        assertThat(sink.deliveries())
                .containsExactlyInAnyOrder(
                        "finance:invoice.pdf", "legal:contract.pdf", "fallback:misc.pdf");
    }

    @Test
    void aNonPdfOutputCannotBeRoutedAndFallsBack() throws Exception {
        Resource docx =
                new ByteArrayResource("PK\u0003\u0004not-a-pdf".getBytes()) {
                    @Override
                    public String getFilename() {
                        return "invoice.docx";
                    }
                };

        PipelineDefinition definition =
                new PipelineDefinition(
                        "routing",
                        List.of(),
                        List.of(new OutputSpec("record", java.util.Map.of("dest", "fallback"))),
                        List.of(routed("invoice", "finance")));

        PolicyRun run =
                engine.submit(
                                definition,
                                PolicyInputs.of(List.of(docx)),
                                PolicyProgressListener.NOOP)
                        .completion()
                        .get(20, TimeUnit.SECONDS);

        assertThat(run.getStatus()).isEqualTo(PolicyRunStatus.COMPLETED);
        assertThat(sink.deliveries()).containsExactly("fallback:invoice.docx");
    }

    private static RoutedDestination routed(String label, String dest) {
        return new RoutedDestination(
                new RoutingRule(
                        "classification.labels", MatchOperator.MATCHES_ANY, List.of(label), dest),
                new OutputSpec("record", java.util.Map.of("dest", dest)));
    }

    /** A real one-page PDF, optionally carrying the classifier's verdict in its metadata. */
    private static Resource classifiedPdf(String filename, String... labels) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            if (labels.length > 0) {
                String json = "{\"labels\":[\"" + String.join("\",\"", labels) + "\"]}";
                doc.getDocumentInformation()
                        .setCustomMetadataValue(PdfMetadataService.CLASSIFICATION_KEY, json);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new ByteArrayResource(out.toByteArray()) {
                @Override
                public String getFilename() {
                    return filename;
                }
            };
        }
    }

    /** Records "{dest}:{filename}" per delivered file. */
    private static final class RecordingSink implements PolicyOutputSink {
        private final List<String> deliveries = new ArrayList<>();

        List<String> deliveries() {
            return deliveries;
        }

        @Override
        public String type() {
            return "record";
        }

        @Override
        public boolean supports(OutputSpec spec) {
            return "record".equals(spec.type());
        }

        @Override
        public List<ResultFile> deliver(
                OutputDelivery delivery, List<Resource> outputs, OutputSpec spec) {
            String dest = String.valueOf(spec.options().get("dest"));
            List<ResultFile> results = new ArrayList<>();
            for (Resource output : outputs) {
                deliveries.add(dest + ":" + output.getFilename());
                results.add(new ResultFile(dest, output.getFilename(), "application/pdf", 0L));
            }
            return results;
        }
    }
}

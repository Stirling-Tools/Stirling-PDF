package stirling.software.proprietary.policy.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.servlet.mvc.annotation.ResponseStatusExceptionResolver;
import org.springframework.web.servlet.mvc.support.DefaultHandlerExceptionResolver;

import stirling.software.common.cluster.JobStore;
import stirling.software.common.cluster.inprocess.InProcessJobStore;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.JobOwnershipService;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.policy.asset.PolicyAssetCleaner;
import stirling.software.proprietary.policy.asset.PolicyAssetResolver;
import stirling.software.proprietary.policy.config.PolicyAccessGuard;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.policy.engine.PolicyRunRegistry;
import stirling.software.proprietary.policy.engine.PolicyRunner;
import stirling.software.proprietary.policy.engine.PolicyValidator;
import stirling.software.proprietary.policy.ledger.ProcessedLedger;
import stirling.software.proprietary.policy.model.Policy;
import stirling.software.proprietary.policy.overview.PolicyOverviewService;
import stirling.software.proprietary.policy.source.Source;
import stirling.software.proprietary.policy.source.SourceAccessGuard;
import stirling.software.proprietary.policy.source.SourceDocCounter;
import stirling.software.proprietary.policy.source.SourceStore;
import stirling.software.proprietary.policy.store.PolicyStore;
import stirling.software.proprietary.policy.trigger.PolicyTriggerManager;

/**
 * The save endpoint's body shape. {@link Policy} has no {@code sourceIds} or {@code trigger} field,
 * and unknown properties are ignored, so the pre-inputs body used to store a policy that referenced
 * and watched nothing while still returning 200. It must be an error instead.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("Policy save body shape")
class PolicySaveShapeTest {

    @Mock private PolicyRunner policyRunner;
    @Mock private PolicyRunRegistry runRegistry;
    @Mock private PolicyStore policyStore;
    @Mock private SourceStore sourceStore;
    @Mock private SourceAccessGuard sourceAccessGuard;
    @Mock private SourceDocCounter docCounter;
    @Mock private PolicyValidator policyValidator;
    @Mock private PolicyAccessGuard policyAccessGuard;
    @Mock private PolicyManagementAuthority policyManagementAuthority;
    @Mock private PolicyTriggerManager policyTriggerManager;
    @Mock private PolicyOverviewService policyOverviewService;
    @Mock private PolicyAssetCleaner assetCleaner;
    @Mock private PolicyAssetResolver assetResolver;
    @Mock private ProcessedLedger processedLedger;
    @Mock private TempFileManager tempFileManager;
    @Mock private JobOwnershipService jobOwnershipService;

    private final JobStore jobStore = new InProcessJobStore();
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        ApplicationProperties applicationProperties = new ApplicationProperties();
        // Login off: policy editing is then open to the local operator, so the shape is what's
        // under test rather than the role gate.
        applicationProperties.getSecurity().setEnableLogin(false);
        PolicyController controller =
                new PolicyController(
                        policyRunner,
                        runRegistry,
                        policyStore,
                        sourceStore,
                        sourceAccessGuard,
                        docCounter,
                        policyValidator,
                        policyAccessGuard,
                        policyManagementAuthority,
                        policyTriggerManager,
                        policyOverviewService,
                        assetCleaner,
                        assetResolver,
                        processedLedger,
                        List.of(),
                        applicationProperties,
                        tempFileManager,
                        jobOwnershipService,
                        jobStore);
        mockMvc =
                MockMvcBuilders.standaloneSetup(controller)
                        // standaloneSetup's defaults don't handle ResponseStatusException.
                        .setHandlerExceptionResolvers(
                                new ResponseStatusExceptionResolver(),
                                new DefaultHandlerExceptionResolver())
                        .build();
    }

    private MvcResult save(String body) throws Exception {
        return mockMvc.perform(
                        post("/api/v1/policies")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(body))
                .andReturn();
    }

    @Test
    @DisplayName("the legacy sourceIds key is rejected instead of silently dropped")
    void legacySourceIdsRejected() throws Exception {
        MvcResult result =
                save(
                        """
                        {"name":"legacy","enabled":true,"sourceIds":["src-1"],
                         "steps":[{"operation":"/api/v1/misc/compress-pdf","parameters":{}}],
                         "output":{"type":"inline","options":{}}}
                        """);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(result.getResponse().getErrorMessage()).contains("sourceIds").contains("inputs");
        verify(policyStore, never()).save(any());
    }

    @Test
    @DisplayName("the legacy policy-level trigger is rejected instead of silently dropped")
    void legacyTriggerRejected() throws Exception {
        MvcResult result =
                save(
                        """
                        {"name":"legacy","enabled":true,
                         "trigger":{"type":"folder-watch","options":{}},
                         "steps":[{"operation":"/api/v1/misc/compress-pdf","parameters":{}}],
                         "output":{"type":"inline","options":{}}}
                        """);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(result.getResponse().getErrorMessage()).contains("trigger").contains("inputs");
        verify(policyStore, never()).save(any());
    }

    @Test
    @DisplayName("the inputs shape is stored with its source reference intact")
    void modernInputsAccepted() throws Exception {
        Source source = new Source("src-1", "Incoming", "folder", Map.of(), true, "alice", 1L);
        when(sourceStore.get("src-1")).thenReturn(Optional.of(source));
        when(sourceAccessGuard.canAccess(source)).thenReturn(true);
        when(policyStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(
                        post("/api/v1/policies")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {"name":"modern","enabled":true,
                                         "inputs":[{"sourceId":"src-1","trigger":null}],
                                         "steps":[{"operation":"/api/v1/misc/compress-pdf",
                                                   "parameters":{}}],
                                         "output":{"type":"inline","options":{}}}
                                        """))
                .andExpect(status().isOk());

        ArgumentCaptor<Policy> stored = ArgumentCaptor.forClass(Policy.class);
        verify(policyStore).save(stored.capture());
        assertThat(stored.getValue().sourceIds()).containsExactly("src-1");
    }

    @Test
    @DisplayName("a body with neither key still saves")
    void bodyWithNeitherKeyAccepted() throws Exception {
        when(policyStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(
                        post("/api/v1/policies")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {"name":"editor","enabled":true,
                                         "steps":[{"operation":"/api/v1/misc/compress-pdf",
                                                   "parameters":{}}],
                                         "output":{"type":"inline","options":{}}}
                                        """))
                .andExpect(status().isOk());

        verify(policyStore).save(any());
    }

    @Test
    @DisplayName("a null trigger still saves - the editor and portal send one on every save")
    void nullTriggerAccepted() throws Exception {
        when(policyStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(
                        post("/api/v1/policies")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                        {"name":"editor","enabled":true,"trigger":null,
                                         "steps":[{"operation":"/api/v1/misc/compress-pdf",
                                                   "parameters":{}}],
                                         "output":{"type":"inline","options":{}}}
                                        """))
                .andExpect(status().isOk());

        verify(policyStore).save(any());
    }
}

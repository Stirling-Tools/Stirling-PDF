package stirling.software.saas.ai.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.ApiKeyAuthenticationToken;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.ai.controller.AiCreateController.AiCreateSessionResponse;
import stirling.software.saas.ai.controller.AiCreateController.AiCreateSessionSummary;
import stirling.software.saas.ai.controller.AiCreateController.CreateSessionRequest;
import stirling.software.saas.ai.controller.AiCreateController.CreateSessionResponse;
import stirling.software.saas.ai.controller.AiCreateController.DraftRequest;
import stirling.software.saas.ai.controller.AiCreateController.DraftSection;
import stirling.software.saas.ai.controller.AiCreateController.OutlineRequest;
import stirling.software.saas.ai.controller.AiCreateController.RepromptRequest;
import stirling.software.saas.ai.controller.AiCreateController.TemplateRequest;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.repository.AiCreateSessionRepository.AiCreateSessionSummaryProjection;
import stirling.software.saas.ai.service.AiCreateProxyService;
import stirling.software.saas.ai.service.AiCreateSessionService;
import stirling.software.saas.payg.charge.ChargeContext;
import stirling.software.saas.payg.charge.JobChargeService;
import stirling.software.saas.payg.model.BillingCategory;
import stirling.software.saas.payg.model.JobSource;
import stirling.software.saas.payg.model.ProcessType;

/**
 * Pure unit tests for {@link AiCreateController}. All collaborators are mocked; the controller's
 * handler methods are invoked directly and asserted via {@link ResponseEntity} / {@code verify}.
 *
 * <p>The controller reads {@code SecurityContextHolder} in the charge path, so each relevant test
 * seeds an authentication and {@link #clearSecurityContext()} resets it afterwards.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiCreateControllerTest {

    @Mock private AiCreateSessionService sessionService;
    @Mock private AiCreateProxyService proxyService;
    @Mock private UserRepository userRepository;
    @Mock private JobChargeService jobChargeService;

    private AiCreateController controller;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        controller =
                new AiCreateController(
                        sessionService, proxyService, userRepository, jobChargeService);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ----------------------------------------------------------------------------------------------
    // createSession + chargeForCreate
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("createSession")
    class CreateSession {

        @Test
        @DisplayName("happy path returns 200 with the new sessionId and charges one AI unit")
        void createSession_happyPath_returnsIdAndCharges() {
            authenticateWeb(userWithTeam(7L, 100L));
            AiCreateSession created = session("sess-1", "user-x");
            when(sessionService.createSession(
                            "write a report", "letter", "tmpl-1", "tex", "preview"))
                    .thenReturn(created);

            CreateSessionRequest req =
                    new CreateSessionRequest(
                            "write a report", "letter", "tmpl-1", "tex", "preview");
            ResponseEntity<CreateSessionResponse> resp = controller.createSession(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isNotNull();
            assertThat(resp.getBody().sessionId()).isEqualTo("sess-1");
            verify(sessionService)
                    .createSession("write a report", "letter", "tmpl-1", "tex", "preview");
        }

        @Test
        @DisplayName("WEB auth charges a single AI unit with WEB source and the user's team")
        void createSession_webAuth_chargesAiUnitWithWebSource() {
            authenticateWeb(userWithTeam(7L, 100L));
            when(sessionService.createSession(any(), any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.createSession(new CreateSessionRequest("p", null, null, null, null));

            ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
            verify(jobChargeService).chargeStandalone(ctx.capture(), eq(1));
            ChargeContext c = ctx.getValue();
            assertThat(c.ownerUserId()).isEqualTo(7L);
            assertThat(c.ownerTeamId()).isEqualTo(100L);
            assertThat(c.source()).isEqualTo(JobSource.WEB);
            assertThat(c.processType()).isEqualTo(ProcessType.SINGLE_TOOL);
            assertThat(c.billingCategory()).isEqualTo(BillingCategory.AI);
        }

        @Test
        @DisplayName("API-key auth charges with API source (AI usage billed the same as web)")
        void createSession_apiKeyAuth_chargesAiUnitWithApiSource() {
            User user = userWithTeam(7L, 100L);
            authenticateApiKey(user);
            when(sessionService.createSession(any(), any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.createSession(new CreateSessionRequest("p", null, null, null, null));

            ArgumentCaptor<ChargeContext> ctx = ArgumentCaptor.forClass(ChargeContext.class);
            verify(jobChargeService).chargeStandalone(ctx.capture(), eq(1));
            assertThat(ctx.getValue().source()).isEqualTo(JobSource.API);
            assertThat(ctx.getValue().billingCategory()).isEqualTo(BillingCategory.AI);
        }

        @Test
        @DisplayName("null prompt is rejected with 400 and never reaches the service")
        void createSession_nullPrompt_throwsBadRequest() {
            CreateSessionRequest req = new CreateSessionRequest(null, null, null, null, null);

            assertThatThrownBy(() -> controller.createSession(req))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
            verifyNoInteractions(sessionService);
            verifyNoInteractions(jobChargeService);
        }

        @Test
        @DisplayName("blank/whitespace prompt is rejected with 400")
        void createSession_blankPrompt_throwsBadRequest() {
            CreateSessionRequest req = new CreateSessionRequest("   ", null, null, null, null);

            assertThatThrownBy(() -> controller.createSession(req))
                    .isInstanceOf(ResponseStatusException.class);
            verifyNoInteractions(sessionService);
            verifyNoInteractions(jobChargeService);
        }

        @Test
        @DisplayName("no authentication: session still created, charge is skipped (no NPE)")
        void createSession_noAuth_skipsChargeButCreatesSession() {
            SecurityContextHolder.clearContext();
            when(sessionService.createSession(any(), any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            ResponseEntity<CreateSessionResponse> resp =
                    controller.createSession(new CreateSessionRequest("p", null, null, null, null));

            assertThat(resp.getBody().sessionId()).isEqualTo("sess-1");
            verify(jobChargeService, never())
                    .chargeStandalone(any(), org.mockito.ArgumentMatchers.anyInt());
        }

        @Test
        @DisplayName("user has no team: charge is skipped (free-grant accounting needs a team)")
        void createSession_userWithoutTeam_skipsCharge() {
            User user = new User();
            user.setId(7L);
            // No team.
            authenticateWeb(user);
            when(sessionService.createSession(any(), any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.createSession(new CreateSessionRequest("p", null, null, null, null));

            verify(jobChargeService, never())
                    .chargeStandalone(any(), org.mockito.ArgumentMatchers.anyInt());
        }

        @Test
        @DisplayName("charge failure is best-effort: session is still returned to the caller")
        void createSession_chargeThrows_sessionStillSucceeds() {
            authenticateWeb(userWithTeam(7L, 100L));
            when(sessionService.createSession(any(), any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));
            when(jobChargeService.chargeStandalone(any(), org.mockito.ArgumentMatchers.anyInt()))
                    .thenThrow(new IllegalStateException("stripe down"));

            ResponseEntity<CreateSessionResponse> resp =
                    controller.createSession(new CreateSessionRequest("p", null, null, null, null));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody().sessionId()).isEqualTo("sess-1");
        }
    }

    // ----------------------------------------------------------------------------------------------
    // deleteSession
    // ----------------------------------------------------------------------------------------------

    @Test
    @DisplayName("deleteSession returns 204 and delegates to the service")
    void deleteSession_returnsNoContentAndDelegates() {
        ResponseEntity<Void> resp = controller.deleteSession("sess-1");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(resp.getBody()).isNull();
        verify(sessionService).deleteSessionForCurrentUser("sess-1");
    }

    @Test
    @DisplayName("deleteSession propagates a not-found from the service")
    void deleteSession_propagatesServiceError() {
        org.mockito.Mockito.doThrow(new ResponseStatusException(HttpStatus.NOT_FOUND))
                .when(sessionService)
                .deleteSessionForCurrentUser("missing");

        assertThatThrownBy(() -> controller.deleteSession("missing"))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ----------------------------------------------------------------------------------------------
    // getSession + toResponse mapping
    // ----------------------------------------------------------------------------------------------

    @Test
    @DisplayName("getSession maps every entity field onto the response record")
    void getSession_mapsAllFields() {
        AiCreateSession s = session("sess-1", "user-x");
        s.setDocType("letter");
        s.setTemplateId("tmpl-1");
        s.setTemplateTex("\\documentclass{}");
        s.setPreviewTex("preview-tex");
        s.setPromptInitial("first prompt");
        s.setPromptLatest("latest prompt");
        s.setOutlineText("- one\n- two");
        s.setOutlineFilename("outline.txt");
        s.setOutlineApproved(true);
        s.setOutlineConstraints("{\"tone\":\"formal\"}");
        s.setDraftSections("[{\"label\":\"Intro\",\"value\":\"hi\"}]");
        s.setPolishedLatex("\\section{Intro}");
        s.setPdfUrl("https://signed/url.pdf");
        Instant created = Instant.parse("2024-01-01T00:00:00Z");
        Instant updated = Instant.parse("2024-01-02T00:00:00Z");
        s.setCreatedAt(created);
        s.setUpdatedAt(updated);
        s.setStatus(AiCreateSessionStatus.DRAFT_READY);
        when(sessionService.getSessionForCurrentUser("sess-1")).thenReturn(s);

        ResponseEntity<AiCreateSessionResponse> resp = controller.getSession("sess-1");

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        AiCreateSessionResponse body = resp.getBody();
        assertThat(body).isNotNull();
        assertThat(body.sessionId()).isEqualTo("sess-1");
        assertThat(body.userId()).isEqualTo("user-x");
        assertThat(body.docType()).isEqualTo("letter");
        assertThat(body.templateId()).isEqualTo("tmpl-1");
        assertThat(body.templateTex()).isEqualTo("\\documentclass{}");
        assertThat(body.previewTex()).isEqualTo("preview-tex");
        assertThat(body.promptInitial()).isEqualTo("first prompt");
        assertThat(body.promptLatest()).isEqualTo("latest prompt");
        assertThat(body.outlineText()).isEqualTo("- one\n- two");
        assertThat(body.outlineFilename()).isEqualTo("outline.txt");
        assertThat(body.outlineApproved()).isTrue();
        assertThat(body.outlineConstraints()).containsEntry("tone", "formal");
        assertThat(body.draftSections()).containsExactly(new DraftSection("Intro", "hi"));
        assertThat(body.polishedLatex()).isEqualTo("\\section{Intro}");
        assertThat(body.pdfUrl()).isEqualTo("https://signed/url.pdf");
        assertThat(body.createdAt()).isEqualTo(created);
        assertThat(body.updatedAt()).isEqualTo(updated);
        assertThat(body.status()).isEqualTo("DRAFT_READY");
    }

    @Test
    @DisplayName("getSession with null status maps status to null and null payloads to null")
    void getSession_nullStatusAndPayloads_mapToNull() {
        AiCreateSession s = session("sess-1", "user-x");
        s.setStatus(null);
        s.setOutlineConstraints(null);
        s.setDraftSections(null);
        when(sessionService.getSessionForCurrentUser("sess-1")).thenReturn(s);

        AiCreateSessionResponse body = controller.getSession("sess-1").getBody();

        assertThat(body).isNotNull();
        assertThat(body.status()).isNull();
        assertThat(body.outlineConstraints()).isNull();
        assertThat(body.draftSections()).isNull();
    }

    @Test
    @DisplayName("getSession with blank payloads parses to null rather than throwing")
    void getSession_blankPayloads_mapToNull() {
        AiCreateSession s = session("sess-1", "user-x");
        s.setOutlineConstraints("   ");
        s.setDraftSections("");
        when(sessionService.getSessionForCurrentUser("sess-1")).thenReturn(s);

        AiCreateSessionResponse body = controller.getSession("sess-1").getBody();

        assertThat(body.outlineConstraints()).isNull();
        assertThat(body.draftSections()).isNull();
    }

    @Test
    @DisplayName("getSession with malformed JSON payloads degrades to null (logged, not thrown)")
    void getSession_malformedPayloads_mapToNull() {
        AiCreateSession s = session("sess-1", "user-x");
        s.setOutlineConstraints("{not-valid-json");
        s.setDraftSections("[oops");
        when(sessionService.getSessionForCurrentUser("sess-1")).thenReturn(s);

        AiCreateSessionResponse body = controller.getSession("sess-1").getBody();

        assertThat(body.outlineConstraints()).isNull();
        assertThat(body.draftSections()).isNull();
    }

    @Test
    @DisplayName("getSession propagates a not-found from the service")
    void getSession_notFound_propagates() {
        when(sessionService.getSessionForCurrentUser("missing"))
                .thenThrow(
                        new ResponseStatusException(HttpStatus.NOT_FOUND, "AI session not found"));

        assertThatThrownBy(() -> controller.getSession("missing"))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ----------------------------------------------------------------------------------------------
    // listSessions + toSummary mapping + page/size clamping
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("listSessions")
    class ListSessions {

        @Test
        @DisplayName("maps projections to summaries and forwards includeDrafts")
        void listSessions_mapsProjections() {
            AiCreateSessionSummaryProjection p =
                    projection(
                            "sess-1",
                            "letter",
                            "tmpl-1",
                            "latest",
                            "initial",
                            AiCreateSessionStatus.SAVED,
                            "https://pdf",
                            Instant.parse("2024-01-01T00:00:00Z"),
                            Instant.parse("2024-01-02T00:00:00Z"));
            when(sessionService.listSessionSummariesForCurrentUser(any(), eq(true)))
                    .thenReturn(List.of(p));

            ResponseEntity<List<AiCreateSessionSummary>> resp =
                    controller.listSessions(0, 10, true);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).hasSize(1);
            AiCreateSessionSummary summary = resp.getBody().get(0);
            assertThat(summary.sessionId()).isEqualTo("sess-1");
            assertThat(summary.docType()).isEqualTo("letter");
            assertThat(summary.templateId()).isEqualTo("tmpl-1");
            assertThat(summary.promptLatest()).isEqualTo("latest");
            assertThat(summary.promptInitial()).isEqualTo("initial");
            assertThat(summary.status()).isEqualTo("SAVED");
            assertThat(summary.pdfUrl()).isEqualTo("https://pdf");
        }

        @Test
        @DisplayName("projection with null status maps to a null status string")
        void listSessions_nullStatus_mapsToNull() {
            AiCreateSessionSummaryProjection p =
                    projection("s", null, null, null, null, null, null, null, null);
            when(sessionService.listSessionSummariesForCurrentUser(any(), eq(false)))
                    .thenReturn(List.of(p));

            AiCreateSessionSummary summary = controller.listSessions(0, 10, false).getBody().get(0);

            assertThat(summary.status()).isNull();
        }

        @Test
        @DisplayName("negative page is clamped to 0")
        void listSessions_negativePage_clampedToZero() {
            when(sessionService.listSessionSummariesForCurrentUser(any(), anyBoolean()))
                    .thenReturn(List.of());

            controller.listSessions(-5, 10, false);

            ArgumentCaptor<org.springframework.data.domain.PageRequest> pr =
                    ArgumentCaptor.forClass(org.springframework.data.domain.PageRequest.class);
            verify(sessionService).listSessionSummariesForCurrentUser(pr.capture(), eq(false));
            assertThat(pr.getValue().getPageNumber()).isZero();
        }

        @Test
        @DisplayName("size above 50 is capped at 50")
        void listSessions_oversizeSize_cappedAt50() {
            when(sessionService.listSessionSummariesForCurrentUser(any(), anyBoolean()))
                    .thenReturn(List.of());

            controller.listSessions(0, 9999, false);

            ArgumentCaptor<org.springframework.data.domain.PageRequest> pr =
                    ArgumentCaptor.forClass(org.springframework.data.domain.PageRequest.class);
            verify(sessionService).listSessionSummariesForCurrentUser(pr.capture(), eq(false));
            assertThat(pr.getValue().getPageSize()).isEqualTo(50);
        }

        @Test
        @DisplayName("size below 1 is floored to 1")
        void listSessions_zeroSize_flooredToOne() {
            when(sessionService.listSessionSummariesForCurrentUser(any(), anyBoolean()))
                    .thenReturn(List.of());

            controller.listSessions(0, 0, false);

            ArgumentCaptor<org.springframework.data.domain.PageRequest> pr =
                    ArgumentCaptor.forClass(org.springframework.data.domain.PageRequest.class);
            verify(sessionService).listSessionSummariesForCurrentUser(pr.capture(), eq(false));
            assertThat(pr.getValue().getPageSize()).isEqualTo(1);
        }

        @Test
        @DisplayName("empty result yields an empty list, not null")
        void listSessions_empty_returnsEmptyList() {
            when(sessionService.listSessionSummariesForCurrentUser(any(), anyBoolean()))
                    .thenReturn(List.of());

            ResponseEntity<List<AiCreateSessionSummary>> resp =
                    controller.listSessions(0, 10, false);

            assertThat(resp.getBody()).isEmpty();
        }
    }

    // ----------------------------------------------------------------------------------------------
    // updateOutline
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("updateOutline")
    class UpdateOutline {

        @Test
        @DisplayName("serializes constraints to JSON and forwards text + filename")
        void updateOutline_serializesConstraints() {
            AiCreateSession updated = session("sess-1", "user-x");
            when(sessionService.updateOutline(eq("sess-1"), eq("the outline"), eq("o.txt"), any()))
                    .thenReturn(updated);

            OutlineRequest req =
                    new OutlineRequest("the outline", "o.txt", Map.of("tone", "formal"));
            ResponseEntity<AiCreateSessionResponse> resp = controller.updateOutline("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
            verify(sessionService)
                    .updateOutline(eq("sess-1"), eq("the outline"), eq("o.txt"), payload.capture());
            assertThat(payload.getValue()).contains("\"tone\":\"formal\"");
        }

        @Test
        @DisplayName("null constraints forward a null payload (use AI-generated outline)")
        void updateOutline_nullConstraints_forwardsNullPayload() {
            when(sessionService.updateOutline(any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.updateOutline("sess-1", new OutlineRequest("text", null, null));

            verify(sessionService).updateOutline("sess-1", "text", null, null);
        }

        @Test
        @DisplayName("empty outline string is allowed (signals AI-generated outline)")
        void updateOutline_emptyOutlineText_isAllowed() {
            when(sessionService.updateOutline(any(), any(), any(), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.updateOutline("sess-1", new OutlineRequest("", null, null));

            verify(sessionService).updateOutline("sess-1", "", null, null);
        }

        @Test
        @DisplayName("null outline text is rejected with 400 before touching the service")
        void updateOutline_nullText_throwsBadRequest() {
            OutlineRequest req = new OutlineRequest(null, "o.txt", Map.of("a", "b"));

            assertThatThrownBy(() -> controller.updateOutline("sess-1", req))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
            verifyNoInteractions(sessionService);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // reprompt
    // ----------------------------------------------------------------------------------------------

    @Test
    @DisplayName("reprompt forwards the prompt and returns the mapped session")
    void reprompt_forwardsPrompt() {
        AiCreateSession s = session("sess-1", "user-x");
        s.setStatus(AiCreateSessionStatus.OUTLINE_PENDING);
        when(sessionService.reprompt("sess-1", "new prompt")).thenReturn(s);

        ResponseEntity<AiCreateSessionResponse> resp =
                controller.reprompt("sess-1", new RepromptRequest("new prompt"));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody().sessionId()).isEqualTo("sess-1");
        assertThat(resp.getBody().status()).isEqualTo("OUTLINE_PENDING");
        verify(sessionService).reprompt("sess-1", "new prompt");
    }

    @Test
    @DisplayName("reprompt with null prompt is rejected with 400")
    void reprompt_nullPrompt_throwsBadRequest() {
        assertThatThrownBy(() -> controller.reprompt("sess-1", new RepromptRequest(null)))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(sessionService);
    }

    @Test
    @DisplayName("reprompt with blank prompt is rejected with 400")
    void reprompt_blankPrompt_throwsBadRequest() {
        assertThatThrownBy(() -> controller.reprompt("sess-1", new RepromptRequest("  ")))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(sessionService);
    }

    // ----------------------------------------------------------------------------------------------
    // updateDraft
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("updateDraft")
    class UpdateDraft {

        @Test
        @DisplayName("serializes draft sections to a JSON array and forwards it")
        void updateDraft_serializesSections() {
            when(sessionService.updateDraftSections(eq("sess-1"), any()))
                    .thenReturn(session("sess-1", "user-x"));

            DraftRequest req =
                    new DraftRequest(
                            List.of(
                                    new DraftSection("Intro", "hi"),
                                    new DraftSection("Body", "x")));
            controller.updateDraft("sess-1", req);

            ArgumentCaptor<String> payload = ArgumentCaptor.forClass(String.class);
            verify(sessionService).updateDraftSections(eq("sess-1"), payload.capture());
            assertThat(payload.getValue()).contains("\"label\":\"Intro\"");
            assertThat(payload.getValue()).contains("\"value\":\"hi\"");
        }

        @Test
        @DisplayName("empty list is allowed and serialized to []")
        void updateDraft_emptyList_serializesToEmptyArray() {
            when(sessionService.updateDraftSections(eq("sess-1"), any()))
                    .thenReturn(session("sess-1", "user-x"));

            controller.updateDraft("sess-1", new DraftRequest(List.of()));

            verify(sessionService).updateDraftSections("sess-1", "[]");
        }

        @Test
        @DisplayName("null draft sections is rejected with 400")
        void updateDraft_nullSections_throwsBadRequest() {
            assertThatThrownBy(() -> controller.updateDraft("sess-1", new DraftRequest(null)))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
            verifyNoInteractions(sessionService);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // updateTemplate
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("updateTemplate")
    class UpdateTemplate {

        @Test
        @DisplayName("docType only is accepted and forwarded")
        void updateTemplate_docTypeOnly() {
            when(sessionService.updateTemplate("sess-1", "letter", null))
                    .thenReturn(session("sess-1", "user-x"));

            ResponseEntity<AiCreateSessionResponse> resp =
                    controller.updateTemplate("sess-1", new TemplateRequest("letter", null));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(sessionService).updateTemplate("sess-1", "letter", null);
        }

        @Test
        @DisplayName("templateId only is accepted and forwarded")
        void updateTemplate_templateIdOnly() {
            when(sessionService.updateTemplate("sess-1", null, "tmpl-9"))
                    .thenReturn(session("sess-1", "user-x"));

            controller.updateTemplate("sess-1", new TemplateRequest(null, "tmpl-9"));

            verify(sessionService).updateTemplate("sess-1", null, "tmpl-9");
        }

        @Test
        @DisplayName("both docType and templateId null is rejected with 400")
        void updateTemplate_bothNull_throwsBadRequest() {
            assertThatThrownBy(
                            () ->
                                    controller.updateTemplate(
                                            "sess-1", new TemplateRequest(null, null)))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            e ->
                                    assertThat(((ResponseStatusException) e).getStatusCode())
                                            .isEqualTo(HttpStatus.BAD_REQUEST));
            verifyNoInteractions(sessionService);
        }

        @Test
        @DisplayName("both docType and templateId blank is rejected with 400")
        void updateTemplate_bothBlank_throwsBadRequest() {
            assertThatThrownBy(
                            () ->
                                    controller.updateTemplate(
                                            "sess-1", new TemplateRequest("  ", "")))
                    .isInstanceOf(ResponseStatusException.class);
            verifyNoInteractions(sessionService);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // fillFields (proxy, no credit header)
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("fillFields")
    class FillFields {

        @Test
        @DisplayName("checks ownership, proxies POST, copies headers, and streams the body through")
        void fillFields_proxiesAndStreams() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            HttpResponse<InputStream> upstream =
                    upstreamResponse(
                            200,
                            "section data",
                            httpHeaders(Map.of(HttpHeaders.CONTENT_TYPE, "application/json")));
            when(proxyService.forward(
                            eq("POST"),
                            eq("/api/create/sessions/sess-1/fields"),
                            eq(req),
                            eq(false)))
                    .thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.fillFields("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .isEqualTo("application/json");
            // Ownership guard runs before the proxy.
            verify(sessionService).getSessionForCurrentUser("sess-1");
            assertThat(drain(resp.getBody())).isEqualTo("section data");
        }

        @Test
        @DisplayName("ownership failure short-circuits before proxying")
        void fillFields_ownershipFailure_doesNotProxy() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(sessionService.getSessionForCurrentUser("sess-1"))
                    .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));

            assertThatThrownBy(() -> controller.fillFields("sess-1", req))
                    .isInstanceOf(ResponseStatusException.class);
            verify(proxyService, never()).forward(any(), any(), any(), anyBoolean());
        }

        @Test
        @DisplayName("upstream error: returns 503 with a JSON error body, never throws")
        void fillFields_proxyThrows_returns503() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(proxyService.forward(any(), any(), any(), anyBoolean()))
                    .thenThrow(new java.io.IOException("backend down"));

            ResponseEntity<StreamingResponseBody> resp = controller.fillFields("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
            assertThat(drain(resp.getBody())).contains("AI backend unavailable");
        }
    }

    // ----------------------------------------------------------------------------------------------
    // stream (proxy, accept event-stream)
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("stream")
    class Stream {

        @Test
        @DisplayName(
                "checks ownership, proxies GET as event-stream, defaults Content-Type, and streams")
        void stream_proxiesEventStreamAndStreams() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            HttpResponse<InputStream> upstream =
                    upstreamResponse(200, "data: hi\n\n", httpHeaders(Map.of()));
            when(proxyService.forward(
                            eq("GET"), eq("/api/create/sessions/sess-1/stream"), eq(req), eq(true)))
                    .thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.stream("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            // No upstream Content-Type → defaulted to text/event-stream.
            assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .isEqualTo(MediaType.TEXT_EVENT_STREAM_VALUE);
            // Ownership guard runs before the proxy.
            verify(sessionService).getSessionForCurrentUser("sess-1");
            assertThat(drain(resp.getBody())).isEqualTo("data: hi\n\n");
        }

        @Test
        @DisplayName("upstream non-2xx status is passed through; explicit Content-Type wins")
        void stream_upstreamStatusAndExplicitContentTypePassedThrough() throws Exception {
            SecurityContextHolder.clearContext();
            HttpServletRequest req = mock(HttpServletRequest.class);
            HttpResponse<InputStream> upstream =
                    upstreamResponse(
                            404,
                            "not found",
                            httpHeaders(
                                    Map.of(
                                            HttpHeaders.CONTENT_TYPE,
                                            "text/plain",
                                            HttpHeaders.CACHE_CONTROL,
                                            "no-cache")));
            when(proxyService.forward(any(), any(), any(), eq(true))).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.stream("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
            assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .isEqualTo("text/plain");
            assertThat(resp.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-cache");
        }

        @Test
        @DisplayName("unmappable upstream status code falls back to 502 Bad Gateway")
        void stream_unresolvableStatus_fallsBackToBadGateway() throws Exception {
            SecurityContextHolder.clearContext();
            HttpServletRequest req = mock(HttpServletRequest.class);
            // 299 is not a defined HttpStatus enum constant → HttpStatus.resolve returns null.
            HttpResponse<InputStream> upstream =
                    upstreamResponse(299, "weird", httpHeaders(Map.of()));
            when(proxyService.forward(any(), any(), any(), eq(true))).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.stream("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        }

        @Test
        @DisplayName("ownership failure short-circuits before proxying")
        void stream_ownershipFailure_doesNotProxy() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(sessionService.getSessionForCurrentUser("sess-1"))
                    .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));

            assertThatThrownBy(() -> controller.stream("sess-1", req))
                    .isInstanceOf(ResponseStatusException.class);
            verify(proxyService, never()).forward(any(), any(), any(), anyBoolean());
        }
    }

    // ----------------------------------------------------------------------------------------------
    // helpers
    // ----------------------------------------------------------------------------------------------

    private static AiCreateSession session(String sessionId, String userId) {
        AiCreateSession s = new AiCreateSession();
        s.setSessionId(sessionId);
        s.setUserId(userId);
        return s;
    }

    private static User userWithTeam(long userId, long teamId) {
        User user = new User();
        user.setId(userId);
        Team team = new Team();
        team.setId(teamId);
        user.setTeam(team);
        return user;
    }

    /**
     * Authenticated WEB principal: 3-arg ctor so isAuthenticated()==true, principal is the User.
     */
    private static void authenticateWeb(User user) {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(user, null, List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private static void authenticateApiKey(User user) {
        ApiKeyAuthenticationToken auth =
                new ApiKeyAuthenticationToken(user, "the-api-key", List.of());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    private static java.net.http.HttpHeaders httpHeaders(Map<String, String> single) {
        Map<String, List<String>> multi = new java.util.HashMap<>();
        single.forEach((k, v) -> multi.put(k, List.of(v)));
        return java.net.http.HttpHeaders.of(multi, (k, v) -> true);
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<InputStream> upstreamResponse(
            int status, String body, java.net.http.HttpHeaders headers) {
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.headers()).thenReturn(headers);
        when(response.body())
                .thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        return response;
    }

    private static String drain(StreamingResponseBody body) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        body.writeTo(out);
        return out.toString(StandardCharsets.UTF_8);
    }

    private static AiCreateSessionSummaryProjection projection(
            String sessionId,
            String docType,
            String templateId,
            String promptLatest,
            String promptInitial,
            AiCreateSessionStatus status,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt) {
        return new AiCreateSessionSummaryProjection() {
            @Override
            public String getSessionId() {
                return sessionId;
            }

            @Override
            public String getDocType() {
                return docType;
            }

            @Override
            public String getTemplateId() {
                return templateId;
            }

            @Override
            public String getPromptLatest() {
                return promptLatest;
            }

            @Override
            public String getPromptInitial() {
                return promptInitial;
            }

            @Override
            public AiCreateSessionStatus getStatus() {
                return status;
            }

            @Override
            public String getPdfUrl() {
                return pdfUrl;
            }

            @Override
            public Instant getCreatedAt() {
                return createdAt;
            }

            @Override
            public Instant getUpdatedAt() {
                return updatedAt;
            }
        };
    }
}

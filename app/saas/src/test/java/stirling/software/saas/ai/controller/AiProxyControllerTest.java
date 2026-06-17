package stirling.software.saas.ai.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.saas.ai.service.AiProxyService;
import stirling.software.saas.service.CreditService;
import stirling.software.saas.service.TeamCreditService;
import stirling.software.saas.util.CreditHeaderUtils;

/**
 * Pure unit tests for {@link AiProxyController}. Every collaborator is mocked; each handler is
 * invoked directly and asserted via {@link ResponseEntity} / {@code verify}.
 *
 * <p>All endpoints funnel through one private {@code proxy(method, path, request,
 * acceptEventStream, includeCreditsHeader)} helper, so the suite has two halves:
 *
 * <ol>
 *   <li>per-endpoint tests that pin the exact {@code (method, path, acceptEventStream)} contract a
 *       given handler forwards (the path-mapping surface), and
 *   <li>behavioural tests around the single shared {@code proxy} body: header copy, status
 *       resolution, the 503 error fallback, and the credit-header path keyed off {@code
 *       includeCreditsHeader}.
 * </ol>
 *
 * <p>The credit-header branch reads {@code SecurityContextHolder}, so the relevant tests seed an
 * authentication and {@link #clearSecurityContext()} resets it afterwards.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiProxyControllerTest {

    @Mock private AiProxyService aiProxyService;
    @Mock private CreditService creditService;
    @Mock private TeamCreditService teamCreditService;
    @Mock private UserRepository userRepository;
    @Mock private CreditHeaderUtils creditHeaderUtils;

    private AiProxyController controller;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        controller =
                new AiProxyController(
                        aiProxyService,
                        creditService,
                        teamCreditService,
                        userRepository,
                        creditHeaderUtils);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ----------------------------------------------------------------------------------------------
    // Endpoint path/method mapping — each handler pins the exact upstream contract it forwards.
    // None of these endpoints request the credit header except chat/* and edit message; see the
    // dedicated credit-header section for those.
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("endpoint → upstream (method, path, acceptEventStream) mapping")
    class EndpointMapping {

        @Test
        @DisplayName("generateSection POSTs to /api/generate_section, non-stream, no credit header")
        void generateSection() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/generate_section", req, false, ok("body"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(aiProxyService).forward("POST", "/api/generate_section", req, false);
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
        }

        @Test
        @DisplayName("generateAllSections POSTs to /api/generate_all_sections")
        void generateAllSections() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/generate_all_sections", req, false, ok("body"));

            controller.generateAllSections(req);

            verify(aiProxyService).forward("POST", "/api/generate_all_sections", req, false);
        }

        @Test
        @DisplayName("intentCheck POSTs to /api/intent/check")
        void intentCheck() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/intent/check", req, false, ok("body"));

            controller.intentCheck(req);

            verify(aiProxyService).forward("POST", "/api/intent/check", req, false);
        }

        @Test
        @DisplayName("pdfAnswer POSTs to /api/pdf/answer")
        void pdfAnswer() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/pdf/answer", req, false, ok("body"));

            controller.pdfAnswer(req);

            verify(aiProxyService).forward("POST", "/api/pdf/answer", req, false);
        }

        @Test
        @DisplayName("progressiveRender POSTs to /api/progressive_render")
        void progressiveRender() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/progressive_render", req, false, ok("body"));

            controller.progressiveRender(req);

            verify(aiProxyService).forward("POST", "/api/progressive_render", req, false);
        }

        @Test
        @DisplayName("versions GETs /api/versions/{userId} with the path variable interpolated")
        void versions() throws Exception {
            HttpServletRequest req = req();
            stubForward("GET", "/api/versions/user-42", req, false, ok("body"));

            controller.versions("user-42", req);

            verify(aiProxyService).forward("GET", "/api/versions/user-42", req, false);
        }

        @Test
        @DisplayName("style (GET) GETs /api/style/{userId}")
        void styleGet() throws Exception {
            HttpServletRequest req = req();
            stubForward("GET", "/api/style/user-42", req, false, ok("body"));

            controller.style("user-42", req);

            verify(aiProxyService).forward("GET", "/api/style/user-42", req, false);
        }

        @Test
        @DisplayName("updateStyle POSTs /api/style/{userId}")
        void updateStyle() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/style/user-42", req, false, ok("body"));

            controller.updateStyle("user-42", req);

            verify(aiProxyService).forward("POST", "/api/style/user-42", req, false);
        }

        @Test
        @DisplayName("importTemplate POSTs /api/import_template")
        void importTemplate() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/import_template", req, false, ok("body"));

            controller.importTemplate(req);

            verify(aiProxyService).forward("POST", "/api/import_template", req, false);
        }

        @Test
        @DisplayName("createEditSession POSTs /api/edit/sessions")
        void createEditSession() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/edit/sessions", req, false, ok("body"));

            controller.createEditSession(req);

            verify(aiProxyService).forward("POST", "/api/edit/sessions", req, false);
        }

        @Test
        @DisplayName("editSessionAttachment POSTs /api/edit/sessions/{id}/attachments")
        void editSessionAttachment() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/edit/sessions/sess-9/attachments", req, false, ok("body"));

            controller.editSessionAttachment("sess-9", req);

            verify(aiProxyService)
                    .forward("POST", "/api/edit/sessions/sess-9/attachments", req, false);
        }

        @Test
        @DisplayName("runEditSession POSTs /api/edit/sessions/{id}/run as an event stream")
        void runEditSession() throws Exception {
            HttpServletRequest req = req();
            // acceptEventStream == true here (and no credit header).
            stubForward("POST", "/api/edit/sessions/sess-9/run", req, true, ok("data: x\n\n"));

            controller.runEditSession("sess-9", req);

            verify(aiProxyService).forward("POST", "/api/edit/sessions/sess-9/run", req, true);
        }

        @Test
        @DisplayName("pdfEditorDocument GETs /api/pdf-editor/document")
        void pdfEditorDocument() throws Exception {
            HttpServletRequest req = req();
            stubForward("GET", "/api/pdf-editor/document", req, false, ok("body"));

            controller.pdfEditorDocument(req);

            verify(aiProxyService).forward("GET", "/api/pdf-editor/document", req, false);
        }

        @Test
        @DisplayName("pdfEditorUpload POSTs /api/pdf-editor/upload")
        void pdfEditorUpload() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/pdf-editor/upload", req, false, ok("body"));

            controller.pdfEditorUpload(req);

            verify(aiProxyService).forward("POST", "/api/pdf-editor/upload", req, false);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // output(**) — derives the upstream path from the raw request URI minus the proxy prefix.
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("output(**) wildcard path derivation")
    class OutputPathDerivation {

        @Test
        @DisplayName(
                "strips the contextPath + /api/v1/ai/output/ prefix and forwards the remainder")
        void output_stripsPrefixAndForwardsRemainder() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(req.getContextPath()).thenReturn("");
            when(req.getRequestURI()).thenReturn("/api/v1/ai/output/foo/bar.png");
            stubForward("GET", "/output/foo/bar.png", req, false, ok("img-bytes"));

            ResponseEntity<StreamingResponseBody> resp = controller.output(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(aiProxyService).forward("GET", "/output/foo/bar.png", req, false);
        }

        @Test
        @DisplayName("honours a non-empty servlet contextPath when computing the prefix")
        void output_honoursContextPath() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(req.getContextPath()).thenReturn("/stirling");
            when(req.getRequestURI()).thenReturn("/stirling/api/v1/ai/output/nested/file.pdf");
            stubForward("GET", "/output/nested/file.pdf", req, false, ok("pdf"));

            controller.output(req);

            verify(aiProxyService).forward("GET", "/output/nested/file.pdf", req, false);
        }

        @Test
        @DisplayName("URI not under the expected prefix yields an empty remainder (path /output/)")
        void output_uriOutsidePrefix_emptyRemainder() throws Exception {
            HttpServletRequest req = mock(HttpServletRequest.class);
            when(req.getContextPath()).thenReturn("");
            // Does not start with /api/v1/ai/output/ → substring branch skipped, path stays "".
            when(req.getRequestURI()).thenReturn("/totally/different");
            stubForward("GET", "/output/", req, false, ok("body"));

            controller.output(req);

            verify(aiProxyService).forward("GET", "/output/", req, false);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // Shared proxy body — header copy + status resolution + streaming.
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("proxy() header copy, status resolution and streaming")
    class ProxyBody {

        @Test
        @DisplayName("copies the whitelisted upstream headers onto the response")
        void copiesWhitelistedHeaders() throws Exception {
            HttpServletRequest req = req();
            HttpResponse<InputStream> upstream =
                    upstreamResponse(
                            200,
                            "payload",
                            httpHeaders(
                                    Map.of(
                                            HttpHeaders.CONTENT_TYPE,
                                            "application/json",
                                            HttpHeaders.CACHE_CONTROL,
                                            "no-cache",
                                            "X-Accel-Buffering",
                                            "no",
                                            HttpHeaders.CONTENT_DISPOSITION,
                                            "attachment; filename=a.pdf",
                                            HttpHeaders.CONTENT_LENGTH,
                                            "7")));
            when(aiProxyService.forward(any(), any(), any(), anyBoolean())).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            HttpHeaders h = resp.getHeaders();
            assertThat(h.getFirst(HttpHeaders.CONTENT_TYPE)).isEqualTo("application/json");
            assertThat(h.getFirst(HttpHeaders.CACHE_CONTROL)).isEqualTo("no-cache");
            assertThat(h.getFirst("X-Accel-Buffering")).isEqualTo("no");
            assertThat(h.getFirst(HttpHeaders.CONTENT_DISPOSITION))
                    .isEqualTo("attachment; filename=a.pdf");
            assertThat(h.getFirst(HttpHeaders.CONTENT_LENGTH)).isEqualTo("7");
        }

        @Test
        @DisplayName("streams the upstream body straight through to the output stream")
        void streamsBodyThrough() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/generate_section", req, false, ok("hello-stream"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(drain(resp.getBody())).isEqualTo("hello-stream");
        }

        @Test
        @DisplayName("upstream non-2xx status is passed through verbatim")
        void passesThroughUpstreamStatus() throws Exception {
            HttpServletRequest req = req();
            HttpResponse<InputStream> upstream =
                    upstreamResponse(404, "nope", httpHeaders(Map.of()));
            when(aiProxyService.forward(any(), any(), any(), anyBoolean())).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        }

        @Test
        @DisplayName("unmappable upstream status (299) falls back to 502 Bad Gateway")
        void unmappableStatus_fallsBackToBadGateway() throws Exception {
            HttpServletRequest req = req();
            // 299 is not a defined HttpStatus enum constant → HttpStatus.resolve returns null.
            HttpResponse<InputStream> upstream =
                    upstreamResponse(299, "weird", httpHeaders(Map.of()));
            when(aiProxyService.forward(any(), any(), any(), anyBoolean())).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        }

        @Test
        @DisplayName(
                "event-stream endpoint with no upstream Content-Type defaults to text/event-stream")
        void eventStreamDefaultsContentType() throws Exception {
            HttpServletRequest req = req();
            // runEditSession uses acceptEventStream == true.
            HttpResponse<InputStream> upstream =
                    upstreamResponse(200, "data: x\n\n", httpHeaders(Map.of()));
            when(aiProxyService.forward(
                            eq("POST"), eq("/api/edit/sessions/s/run"), eq(req), eq(true)))
                    .thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.runEditSession("s", req);

            assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .isEqualTo(MediaType.TEXT_EVENT_STREAM_VALUE);
        }

        @Test
        @DisplayName("event-stream endpoint keeps an explicit upstream Content-Type (no override)")
        void eventStreamKeepsExplicitContentType() throws Exception {
            HttpServletRequest req = req();
            HttpResponse<InputStream> upstream =
                    upstreamResponse(
                            200,
                            "data: x\n\n",
                            httpHeaders(Map.of(HttpHeaders.CONTENT_TYPE, "text/plain")));
            when(aiProxyService.forward(
                            eq("POST"), eq("/api/edit/sessions/s/run"), eq(req), eq(true)))
                    .thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.runEditSession("s", req);

            assertThat(resp.getHeaders().getFirst(HttpHeaders.CONTENT_TYPE))
                    .isEqualTo("text/plain");
        }

        @Test
        @DisplayName("non-event-stream endpoint with no upstream Content-Type leaves it unset")
        void nonEventStream_noContentType_leavesUnset() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/generate_section", req, false, ok("body"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getHeaders().containsHeader(HttpHeaders.CONTENT_TYPE)).isFalse();
        }

        @Test
        @DisplayName("a header carrying CR/LF injection is dropped, not copied")
        void crlfInjectionHeaderDropped() throws Exception {
            HttpServletRequest req = req();
            HttpResponse<InputStream> upstream =
                    upstreamResponse(
                            200,
                            "body",
                            httpHeaders(
                                    Map.of(
                                            HttpHeaders.CACHE_CONTROL,
                                            "no-cache\r\nX-Injected: evil")));
            when(aiProxyService.forward(any(), any(), any(), anyBoolean())).thenReturn(upstream);

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getHeaders().containsHeader(HttpHeaders.CACHE_CONTROL)).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Injected")).isFalse();
        }

        @Test
        @DisplayName("absent upstream headers are simply omitted (no blank values set)")
        void absentHeadersOmitted() throws Exception {
            HttpServletRequest req = req();
            stubForward("POST", "/api/generate_section", req, false, ok("body"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getHeaders().containsHeader(HttpHeaders.CACHE_CONTROL)).isFalse();
            assertThat(resp.getHeaders().containsHeader(HttpHeaders.CONTENT_DISPOSITION)).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Accel-Buffering")).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------------
    // Error fallback — any forward() failure becomes a 503 with a JSON error body, never throws.
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("error fallback")
    class ErrorFallback {

        @Test
        @DisplayName("IOException from forward yields 503 + JSON error body")
        void ioException_returns503() throws Exception {
            HttpServletRequest req = req();
            when(aiProxyService.forward(any(), any(), any(), anyBoolean()))
                    .thenThrow(new java.io.IOException("backend down"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(resp.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_JSON);
            assertThat(drain(resp.getBody())).contains("AI backend unavailable");
        }

        @Test
        @DisplayName("InterruptedException from forward also degrades to a 503, never propagates")
        void interruptedException_returns503() throws Exception {
            HttpServletRequest req = req();
            when(aiProxyService.forward(any(), any(), any(), anyBoolean()))
                    .thenThrow(new InterruptedException("interrupted"));

            ResponseEntity<StreamingResponseBody> resp = controller.generateSection(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(drain(resp.getBody())).contains("AI backend unavailable");
        }

        @Test
        @DisplayName("a credit-bearing endpoint failing in forward never reaches the credit path")
        void creditEndpointFailure_skipsCreditWork() throws Exception {
            HttpServletRequest req = req();
            authenticateWeb(userWithTeam(7L, 100L));
            when(aiProxyService.forward(any(), any(), any(), anyBoolean()))
                    .thenThrow(new java.io.IOException("down"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            // The credit header is only added after a successful forward.
            verifyNoInteractions(creditHeaderUtils);
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
        }
    }

    // ----------------------------------------------------------------------------------------------
    // Credit headers — only the chat/* and edit-message endpoints set includeCreditsHeader = true.
    // ----------------------------------------------------------------------------------------------

    @Nested
    @DisplayName(
            "credit-header endpoints (chatRoute / createSmartFolder / chatInfo / editSessionMessage)")
    class CreditHeaders {

        @Test
        @DisplayName(
                "chatRoute POSTs /api/chat/route and adds X-Credits-Remaining for an authed user")
        void chatRoute_addsCreditHeaders() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(42);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("42");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("AI_TOOL_CALL");
            verify(aiProxyService).forward("POST", "/api/chat/route", req, false);
        }

        @Test
        @DisplayName("createSmartFolder POSTs /api/chat/create-smart-folder with the credit header")
        void createSmartFolder_addsCreditHeaders() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(5);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/create-smart-folder", req, false, ok("folder"));

            ResponseEntity<StreamingResponseBody> resp = controller.createSmartFolder(req);

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("5");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("AI_TOOL_CALL");
            verify(aiProxyService).forward("POST", "/api/chat/create-smart-folder", req, false);
        }

        @Test
        @DisplayName("chatInfo POSTs /api/chat/info with the credit header")
        void chatInfo_addsCreditHeaders() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(3);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/info", req, false, ok("info"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatInfo(req);

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("3");
            verify(aiProxyService).forward("POST", "/api/chat/info", req, false);
        }

        @Test
        @DisplayName(
                "editSessionMessage POSTs /api/edit/sessions/{id}/messages with the credit header")
        void editSessionMessage_addsCreditHeaders() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(99);
            HttpServletRequest req = req();
            stubForward("POST", "/api/edit/sessions/sess-9/messages", req, false, ok("msg"));

            ResponseEntity<StreamingResponseBody> resp =
                    controller.editSessionMessage("sess-9", req);

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("99");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("AI_TOOL_CALL");
            verify(aiProxyService)
                    .forward("POST", "/api/edit/sessions/sess-9/messages", req, false);
        }

        @Test
        @DisplayName("zero remaining credits still emits the header (>= 0 boundary)")
        void zeroCredits_emitsHeader() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(0);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getHeaders().getFirst("X-Credits-Remaining")).isEqualTo("0");
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("AI_TOOL_CALL");
        }

        @Test
        @DisplayName(
                "negative remaining credits omits X-Credits-Remaining but still sets the source")
        void negativeCredits_omitsRemainingButKeepsSource() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(user, creditService, teamCreditService))
                    .thenReturn(-1);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getHeaders().containsHeader("X-Credits-Remaining")).isFalse();
            // X-Credit-Source is set unconditionally once we reach the credit path.
            assertThat(resp.getHeaders().getFirst("X-Credit-Source")).isEqualTo("AI_TOOL_CALL");
        }

        @Test
        @DisplayName(
                "no authentication: credit work is skipped, no credit headers, response still streams")
        void noAuth_skipsCreditHeaders() throws Exception {
            SecurityContextHolder.clearContext();
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getHeaders().containsHeader("X-Credits-Remaining")).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
            verifyNoInteractions(creditHeaderUtils);
            assertThat(drain(resp.getBody())).isEqualTo("reply");
        }

        @Test
        @DisplayName("an unauthenticated token (isAuthenticated()==false) is treated as no-auth")
        void unauthenticatedToken_skipsCreditHeaders() throws Exception {
            // 2-arg ctor → isAuthenticated() == false, so the credit branch short-circuits.
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken("alice", "pw");
            SecurityContextHolder.getContext().setAuthentication(token);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getHeaders().containsHeader("X-Credits-Remaining")).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
            verifyNoInteractions(creditHeaderUtils);
        }

        @Test
        @DisplayName("credit-header work blowing up is swallowed; the response still streams")
        void creditLookupThrows_stillStreams() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(any(), any(), any()))
                    .thenThrow(new RuntimeException("boom"));
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("payload"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            // The catch in addCreditHeaders runs before X-Credit-Source is set, so neither lands.
            assertThat(resp.getHeaders().containsHeader("X-Credits-Remaining")).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
            assertThat(drain(resp.getBody())).isEqualTo("payload");
        }

        @Test
        @DisplayName("resolving the current user failing is swallowed; the response still streams")
        void getCurrentUserThrows_stillStreams() throws Exception {
            // EnhancedJwtAuthenticationToken is the only auth type with a getCurrentUser DB lookup,
            // but a plain authed token whose principal is a User short-circuits there. To exercise
            // the swallow we make the downstream credit lookup throw (covered above); here we
            // assert
            // that a non-User principal that can't be resolved doesn't break the stream.
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken("alice", "pw", List.of());
            // principal is the String "alice"; getCurrentUser will hit
            // userRepository.findByUsername.
            when(userRepository.findByUsername("alice")).thenReturn(java.util.Optional.empty());
            SecurityContextHolder.getContext().setAuthentication(token);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("payload"));

            ResponseEntity<StreamingResponseBody> resp = controller.chatRoute(req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getHeaders().containsHeader("X-Credits-Remaining")).isFalse();
            assertThat(resp.getHeaders().containsHeader("X-Credit-Source")).isFalse();
            assertThat(drain(resp.getBody())).isEqualTo("payload");
            verifyNoInteractions(creditHeaderUtils);
        }

        @Test
        @DisplayName(
                "an authed User principal is passed straight to the credit utils (no repo lookup)")
        void authedUserPrincipal_passedToCreditUtils() throws Exception {
            User user = userWithTeam(7L, 100L);
            authenticateWeb(user);
            when(creditHeaderUtils.getRemainingCredits(any(), any(), any())).thenReturn(11);
            HttpServletRequest req = req();
            stubForward("POST", "/api/chat/route", req, false, ok("reply"));

            controller.chatRoute(req);

            // The principal User is forwarded verbatim alongside both credit services.
            verify(creditHeaderUtils).getRemainingCredits(user, creditService, teamCreditService);
            verifyNoInteractions(userRepository);
        }
    }

    // ----------------------------------------------------------------------------------------------
    // helpers
    // ----------------------------------------------------------------------------------------------

    /** A bare mocked request — these handlers never read from it directly (the service does). */
    private static HttpServletRequest req() {
        return mock(HttpServletRequest.class);
    }

    private void stubForward(
            String method,
            String path,
            HttpServletRequest req,
            boolean acceptEventStream,
            HttpResponse<InputStream> response)
            throws Exception {
        when(aiProxyService.forward(eq(method), eq(path), eq(req), eq(acceptEventStream)))
                .thenReturn(response);
    }

    private static HttpResponse<InputStream> ok(String body) {
        return upstreamResponse(200, body, httpHeaders(Map.of()));
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
}

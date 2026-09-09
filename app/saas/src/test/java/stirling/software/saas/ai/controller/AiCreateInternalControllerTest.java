package stirling.software.saas.ai.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.service.AiCreateSessionService;

/**
 * Unit tests for {@link AiCreateInternalController}. The controller is a thin internal facade over
 * {@link AiCreateSessionService}: it maps an entity to a response record, and on update serialises
 * the JSON-shaped fields (outline constraints / draft sections) before delegating. We mock the
 * service and assert the {@link ResponseEntity} plus the exact arguments forwarded.
 */
@ExtendWith(MockitoExtension.class)
class AiCreateInternalControllerTest {

    @Mock private AiCreateSessionService sessionService;

    // The controller's @RequiredArgsConstructor only takes sessionService; the ObjectMapper field
    // is an inline initializer, so a real Jackson instance is exercised by these tests.
    private AiCreateInternalController controller;

    @BeforeEach
    void setUp() {
        controller = new AiCreateInternalController(sessionService);
    }

    // --- helpers -------------------------------------------------------------------------------

    private static AiCreateSession session(String sessionId) {
        AiCreateSession s = new AiCreateSession();
        s.setSessionId(sessionId);
        s.setUserId("user-1");
        s.setDocType("report");
        s.setTemplateId("tmpl-1");
        s.setTemplateTex("\\documentclass{article}");
        s.setPreviewTex("preview");
        s.setPromptInitial("initial prompt");
        s.setPromptLatest("latest prompt");
        s.setOutlineText("outline body");
        s.setOutlineFilename("outline.txt");
        s.setOutlineApproved(true);
        s.setPolishedLatex("\\section{x}");
        s.setPdfUrl("https://example.com/doc.pdf");
        s.setStatus(AiCreateSessionStatus.DRAFT_READY);
        return s;
    }

    @Nested
    @DisplayName("getSession")
    class GetSession {

        @Test
        @DisplayName("returns 200 with the session mapped to a response record")
        void getSession_mapsAllScalarFields() {
            AiCreateSession s = session("sess-abc");
            when(sessionService.getSession("sess-abc")).thenReturn(s);

            ResponseEntity<AiCreateController.AiCreateSessionResponse> resp =
                    controller.getSession("sess-abc");

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            AiCreateController.AiCreateSessionResponse body = resp.getBody();
            assertThat(body).isNotNull();
            assertThat(body.sessionId()).isEqualTo("sess-abc");
            assertThat(body.userId()).isEqualTo("user-1");
            assertThat(body.docType()).isEqualTo("report");
            assertThat(body.templateId()).isEqualTo("tmpl-1");
            assertThat(body.templateTex()).isEqualTo("\\documentclass{article}");
            assertThat(body.previewTex()).isEqualTo("preview");
            assertThat(body.promptInitial()).isEqualTo("initial prompt");
            assertThat(body.promptLatest()).isEqualTo("latest prompt");
            assertThat(body.outlineText()).isEqualTo("outline body");
            assertThat(body.outlineFilename()).isEqualTo("outline.txt");
            assertThat(body.outlineApproved()).isTrue();
            assertThat(body.polishedLatex()).isEqualTo("\\section{x}");
            assertThat(body.pdfUrl()).isEqualTo("https://example.com/doc.pdf");
            assertThat(body.status()).isEqualTo("DRAFT_READY");

            verify(sessionService).getSession("sess-abc");
        }

        @Test
        @DisplayName("maps a null status to a null status string, not an NPE")
        void getSession_nullStatus_mapsToNull() {
            AiCreateSession s = session("sess-null-status");
            s.setStatus(null);
            when(sessionService.getSession("sess-null-status")).thenReturn(s);

            ResponseEntity<AiCreateController.AiCreateSessionResponse> resp =
                    controller.getSession("sess-null-status");

            assertThat(resp.getBody()).isNotNull();
            assertThat(resp.getBody().status()).isNull();
        }

        @Test
        @DisplayName("leaves outlineConstraints/draftSections null when the entity stored none")
        void getSession_noJsonPayloads_yieldsNullCollections() {
            AiCreateSession s = session("sess-empty-json");
            s.setOutlineConstraints(null);
            s.setDraftSections("   "); // blank string is treated as absent
            when(sessionService.getSession("sess-empty-json")).thenReturn(s);

            AiCreateController.AiCreateSessionResponse body =
                    controller.getSession("sess-empty-json").getBody();

            assertThat(body).isNotNull();
            assertThat(body.outlineConstraints()).isNull();
            assertThat(body.draftSections()).isNull();
        }

        @Test
        @DisplayName("parses stored outlineConstraints/draftSections JSON back into the response")
        void getSession_parsesStoredJsonPayloads() {
            AiCreateSession s = session("sess-json");
            s.setOutlineConstraints("{\"tone\":\"formal\",\"pages\":3}");
            s.setDraftSections("[{\"label\":\"Intro\",\"value\":\"hello\"}]");
            when(sessionService.getSession("sess-json")).thenReturn(s);

            AiCreateController.AiCreateSessionResponse body =
                    controller.getSession("sess-json").getBody();

            assertThat(body).isNotNull();
            assertThat(body.outlineConstraints())
                    .containsEntry("tone", "formal")
                    .containsEntry("pages", 3);
            assertThat(body.draftSections()).hasSize(1);
            assertThat(body.draftSections().get(0).label()).isEqualTo("Intro");
            assertThat(body.draftSections().get(0).value()).isEqualTo("hello");
        }

        @Test
        @DisplayName("malformed stored JSON is swallowed and surfaces as null, not a 500")
        void getSession_malformedJson_returnsNullCollections() {
            AiCreateSession s = session("sess-bad-json");
            s.setOutlineConstraints("{not valid json");
            s.setDraftSections("[also not valid");
            when(sessionService.getSession("sess-bad-json")).thenReturn(s);

            AiCreateController.AiCreateSessionResponse body =
                    controller.getSession("sess-bad-json").getBody();

            assertThat(body).isNotNull();
            assertThat(body.outlineConstraints()).isNull();
            assertThat(body.draftSections()).isNull();
        }

        @Test
        @DisplayName("propagates a 404 ResponseStatusException from the service")
        void getSession_notFound_propagates() {
            when(sessionService.getSession("missing"))
                    .thenThrow(
                            new ResponseStatusException(
                                    HttpStatus.NOT_FOUND, "AI session not found"));

            assertThatThrownBy(() -> controller.getSession("missing"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            ex ->
                                    assertThat(((ResponseStatusException) ex).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }
    }

    @Nested
    @DisplayName("updateSession")
    class UpdateSession {

        @Test
        @DisplayName("forwards every scalar field and serialises JSON payloads to the service")
        void updateSession_serialisesPayloadsAndForwardsAllFields() {
            AiCreateSession updated = session("sess-1");
            when(sessionService.applyInternalUpdate(
                            eq("sess-1"),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any()))
                    .thenReturn(updated);

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            "new outline",
                            "new.txt",
                            Boolean.TRUE,
                            Map.of("tone", "casual"),
                            List.of(new AiCreateController.DraftSection("Body", "content")),
                            "\\section{polished}",
                            "https://example.com/out.pdf",
                            "letter",
                            "tmpl-9",
                            AiCreateSessionStatus.POLISHED_READY);

            ResponseEntity<AiCreateController.AiCreateSessionResponse> resp =
                    controller.updateSession("sess-1", req);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(resp.getBody()).isNotNull();
            assertThat(resp.getBody().sessionId()).isEqualTo("sess-1");

            ArgumentCaptor<String> constraints = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> sections = ArgumentCaptor.forClass(String.class);
            verify(sessionService)
                    .applyInternalUpdate(
                            eq("sess-1"),
                            eq("new outline"),
                            eq("new.txt"),
                            eq(Boolean.TRUE),
                            constraints.capture(),
                            sections.capture(),
                            eq("\\section{polished}"),
                            eq("https://example.com/out.pdf"),
                            eq("letter"),
                            eq("tmpl-9"),
                            eq(AiCreateSessionStatus.POLISHED_READY));

            // Constraints serialised to a JSON object string carrying the map entry.
            assertThat(constraints.getValue()).contains("\"tone\"").contains("\"casual\"");
            // Draft sections serialised to a JSON array string carrying the record fields.
            assertThat(sections.getValue())
                    .startsWith("[")
                    .contains("\"label\":\"Body\"")
                    .contains("\"value\":\"content\"");
        }

        @Test
        @DisplayName(
                "passes null payloads through when outline constraints / draft sections absent")
        void updateSession_nullCollections_forwardsNullPayloads() {
            AiCreateSession updated = session("sess-2");
            when(sessionService.applyInternalUpdate(
                            eq("sess-2"),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull()))
                    .thenReturn(updated);

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            null, null, null, null, null, null, null, null, null, null);

            ResponseEntity<AiCreateController.AiCreateSessionResponse> resp =
                    controller.updateSession("sess-2", req);

            assertThat(resp.getBody()).isNotNull();
            // Both JSON-shaped fields forwarded as null (not "null" strings) since they were
            // absent.
            verify(sessionService)
                    .applyInternalUpdate(
                            eq("sess-2"),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull());
        }

        @Test
        @DisplayName("serialises an empty constraints map / sections list to '{}' and '[]'")
        void updateSession_emptyCollections_serialiseToEmptyJson() {
            when(sessionService.applyInternalUpdate(
                            eq("sess-3"),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any()))
                    .thenReturn(session("sess-3"));

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            null, null, null, Map.of(), List.of(), null, null, null, null, null);

            controller.updateSession("sess-3", req);

            ArgumentCaptor<String> constraints = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> sections = ArgumentCaptor.forClass(String.class);
            verify(sessionService)
                    .applyInternalUpdate(
                            eq("sess-3"),
                            isNull(),
                            isNull(),
                            isNull(),
                            constraints.capture(),
                            sections.capture(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull(),
                            isNull());
            // Empty (but present) collections still serialise: distinguishes "absent" from "empty".
            assertThat(constraints.getValue()).isEqualTo("{}");
            assertThat(sections.getValue()).isEqualTo("[]");
        }

        @Test
        @DisplayName("response reflects the entity the service returns after the update")
        void updateSession_responseReflectsReturnedEntity() {
            AiCreateSession returned = session("sess-4");
            returned.setStatus(AiCreateSessionStatus.SAVED);
            returned.setPdfUrl("https://example.com/final.pdf");
            when(sessionService.applyInternalUpdate(
                            eq("sess-4"),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any()))
                    .thenReturn(returned);

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            "x", null, null, null, null, null, null, null, null, null);

            AiCreateController.AiCreateSessionResponse body =
                    controller.updateSession("sess-4", req).getBody();

            assertThat(body).isNotNull();
            assertThat(body.status()).isEqualTo("SAVED");
            assertThat(body.pdfUrl()).isEqualTo("https://example.com/final.pdf");
        }

        @Test
        @DisplayName("propagates a 404 when the service cannot find the session to update")
        void updateSession_notFound_propagates() {
            when(sessionService.applyInternalUpdate(
                            eq("missing"),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any()))
                    .thenThrow(
                            new ResponseStatusException(
                                    HttpStatus.NOT_FOUND, "AI session not found"));

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            "x", null, null, null, null, null, null, null, null, null);

            assertThatThrownBy(() -> controller.updateSession("missing", req))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            ex ->
                                    assertThat(((ResponseStatusException) ex).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }

        @Test
        @DisplayName("round-trip: serialised draft sections parse back identically in the response")
        void updateSession_draftSectionsRoundTrip() {
            // Service echoes back the payload it was handed so we can confirm serialise -> store ->
            // parse is lossless for the DraftSection shape.
            when(sessionService.applyInternalUpdate(
                            eq("sess-rt"),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any(),
                            any()))
                    .thenAnswer(
                            inv -> {
                                AiCreateSession s = session("sess-rt");
                                s.setOutlineConstraints((String) inv.getArgument(4));
                                s.setDraftSections((String) inv.getArgument(5));
                                return s;
                            });

            AiCreateInternalController.UpdateSessionRequest req =
                    new AiCreateInternalController.UpdateSessionRequest(
                            null,
                            null,
                            null,
                            Map.of("depth", "deep"),
                            List.of(
                                    new AiCreateController.DraftSection("A", "1"),
                                    new AiCreateController.DraftSection("B", "2")),
                            null,
                            null,
                            null,
                            null,
                            null);

            AiCreateController.AiCreateSessionResponse body =
                    controller.updateSession("sess-rt", req).getBody();

            assertThat(body).isNotNull();
            assertThat(body.outlineConstraints()).containsEntry("depth", "deep");
            assertThat(body.draftSections()).hasSize(2);
            assertThat(body.draftSections().get(0).label()).isEqualTo("A");
            assertThat(body.draftSections().get(0).value()).isEqualTo("1");
            assertThat(body.draftSections().get(1).label()).isEqualTo("B");
            assertThat(body.draftSections().get(1).value()).isEqualTo("2");
        }
    }
}

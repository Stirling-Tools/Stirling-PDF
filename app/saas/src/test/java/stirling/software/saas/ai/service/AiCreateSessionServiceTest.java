package stirling.software.saas.ai.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.UserServiceInterface;
import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;
import stirling.software.saas.ai.repository.AiCreateSessionRepository;
import stirling.software.saas.security.EnhancedJwtAuthenticationToken;

/**
 * Unit tests for {@link AiCreateSessionService}.
 *
 * <p>The service is a thin persistence orchestrator over {@link AiCreateSessionRepository} plus a
 * three-tier user-id resolution chain: {@code UserServiceInterface.getCurrentUsername()} ->
 * Supabase id from the {@link SecurityContextHolder} authentication -> servlet session-scoped id ->
 * the {@code "default_user"} fallback. Repository.save is stubbed to echo its argument so the
 * field-mutation assertions can read back what the service set. SecurityContext and
 * RequestContextHolder are reset after every test to keep the static thread-local state isolated.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AiCreateSessionServiceTest {

    @Mock private AiCreateSessionRepository repository;
    @Mock private UserServiceInterface userService;

    private static final String SUPABASE_ID = "11111111-2222-3333-4444-555555555555";
    private static final String DEFAULT_USER_ID = "default_user";

    @BeforeEach
    void echoSave() {
        // Persistence is a no-op for these unit tests; save() returns the same managed entity so
        // mutation assertions can read it back.
        when(repository.save(any(AiCreateSession.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @AfterEach
    void clearStatics() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    /** Service with a present (but unstubbed-by-default) UserServiceInterface. */
    private AiCreateSessionService serviceWithUserService() {
        return new AiCreateSessionService(repository, Optional.of(userService));
    }

    /** Service with no UserServiceInterface bean wired (Optional.empty). */
    private AiCreateSessionService serviceWithoutUserService() {
        return new AiCreateSessionService(repository, Optional.empty());
    }

    /** Authenticate the SecurityContext with a Supabase-id-bearing JWT token. */
    private static void authenticateJwt(String supabaseId) {
        Map<String, Object> headers = new HashMap<>();
        headers.put("alg", "RS256");
        Map<String, Object> claims = new HashMap<>();
        claims.put("sub", supabaseId);
        claims.put("email", "user@example.com");
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(3600), headers, claims);
        EnhancedJwtAuthenticationToken auth =
                new EnhancedJwtAuthenticationToken(
                        jwt,
                        List.of(new SimpleGrantedAuthority("ROLE_USER")),
                        "user@example.com",
                        supabaseId);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    /** Bind a servlet request (optionally with a live HttpSession) to the current thread. */
    private static MockHttpServletRequest bindRequest(boolean withSession, String sessionId) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        if (withSession) {
            // (ServletContext, id) ctor fixes the session id so "session:<id>" is deterministic.
            request.setSession(new MockHttpSession(null, sessionId));
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        return request;
    }

    /** A persisted AiCreateSession owned by the given user. */
    private static AiCreateSession existingSession(String sessionId, String userId) {
        AiCreateSession session = new AiCreateSession();
        session.setSessionId(sessionId);
        session.setUserId(userId);
        session.setStatus(AiCreateSessionStatus.OUTLINE_PENDING);
        return session;
    }

    // -------------------------------------------------------------------------------------------
    // resolveUserId() — three-tier precedence chain
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("resolveUserId precedence")
    class ResolveUserId {

        @Test
        @DisplayName("UserServiceInterface username wins over everything else")
        void userServiceUsernameWins() {
            // Even with a JWT auth present, the username from the user service takes priority.
            authenticateJwt(SUPABASE_ID);
            when(userService.getCurrentUsername()).thenReturn("alice@corp.com");

            assertThat(serviceWithUserService().resolveUserId()).isEqualTo("alice@corp.com");
        }

        @Test
        @DisplayName("blank username is ignored and the chain falls through to the JWT id")
        void blankUsernameFallsThroughToJwt() {
            authenticateJwt(SUPABASE_ID);
            when(userService.getCurrentUsername()).thenReturn("   ");

            assertThat(serviceWithUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }

        @Test
        @DisplayName("anonymousUser username is ignored and the chain falls through")
        void anonymousUsernameFallsThrough() {
            authenticateJwt(SUPABASE_ID);
            when(userService.getCurrentUsername()).thenReturn("anonymousUser");

            assertThat(serviceWithUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }

        @Test
        @DisplayName("null username is ignored and the chain falls through")
        void nullUsernameFallsThrough() {
            authenticateJwt(SUPABASE_ID);
            when(userService.getCurrentUsername()).thenReturn(null);

            assertThat(serviceWithUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }

        @Test
        @DisplayName("a throwing user service is swallowed and the chain falls through")
        void throwingUserServiceSwallowedAndFallsThrough() {
            authenticateJwt(SUPABASE_ID);
            when(userService.getCurrentUsername()).thenThrow(new RuntimeException("boom"));

            assertThat(serviceWithUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }

        @Test
        @DisplayName("absent user service bean skips tier 1 and uses the JWT id")
        void absentUserServiceUsesJwt() {
            authenticateJwt(SUPABASE_ID);

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }

        @Test
        @DisplayName("unauthenticated 2-arg token (isAuthenticated=false) is skipped")
        void unauthenticatedTokenSkipped() {
            // The 2-arg UsernamePasswordAuthenticationToken ctor leaves isAuthenticated()=false,
            // so the JWT branch is bypassed and we fall through to the default.
            SecurityContextHolder.getContext()
                    .setAuthentication(new UsernamePasswordAuthenticationToken("bob", "creds"));

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(DEFAULT_USER_ID);
        }

        @Test
        @DisplayName("authenticated principal id is used via the generic getName() fallback")
        void authenticatedPrincipalNameUsed() {
            // A non-JWT authenticated token: extractSupabaseId falls back to getName().
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "carol",
                                    "creds",
                                    List.of(new SimpleGrantedAuthority("ROLE_USER"))));

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo("carol");
        }

        @Test
        @DisplayName("authenticated 'anonymousUser' name is rejected, chain falls through")
        void anonymousAuthNameRejected() {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "anonymousUser",
                                    "creds",
                                    List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(DEFAULT_USER_ID);
        }

        @Test
        @DisplayName("no auth + a live HttpSession yields a session-scoped id")
        void sessionScopedIdWhenNoAuth() {
            bindRequest(true, "sess-abc");

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo("session:sess-abc");
        }

        @Test
        @DisplayName("no auth + a request without a session falls through to default")
        void noSessionFallsThroughToDefault() {
            bindRequest(false, null);

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(DEFAULT_USER_ID);
        }

        @Test
        @DisplayName("no user service, no auth, no request context -> default_user")
        void defaultUserWhenNothingResolves() {
            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(DEFAULT_USER_ID);
        }

        @Test
        @DisplayName("JWT id is preferred over an available session-scoped id")
        void jwtPreferredOverSession() {
            authenticateJwt(SUPABASE_ID);
            bindRequest(true, "sess-xyz");

            assertThat(serviceWithoutUserService().resolveUserId()).isEqualTo(SUPABASE_ID);
        }
    }

    // -------------------------------------------------------------------------------------------
    // createSession
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("createSession")
    class CreateSession {

        @Test
        @DisplayName("populates every field, generates a session id, and persists once")
        void populatesAndSaves() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSessionService service = serviceWithUserService();

            AiCreateSession out =
                    service.createSession(
                            "my prompt", "report", "tmpl-1", "\\documentclass{}", "preview");

            assertThat(out.getUserId()).isEqualTo("owner");
            assertThat(out.getDocType()).isEqualTo("report");
            assertThat(out.getTemplateId()).isEqualTo("tmpl-1");
            assertThat(out.getTemplateTex()).isEqualTo("\\documentclass{}");
            assertThat(out.getPreviewTex()).isEqualTo("preview");
            assertThat(out.getPromptInitial()).isEqualTo("my prompt");
            assertThat(out.getPromptLatest()).isEqualTo("my prompt");
            assertThat(out.isOutlineApproved()).isFalse();
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.OUTLINE_PENDING);
            // A random UUID session id was generated.
            assertThat(out.getSessionId()).isNotBlank();
            assertThat(UUID.fromString(out.getSessionId())).isNotNull();
            verify(repository).save(out);
        }

        @Test
        @DisplayName("two sessions get distinct generated ids")
        void distinctSessionIds() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSessionService service = serviceWithUserService();

            AiCreateSession a = service.createSession("p", null, null, null, null);
            AiCreateSession b = service.createSession("p", null, null, null, null);

            assertThat(a.getSessionId()).isNotEqualTo(b.getSessionId());
        }

        @Test
        @DisplayName("uses default_user when nothing else resolves the identity")
        void usesDefaultUser() {
            AiCreateSession out =
                    serviceWithoutUserService().createSession("p", "doc", "t", "tex", "prev");

            assertThat(out.getUserId()).isEqualTo(DEFAULT_USER_ID);
        }
    }

    // -------------------------------------------------------------------------------------------
    // getSession / getSessionForCurrentUser
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("getSession / getSessionForCurrentUser")
    class GetSession {

        @Test
        @DisplayName("getSession returns the persisted row")
        void getSessionReturnsRow() {
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            assertThat(serviceWithoutUserService().getSession("s1")).isSameAs(row);
        }

        @Test
        @DisplayName("getSession throws 404 when the row is missing")
        void getSessionMissingThrows404() {
            when(repository.findById("nope")).thenReturn(Optional.empty());

            assertThatThrownBy(() -> serviceWithoutUserService().getSession("nope"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            ex ->
                                    assertThat(((ResponseStatusException) ex).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }

        @Test
        @DisplayName("getSessionForCurrentUser returns the row when the owner matches")
        void ownerMatchReturnsRow() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            assertThat(serviceWithUserService().getSessionForCurrentUser("s1")).isSameAs(row);
        }

        @Test
        @DisplayName("getSessionForCurrentUser hides another user's session behind a 404")
        void foreignOwnerThrows404() {
            when(userService.getCurrentUsername()).thenReturn("intruder");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            assertThatThrownBy(() -> serviceWithUserService().getSessionForCurrentUser("s1"))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(
                            ex ->
                                    assertThat(((ResponseStatusException) ex).getStatusCode())
                                            .isEqualTo(HttpStatus.NOT_FOUND));
        }
    }

    // -------------------------------------------------------------------------------------------
    // updateOutline
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("updateOutline")
    class UpdateOutline {

        @Test
        @DisplayName("sets outline text, filename, constraints, approval flag and APPROVED status")
        void fullUpdate() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out =
                    serviceWithUserService()
                            .updateOutline("s1", "the outline", "outline.tex", "be brief");

            assertThat(out.getOutlineText()).isEqualTo("the outline");
            assertThat(out.getOutlineFilename()).isEqualTo("outline.tex");
            assertThat(out.getOutlineConstraints()).isEqualTo("be brief");
            assertThat(out.isOutlineApproved()).isTrue();
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.OUTLINE_APPROVED);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("blank filename is not applied; null constraints are left untouched")
        void blankFilenameAndNullConstraintsIgnored() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            row.setOutlineFilename("keep.tex");
            row.setOutlineConstraints("keep-constraints");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out = serviceWithUserService().updateOutline("s1", "txt", "  ", null);

            assertThat(out.getOutlineFilename()).isEqualTo("keep.tex");
            assertThat(out.getOutlineConstraints()).isEqualTo("keep-constraints");
            // Still approved + status flipped even with skipped optional fields.
            assertThat(out.isOutlineApproved()).isTrue();
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.OUTLINE_APPROVED);
        }

        @Test
        @DisplayName("empty-string constraints ARE applied (only null is skipped)")
        void emptyConstraintsApplied() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            row.setOutlineConstraints("old");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out = serviceWithUserService().updateOutline("s1", "t", "f", "");

            assertThat(out.getOutlineConstraints()).isEmpty();
        }

        @Test
        @DisplayName("a foreign session 404s before any mutation or save")
        void foreignSessionBlocked() {
            when(userService.getCurrentUsername()).thenReturn("intruder");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            assertThatThrownBy(() -> serviceWithUserService().updateOutline("s1", "t", "f", "c"))
                    .isInstanceOf(ResponseStatusException.class);
            assertThat(row.getOutlineText()).isNull();
            verify(repository, never()).save(any());
        }
    }

    // -------------------------------------------------------------------------------------------
    // updateDraftSections
    // -------------------------------------------------------------------------------------------

    @Test
    @DisplayName("updateDraftSections stores sections and flips status to DRAFT_READY")
    void updateDraftSections() {
        when(userService.getCurrentUsername()).thenReturn("owner");
        AiCreateSession row = existingSession("s1", "owner");
        when(repository.findById("s1")).thenReturn(Optional.of(row));

        AiCreateSession out = serviceWithUserService().updateDraftSections("s1", "section json");

        assertThat(out.getDraftSections()).isEqualTo("section json");
        assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.DRAFT_READY);
        verify(repository).save(row);
    }

    // -------------------------------------------------------------------------------------------
    // updateTemplate
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("updateTemplate")
    class UpdateTemplate {

        @Test
        @DisplayName("updates docType and templateId when both are non-blank")
        void updatesBoth() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            row.setDocType("old-doc");
            row.setTemplateId("old-tmpl");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out =
                    serviceWithUserService().updateTemplate("s1", "new-doc", "new-tmpl");

            assertThat(out.getDocType()).isEqualTo("new-doc");
            assertThat(out.getTemplateId()).isEqualTo("new-tmpl");
            verify(repository).save(row);
        }

        @Test
        @DisplayName("null/blank inputs leave the existing template untouched")
        void blankInputsKeepExisting() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            row.setDocType("old-doc");
            row.setTemplateId("old-tmpl");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out = serviceWithUserService().updateTemplate("s1", null, "  ");

            assertThat(out.getDocType()).isEqualTo("old-doc");
            assertThat(out.getTemplateId()).isEqualTo("old-tmpl");
            // Still persists (no-op save) — the method always saves.
            verify(repository).save(row);
        }
    }

    // -------------------------------------------------------------------------------------------
    // reprompt
    // -------------------------------------------------------------------------------------------

    @Test
    @DisplayName("reprompt resets all derived artifacts and re-enters OUTLINE_PENDING")
    void reprompt() {
        when(userService.getCurrentUsername()).thenReturn("owner");
        AiCreateSession row = existingSession("s1", "owner");
        row.setPromptLatest("old prompt");
        row.setOutlineText("old outline");
        row.setOutlineFilename("old.tex");
        row.setOutlineApproved(true);
        row.setOutlineConstraints("old constraints");
        row.setDraftSections("old draft");
        row.setPolishedLatex("old latex");
        row.setPdfUrl("https://old/url");
        row.setStatus(AiCreateSessionStatus.POLISHED_READY);
        when(repository.findById("s1")).thenReturn(Optional.of(row));

        AiCreateSession out = serviceWithUserService().reprompt("s1", "fresh prompt");

        assertThat(out.getPromptLatest()).isEqualTo("fresh prompt");
        assertThat(out.getOutlineText()).isNull();
        assertThat(out.getOutlineFilename()).isNull();
        assertThat(out.isOutlineApproved()).isFalse();
        assertThat(out.getOutlineConstraints()).isNull();
        assertThat(out.getDraftSections()).isNull();
        assertThat(out.getPolishedLatex()).isNull();
        assertThat(out.getPdfUrl()).isNull();
        assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.OUTLINE_PENDING);
        verify(repository).save(row);
    }

    // -------------------------------------------------------------------------------------------
    // deleteSessionForCurrentUser
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("deleteSessionForCurrentUser")
    class DeleteSession {

        @Test
        @DisplayName("deletes the owner's session")
        void deletesOwnerSession() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            serviceWithUserService().deleteSessionForCurrentUser("s1");

            verify(repository).delete(row);
        }

        @Test
        @DisplayName("a foreign session 404s and is never deleted")
        void foreignSessionNotDeleted() {
            when(userService.getCurrentUsername()).thenReturn("intruder");
            AiCreateSession row = existingSession("s1", "owner");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            assertThatThrownBy(() -> serviceWithUserService().deleteSessionForCurrentUser("s1"))
                    .isInstanceOf(ResponseStatusException.class);
            verify(repository, never()).delete(any());
        }
    }

    // -------------------------------------------------------------------------------------------
    // applyInternalUpdate — null-coalescing partial update, no ownership check
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("applyInternalUpdate")
    class ApplyInternalUpdate {

        @Test
        @DisplayName("applies every non-null field including outlineApproved=false")
        void appliesAllFields() {
            // No ownership check on the internal path: it uses getSession, not the per-user guard.
            AiCreateSession row = existingSession("s1", "owner");
            row.setOutlineApproved(true);
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out =
                    serviceWithoutUserService()
                            .applyInternalUpdate(
                                    "s1",
                                    "outline",
                                    "o.tex",
                                    Boolean.FALSE,
                                    "constraints",
                                    "draft",
                                    "latex",
                                    "https://pdf/url",
                                    "doc",
                                    "tmpl",
                                    AiCreateSessionStatus.POLISHED_READY);

            assertThat(out.getOutlineText()).isEqualTo("outline");
            assertThat(out.getOutlineFilename()).isEqualTo("o.tex");
            // Boolean.FALSE is non-null so it IS applied, flipping the prior true.
            assertThat(out.isOutlineApproved()).isFalse();
            assertThat(out.getOutlineConstraints()).isEqualTo("constraints");
            assertThat(out.getDraftSections()).isEqualTo("draft");
            assertThat(out.getPolishedLatex()).isEqualTo("latex");
            assertThat(out.getPdfUrl()).isEqualTo("https://pdf/url");
            assertThat(out.getDocType()).isEqualTo("doc");
            assertThat(out.getTemplateId()).isEqualTo("tmpl");
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.POLISHED_READY);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("all-null arguments leave the row untouched but still persist")
        void allNullLeavesUntouched() {
            AiCreateSession row = existingSession("s1", "owner");
            row.setOutlineText("keep-outline");
            row.setDocType("keep-doc");
            row.setStatus(AiCreateSessionStatus.DRAFT_READY);
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out =
                    serviceWithoutUserService()
                            .applyInternalUpdate(
                                    "s1", null, null, null, null, null, null, null, null, null,
                                    null);

            assertThat(out.getOutlineText()).isEqualTo("keep-outline");
            assertThat(out.getDocType()).isEqualTo("keep-doc");
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.DRAFT_READY);
            verify(repository).save(row);
        }

        @Test
        @DisplayName("internal path 404s when the session does not exist")
        void missingSession404() {
            when(repository.findById("ghost")).thenReturn(Optional.empty());

            assertThatThrownBy(
                            () ->
                                    serviceWithoutUserService()
                                            .applyInternalUpdate(
                                                    "ghost", "x", null, null, null, null, null,
                                                    null, null, null, null))
                    .isInstanceOf(ResponseStatusException.class);
        }

        @Test
        @DisplayName("internal path ignores ownership — updates a row owned by another user")
        void ignoresOwnership() {
            // applyInternalUpdate uses getSession (not getSessionForCurrentUser); current identity
            // is irrelevant. Confirm a non-matching identity still updates the row.
            authenticateJwt(SUPABASE_ID);
            AiCreateSession row = existingSession("s1", "someone-else");
            when(repository.findById("s1")).thenReturn(Optional.of(row));

            AiCreateSession out =
                    serviceWithoutUserService()
                            .applyInternalUpdate(
                                    "s1",
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    null,
                                    "https://done/pdf",
                                    null,
                                    null,
                                    AiCreateSessionStatus.SAVED);

            assertThat(out.getPdfUrl()).isEqualTo("https://done/pdf");
            assertThat(out.getStatus()).isEqualTo(AiCreateSessionStatus.SAVED);
        }
    }

    // -------------------------------------------------------------------------------------------
    // list* — delegation to the right repository finder for the resolved user
    // -------------------------------------------------------------------------------------------

    @Nested
    @DisplayName("listing methods")
    class Listing {

        @Test
        @DisplayName("no-arg list delegates to findByUserIdOrderByUpdatedAtDesc(userId)")
        void listNoArg() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            List<AiCreateSession> expected = List.of(existingSession("s1", "owner"));
            when(repository.findByUserIdOrderByUpdatedAtDesc("owner")).thenReturn(expected);

            assertThat(serviceWithUserService().listSessionsForCurrentUser()).isSameAs(expected);
        }

        @Test
        @DisplayName("paged list delegates with the pageable for the resolved user")
        void listPaged() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            Pageable pageable = PageRequest.of(0, 20);
            List<AiCreateSession> expected = List.of(existingSession("s1", "owner"));
            when(repository.findByUserIdOrderByUpdatedAtDesc("owner", pageable))
                    .thenReturn(expected);

            assertThat(serviceWithUserService().listSessionsForCurrentUser(pageable))
                    .isSameAs(expected);
        }

        @Test
        @DisplayName("includeDrafts=true returns the all-sessions finder")
        void listIncludeDraftsTrue() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            Pageable pageable = PageRequest.of(0, 10);
            List<AiCreateSession> expected = List.of(existingSession("s1", "owner"));
            when(repository.findByUserIdOrderByUpdatedAtDesc("owner", pageable))
                    .thenReturn(expected);

            assertThat(serviceWithUserService().listSessionsForCurrentUser(pageable, true))
                    .isSameAs(expected);
            verify(repository, never())
                    .findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(any(), any());
        }

        @Test
        @DisplayName("includeDrafts=false returns only sessions with a non-null pdfUrl")
        void listIncludeDraftsFalse() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            Pageable pageable = PageRequest.of(0, 10);
            List<AiCreateSession> expected = List.of(existingSession("s1", "owner"));
            when(repository.findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc("owner", pageable))
                    .thenReturn(expected);

            assertThat(serviceWithUserService().listSessionsForCurrentUser(pageable, false))
                    .isSameAs(expected);
            verify(repository, never())
                    .findByUserIdOrderByUpdatedAtDesc(eq("owner"), any(Pageable.class));
        }

        @Test
        @DisplayName("summary list includeDrafts=true uses the all-summaries projection finder")
        void summariesIncludeDraftsTrue() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            Pageable pageable = PageRequest.of(0, 10);
            List<AiCreateSessionRepository.AiCreateSessionSummaryProjection> expected = List.of();
            when(repository.findSummariesByUserIdOrderByUpdatedAtDesc("owner", pageable))
                    .thenReturn(expected);

            assertThat(serviceWithUserService().listSessionSummariesForCurrentUser(pageable, true))
                    .isSameAs(expected);
            verify(repository, never())
                    .findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(any(), any());
        }

        @Test
        @DisplayName("summary list includeDrafts=false uses the pdf-only summaries finder")
        void summariesIncludeDraftsFalse() {
            when(userService.getCurrentUsername()).thenReturn("owner");
            Pageable pageable = PageRequest.of(0, 10);
            List<AiCreateSessionRepository.AiCreateSessionSummaryProjection> expected = List.of();
            when(repository.findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
                            "owner", pageable))
                    .thenReturn(expected);

            assertThat(serviceWithUserService().listSessionSummariesForCurrentUser(pageable, false))
                    .isSameAs(expected);
            verify(repository, never()).findSummariesByUserIdOrderByUpdatedAtDesc(any(), any());
        }

        @Test
        @DisplayName("listing for an unidentified caller queries the default_user partition")
        void listForDefaultUser() {
            List<AiCreateSession> expected = List.of();
            when(repository.findByUserIdOrderByUpdatedAtDesc(DEFAULT_USER_ID)).thenReturn(expected);

            assertThat(serviceWithoutUserService().listSessionsForCurrentUser()).isSameAs(expected);
            ArgumentCaptor<String> userIdCaptor = ArgumentCaptor.forClass(String.class);
            verify(repository).findByUserIdOrderByUpdatedAtDesc(userIdCaptor.capture());
            assertThat(userIdCaptor.getValue()).isEqualTo(DEFAULT_USER_ID);
        }
    }
}

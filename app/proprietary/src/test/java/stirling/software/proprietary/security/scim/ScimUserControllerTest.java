package stirling.software.proprietary.security.scim;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.UserService;

class ScimUserControllerTest {

    private final UserService userService = mock(UserService.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ApplicationProperties.Security security = new ApplicationProperties.Security();
    private ScimUserController controller;
    private User alice;

    @BeforeEach
    void setUp() {
        controller = new ScimUserController(userService, userRepository, security);
        alice = user(7L, "alice@example.com", Role.USER);
        when(userRepository.findById(7L)).thenReturn(Optional.of(alice));
        when(userService.isUsernameValid(any())).thenReturn(true);
    }

    private static User user(long id, String name, Role role) {
        User user = new User();
        user.setId(id);
        user.setUsername(name);
        user.setEnabled(true);
        user.addAuthority(new Authority(role.getRoleId(), user));
        return user;
    }

    @Test
    void requiresEnterpriseLicence() {
        assertTrue(ScimUserController.class.isAnnotationPresent(EnterpriseEndpoint.class));
    }

    @Test
    void createsSsoUser() throws Exception {
        when(userService.saveUserCore(any())).thenReturn(alice);
        var response = controller.create(Map.of("userName", "alice@example.com", "active", true));
        assertEquals(201, response.getStatusCode().value());
        assertEquals("7", response.getBody().get("id"));
        ArgumentCaptor<SaveUserRequest> request = ArgumentCaptor.forClass(SaveUserRequest.class);
        verify(userService).saveUserCore(request.capture());
        assertEquals("alice@example.com", request.getValue().getUsername());
        assertEquals(null, request.getValue().getPassword());
    }

    @Test
    void duplicateUserNameIsConflict() {
        when(userService.usernameExistsIgnoreCase("alice@example.com")).thenReturn(true);
        var e =
                assertThrows(
                        ResponseStatusException.class,
                        () -> controller.create(Map.of("userName", "alice@example.com")));
        assertEquals(409, e.getStatusCode().value());
    }

    @Test
    void filterByUserNameReturnsMatchOrEmptyList() {
        when(userService.findByUsernameIgnoreCase("alice@example.com"))
                .thenReturn(Optional.of(alice));
        Map<String, Object> hit = controller.list("userName eq \"alice@example.com\"", 1, 100);
        assertEquals(1, hit.get("totalResults"));
        Map<String, Object> miss = controller.list("userName eq \"bob@example.com\"", 1, 100);
        assertEquals(0, miss.get("totalResults"));
        assertThrows(ResponseStatusException.class, () -> controller.list("title pr", 1, 100));
    }

    @Test
    void listHidesInternalApiUser() {
        when(userRepository.findAll())
                .thenReturn(
                        List.of(
                                alice,
                                user(1L, "STIRLING-PDF-BACKEND-API-USER", Role.INTERNAL_API_USER)));
        assertEquals(1, controller.list(null, 1, 100).get("totalResults"));
    }

    @Test
    void oktaStylePatchDeactivates() throws Exception {
        controller.patch(
                7L,
                Map.of(
                        "Operations",
                        List.of(Map.of("op", "replace", "value", Map.of("active", false)))));
        verify(userService).changeUserEnabled(alice, false);
        verify(userService).invalidateUserSessions("alice@example.com");
    }

    @Test
    void entraStylePatchDeactivates() throws Exception {
        controller.patch(
                7L,
                Map.of(
                        "Operations",
                        List.of(Map.of("op", "Replace", "path", "active", "value", "False"))));
        verify(userService).changeUserEnabled(alice, false);
    }

    @Test
    void renameLeavesActiveAlone() throws Exception {
        alice.setEnabled(false);
        controller.patch(
                7L,
                Map.of(
                        "Operations",
                        List.of(
                                Map.of(
                                        "op",
                                        "replace",
                                        "path",
                                        "userName",
                                        "value",
                                        "a@example.com"))));
        verify(userService).changeUsername(alice, "a@example.com");
        verify(userService, never()).changeUserEnabled(any(), any());
    }

    @Test
    void deleteDeactivatesByDefault() throws Exception {
        assertEquals(204, controller.delete(7L).getStatusCode().value());
        verify(userService).changeUserEnabled(alice, false);
        verify(userService, never()).deleteUser(any());
    }

    @Test
    void deleteErasesWhenToggledOn() throws Exception {
        security.setScimDeleteRemovesUser(true);
        assertEquals(204, controller.delete(7L).getStatusCode().value());
        verify(userService).deleteUser("alice@example.com");
    }

    @Test
    void adminsCannotBeModified() throws Exception {
        when(userRepository.findById(2L)).thenReturn(Optional.of(user(2L, "admin", Role.ADMIN)));
        Map<String, Object> rename = Map.of("userName", "attacker@example.com");
        for (var call :
                List.<org.junit.jupiter.api.function.Executable>of(
                        () -> controller.delete(2L),
                        () -> controller.replace(2L, rename),
                        () ->
                                controller.patch(
                                        2L,
                                        Map.of("Operations", List.of(Map.of("value", rename)))))) {
            var e = assertThrows(ResponseStatusException.class, call);
            assertEquals(403, e.getStatusCode().value());
        }
        verify(userService, never()).changeUsername(any(), any());
    }

    @Test
    void internalUserIsNotFound() {
        when(userRepository.findById(1L))
                .thenReturn(Optional.of(user(1L, "internal", Role.INTERNAL_API_USER)));
        var e = assertThrows(ResponseStatusException.class, () -> controller.delete(1L));
        assertEquals(404, e.getStatusCode().value());
    }
}

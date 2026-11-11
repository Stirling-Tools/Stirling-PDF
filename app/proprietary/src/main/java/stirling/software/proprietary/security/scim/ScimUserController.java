package stirling.software.proprietary.security.scim;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.config.EnterpriseEndpoint;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.AuthenticationType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.exception.UserLimitExceededException;
import stirling.software.proprietary.security.service.SaveUserRequest;
import stirling.software.proprietary.security.service.UserService;

/** SCIM 2.0 user provisioning (RFC 7644) for identity providers such as Okta and Entra ID. */
@Hidden
@EnterpriseEndpoint
@RestController
@RequestMapping("/api/v1/scim/v2/Users")
@PreAuthorize("hasAuthority('" + ScimTokenFilter.AUTHORITY + "')")
@Slf4j
@RequiredArgsConstructor
public class ScimUserController {

    private static final String USER = "urn:ietf:params:scim:schemas:core:2.0:User";
    private static final String LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
    private static final String ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";
    private static final Pattern FILTER =
            Pattern.compile("userName eq \"([^\"]*)\"", Pattern.CASE_INSENSITIVE);

    private final UserService userService;
    private final UserRepository userRepository;
    private final ApplicationProperties.Security security;

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(required = false) String filter,
            @RequestParam(defaultValue = "1") int startIndex,
            @RequestParam(defaultValue = "100") int count) {
        List<User> users;
        if (filter == null) {
            users = userRepository.findAll();
        } else {
            Matcher match = FILTER.matcher(filter.trim());
            if (!match.matches()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported filter");
            }
            users = userService.findByUsernameIgnoreCase(match.group(1)).stream().toList();
        }
        List<User> visible =
                users.stream().filter(u -> !hasRole(u, Role.INTERNAL_API_USER)).toList();
        List<Map<String, Object>> page =
                visible.stream()
                        .skip(Math.max(startIndex, 1) - 1L)
                        .limit(Math.max(count, 0))
                        .map(this::toScim)
                        .toList();
        return Map.of(
                "schemas", List.of(LIST),
                "totalResults", visible.size(),
                "startIndex", Math.max(startIndex, 1),
                "itemsPerPage", page.size(),
                "Resources", page);
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable long id) {
        return toScim(find(id));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(@RequestBody Map<String, Object> body)
            throws Exception {
        String userName = String.valueOf(body.get("userName"));
        if (userService.usernameExistsIgnoreCase(userName)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "userName already exists");
        }
        if (!userService.isUsernameValid(userName)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid userName");
        }
        User user =
                userService.saveUserCore(
                        SaveUserRequest.builder()
                                .username(userName)
                                .authenticationType(
                                        Boolean.TRUE.equals(security.getSaml2().getEnabled())
                                                ? AuthenticationType.SAML2
                                                : AuthenticationType.OAUTH2)
                                .enabled(
                                        !"false"
                                                .equalsIgnoreCase(
                                                        String.valueOf(body.get("active"))))
                                .build());
        log.info("SCIM created user {}", userName);
        return ResponseEntity.status(HttpStatus.CREATED).body(toScim(user));
    }

    @PutMapping("/{id}")
    public Map<String, Object> replace(@PathVariable long id, @RequestBody Map<String, Object> body)
            throws Exception {
        return toScim(apply(findModifiable(id), body));
    }

    @PatchMapping("/{id}")
    public Map<String, Object> patch(@PathVariable long id, @RequestBody Map<String, Object> body)
            throws Exception {
        User user = findModifiable(id);
        for (Object item : (List<?>) body.getOrDefault("Operations", List.of())) {
            Map<?, ?> op = (Map<?, ?>) item;
            Object path = op.get("path");
            // Okta omits the path and sends an attribute map; Entra names the attribute in path.
            user =
                    apply(
                            user,
                            path == null
                                    ? (Map<?, ?>) op.get("value")
                                    : Collections.singletonMap(path, op.get("value")));
        }
        return toScim(user);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) throws Exception {
        User user = findModifiable(id);
        if (security.isScimDeleteRemovesUser()) {
            userService.deleteUser(user.getUsername());
            log.info("SCIM deleted user {}", user.getUsername());
        } else {
            apply(user, Map.of("active", false));
        }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode())
                .body(
                        Map.of(
                                "schemas", List.of(ERROR),
                                "status", String.valueOf(e.getStatusCode().value()),
                                "detail", String.valueOf(e.getReason())));
    }

    @ExceptionHandler({UserLimitExceededException.class, IllegalArgumentException.class})
    public ResponseEntity<Map<String, Object>> rejected(RuntimeException e) {
        HttpStatus status =
                e instanceof UserLimitExceededException
                        ? HttpStatus.FORBIDDEN
                        : HttpStatus.BAD_REQUEST;
        return error(new ResponseStatusException(status, e.getMessage()));
    }

    private User apply(User user, Map<?, ?> attrs) throws Exception {
        if (attrs == null) return user;
        Object userName = attrs.get("userName");
        if (userName != null && !userName.toString().equals(user.getUsername())) {
            if (userService.isUsernameTakenByOtherUser(userName.toString(), user.getId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "userName already exists");
            }
            log.info("SCIM renamed user {} to {}", user.getUsername(), userName);
            userService.changeUsername(user, userName.toString());
        }
        Object active = attrs.get("active");
        boolean enable =
                active == null ? user.isEnabled() : Boolean.parseBoolean(active.toString());
        if (enable != user.isEnabled()) {
            userService.changeUserEnabled(user, enable);
            if (!enable) userService.invalidateUserSessions(user.getUsername());
            log.info("SCIM set user {} active={}", user.getUsername(), enable);
        }
        return user;
    }

    private User find(long id) {
        return userRepository
                .findById(id)
                .filter(u -> !hasRole(u, Role.INTERNAL_API_USER))
                .orElseThrow(
                        () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));
    }

    // A leaked SCIM token must not be able to take over or lock out admin accounts.
    private User findModifiable(long id) {
        User user = find(id);
        if (hasRole(user, Role.ADMIN)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "SCIM cannot modify admins");
        }
        return user;
    }

    private static boolean hasRole(User user, Role role) {
        return user.getAuthorities().stream()
                .anyMatch(a -> role.getRoleId().equals(a.getAuthority()));
    }

    private Map<String, Object> toScim(User user) {
        return Map.of(
                "schemas", List.of(USER),
                "id", String.valueOf(user.getId()),
                "userName", user.getUsername(),
                "active", user.isEnabled(),
                "meta", Map.of("resourceType", "User"));
    }
}

package stirling.software.proprietary.security.controller.api;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.api.UserApi;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.audit.AuditLevel;
import stirling.software.proprietary.audit.Audited;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.ProfilePictureService;
import stirling.software.proprietary.security.service.ProfilePictureService.InvalidProfilePictureException;
import stirling.software.proprietary.security.service.ProfilePictureService.StoredImage;
import stirling.software.proprietary.security.service.UserService;

/**
 * Per-user avatars, all routes authenticated. The batch endpoint drops ids the caller may not see
 * ({@link ProfilePictureService} owns that rule), so it can't be used to probe for accounts.
 */
@UserApi
@Slf4j
@RequiredArgsConstructor
public class ProfilePictureController {

    /** Guard on the batch endpoint; a roster page never needs more than this. */
    private static final int MAX_BATCH_IDS = 500;

    private final ProfilePictureService profilePictureService;
    private final UserService userService;

    @Operation(summary = "Upload the signed-in user's profile picture")
    @PreAuthorize("isAuthenticated() and !hasAuthority('ROLE_DEMO_USER')")
    @PostMapping(value = "/profile-picture", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public ResponseEntity<Map<String, Object>> upload(
            Principal principal, @RequestParam("file") MultipartFile file) {
        Optional<User> user = currentUser(principal);
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            profilePictureService.store(user.get(), file);
            return ResponseEntity.ok(Map.of("hasProfilePicture", true));
        } catch (InvalidProfilePictureException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "invalidImage", "message", e.getMessage()));
        }
    }

    @Operation(summary = "Remove the signed-in user's profile picture")
    @PreAuthorize("isAuthenticated() and !hasAuthority('ROLE_DEMO_USER')")
    @DeleteMapping("/profile-picture")
    @Audited(type = AuditEventType.USER_PROFILE_UPDATE, level = AuditLevel.BASIC)
    public ResponseEntity<Map<String, Object>> remove(Principal principal) {
        Optional<User> user = currentUser(principal);
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        profilePictureService.delete(user.get().getId());
        return ResponseEntity.ok(Map.of("hasProfilePicture", false));
    }

    @Operation(summary = "Get the signed-in user's profile picture")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/profile-picture")
    public ResponseEntity<byte[]> ownPicture(Principal principal) {
        Optional<User> user = currentUser(principal);
        if (user.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return imageResponse(user.get().getId());
    }

    /**
     * Roster thumbnails as data URLs, keyed by user id. Data URLs rather than image URLs because
     * the app authenticates with a bearer token, which an {@code <img src>} request would not
     * carry.
     */
    @Operation(summary = "Batch-fetch profile picture thumbnails as data URLs")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/profile-pictures")
    public ResponseEntity<Map<String, String>> thumbnails(
            Principal principal, @RequestParam("userIds") List<Long> userIds) {
        Optional<User> viewer = currentUser(principal);
        if (viewer.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        if (userIds == null || userIds.isEmpty()) {
            return ResponseEntity.ok(Map.of());
        }
        List<Long> requested = userIds.stream().filter(Objects::nonNull).distinct().toList();
        if (requested.size() > MAX_BATCH_IDS) {
            log.debug(
                    "Profile picture batch asked for {} ids; serving the first {}",
                    requested.size(),
                    MAX_BATCH_IDS);
            requested = requested.subList(0, MAX_BATCH_IDS);
        }
        Set<Long> visible = profilePictureService.visibleUserIds(viewer.get(), requested);
        Map<String, String> body = new LinkedHashMap<>();
        profilePictureService
                .thumbnailDataUrls(visible)
                .forEach((id, dataUrl) -> body.put(String.valueOf(id), dataUrl));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    private ResponseEntity<byte[]> imageResponse(Long userId) {
        Optional<StoredImage> stored = profilePictureService.findImage(userId);
        if (stored.isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        StoredImage image = stored.get();
        return ResponseEntity.ok()
                // store() re-encodes every upload, so the stored type is always PNG; parsing it
                // back would only add a 500 path for a row written by anything else.
                .contentType(MediaType.IMAGE_PNG)
                // Same URI for every user, so a shared browser must not reuse it. The client keeps
                // the blob for the session anyway, so there is nothing to gain from caching here.
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Disposition", "inline; filename=\"avatar.png\"")
                .body(image.data());
    }

    private Optional<User> currentUser(Principal principal) {
        if (principal == null || principal.getName() == null) {
            return Optional.empty();
        }
        return userService.findByUsernameIgnoreCase(principal.getName());
    }
}

package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.CreditService;
import stirling.software.proprietary.service.PolarService;

/**
 * Handles user account endpoints: plan status, trial status, profile pictures, and account
 * deletion. These endpoints were previously served by Supabase edge functions / storage / RPC.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/user")
public class UserAccountController {

    private final UserService userService;
    private final CreditService creditService;
    private final PolarService polarService;
    private final Path profilePictureDir;

    public UserAccountController(
            UserService userService,
            CreditService creditService,
            PolarService polarService,
            @Value("${stirling.profile-pictures.dir:#{null}}") String profilePicDir) {
        this.userService = userService;
        this.creditService = creditService;
        this.polarService = polarService;

        if (profilePicDir != null && !profilePicDir.isBlank()) {
            this.profilePictureDir = Path.of(profilePicDir);
        } else {
            this.profilePictureDir =
                    Path.of(System.getProperty("user.home"), ".stirling", "profile-pictures");
        }

        try {
            Files.createDirectories(this.profilePictureDir);
        } catch (IOException e) {
            log.warn("Could not create profile picture directory: {}", this.profilePictureDir, e);
        }
    }

    // ---- Plan Status ----

    /** Returns the user's current plan status. Replaces {@code supabase.rpc('is_pro')}. */
    @GetMapping("/plan-status")
    public ResponseEntity<Map<String, Object>> getPlanStatus() {
        User user = resolveCurrentUser();
        if (user == null) return ResponseEntity.status(401).build();

        String planTier = user.getPlanTier() != null ? user.getPlanTier() : "free";
        boolean isPro = "pro".equalsIgnoreCase(planTier) || "enterprise".equalsIgnoreCase(planTier);

        // Also check role-based pro status
        if (!isPro) {
            isPro = hasProRole(user);
        }

        return ResponseEntity.ok(Map.of("isPro", isPro, "planTier", planTier));
    }

    // ---- Trial Status ----

    /** Returns the user's trial status. Replaces {@code supabase.from('billing_subscriptions')}. */
    @GetMapping("/trial-status")
    public ResponseEntity<Map<String, Object>> getTrialStatus() {
        User user = resolveCurrentUser();
        if (user == null) return ResponseEntity.status(401).build();

        // Check Polar subscription if customer ID is available
        String customerId = user.getSupabaseId(); // repurposed for Polar customer ID
        if (customerId != null && !customerId.isBlank()) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> subs = polarService.listSubscriptions(customerId);
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> items =
                        (List<Map<String, Object>>) subs.getOrDefault("items", List.of());

                for (Map<String, Object> sub : items) {
                    String status = (String) sub.get("status");
                    if ("trialing".equals(status)) {
                        String trialEnd = (String) sub.get("trial_end");
                        long daysRemaining = 0;
                        if (trialEnd != null) {
                            long trialEndMs = java.time.Instant.parse(trialEnd).toEpochMilli();
                            daysRemaining =
                                    Math.max(
                                            0,
                                            (trialEndMs - System.currentTimeMillis())
                                                    / (1000 * 60 * 60 * 24));
                        }
                        return ResponseEntity.ok(
                                Map.of(
                                        "isTrialing",
                                        true,
                                        "trialEnd",
                                        trialEnd != null ? trialEnd : "",
                                        "daysRemaining",
                                        daysRemaining,
                                        "hasPaymentMethod",
                                        false,
                                        "hasScheduledSub",
                                        false,
                                        "status",
                                        status));
                    }
                }
            } catch (Exception e) {
                log.debug("Could not fetch Polar subscriptions for trial status", e);
            }
        }

        // No trial
        return ResponseEntity.ok(
                Map.of(
                        "isTrialing",
                        false,
                        "trialEnd",
                        "",
                        "daysRemaining",
                        0,
                        "hasPaymentMethod",
                        false,
                        "hasScheduledSub",
                        false,
                        "status",
                        "none"));
    }

    // ---- Profile Picture ----

    /** Upload a profile picture. */
    @PostMapping("/profile-picture")
    public ResponseEntity<Map<String, String>> uploadProfilePicture(
            @org.springframework.web.bind.annotation.RequestParam("file") MultipartFile file) {
        User user = resolveCurrentUser();
        if (user == null) return ResponseEntity.status(401).build();

        try {
            Path userDir = profilePictureDir.resolve(String.valueOf(user.getId()));
            Files.createDirectories(userDir);
            Path dest = userDir.resolve("avatar.png");
            Files.copy(file.getInputStream(), dest, StandardCopyOption.REPLACE_EXISTING);
            return ResponseEntity.ok(Map.of("status", "uploaded"));
        } catch (IOException e) {
            log.error("Failed to save profile picture for user {}", user.getId(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Failed to save profile picture"));
        }
    }

    /** Download the user's profile picture. */
    @GetMapping("/profile-picture")
    public ResponseEntity<Resource> getProfilePicture() {
        User user = resolveCurrentUser();
        if (user == null) return ResponseEntity.status(401).build();

        Path avatarPath =
                profilePictureDir.resolve(String.valueOf(user.getId())).resolve("avatar.png");
        if (!Files.exists(avatarPath)) {
            return ResponseEntity.notFound().build();
        }

        Resource resource = new FileSystemResource(avatarPath);
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                .body(resource);
    }

    // ---- Account Deletion ----

    /**
     * Delete the current user's account. Replaces {@code supabase.functions.invoke('delete-user')}.
     */
    @DeleteMapping("/account")
    public ResponseEntity<Map<String, Object>> deleteAccount(
            @RequestBody(required = false) Map<String, Object> body) {
        User user = resolveCurrentUser();
        if (user == null) return ResponseEntity.status(401).build();

        try {
            // Delete profile picture
            Path avatarPath =
                    profilePictureDir.resolve(String.valueOf(user.getId())).resolve("avatar.png");
            Files.deleteIfExists(avatarPath);

            // Delete user record (cascades to authorities, settings, credits)
            userService.deleteUser(user.getUsername());

            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            log.error("Failed to delete account for user {}", user.getUsername(), e);
            return ResponseEntity.internalServerError()
                    .body(Map.of("success", false, "error", "Failed to delete account"));
        }
    }

    // ---- Helpers ----

    private boolean hasProRole(User user) {
        for (GrantedAuthority auth : user.getAuthorities()) {
            try {
                Role role = Role.fromString(auth.getAuthority());
                if (role == Role.PRO_USER
                        || role == Role.ENTERPRISE_USER
                        || role == Role.ADMIN
                        || role == Role.USER) {
                    return true;
                }
            } catch (IllegalArgumentException ignored) {
            }
        }
        return false;
    }

    private User resolveCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return null;
        Object principal = auth.getPrincipal();
        String username =
                principal instanceof UserDetails ud ? ud.getUsername() : principal.toString();
        return userService.findByUsernameIgnoreCase(username).orElse(null);
    }
}

package stirling.software.proprietary.security.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.LocalAuthenticationServiceInterface;
import stirling.software.common.service.LocalAuthenticationServiceInterface.AuthenticationResult;
import stirling.software.proprietary.security.service.JwtServiceInterface;
import stirling.software.proprietary.security.service.PasswordPolicyService;

/**
 * REST controller for local database authentication.
 */
@RestController
@RequestMapping("/api/v1/auth/local")
@Tag(name = "Local Authentication", description = "Local database authentication endpoints")
@RequiredArgsConstructor
@Slf4j
public class LocalAuthController {

    private final LocalAuthenticationServiceInterface authenticationService;
    private final JwtServiceInterface jwtService;
    private final PasswordPolicyService passwordPolicyService;

    /**
     * Login with username and password.
     */
    @PostMapping("/login")
    @Operation(summary = "Login with username and password")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletResponse response) {

        log.info("Login attempt for user: {}", request.getUsername());

        AuthenticationResult result = authenticationService.authenticate(
            request.getUsername(),
            request.getPassword()
        );

        if (!result.isSuccess()) {
            log.warn("Login failed for user: {}", request.getUsername());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new LoginResponse(false, null, null, result.getErrorMessage(), false));
        }

        // Add JWT token to response as cookie
        jwtService.addToken(response, result.getToken());

        log.info("Login successful for user: {}", request.getUsername());

        return ResponseEntity.ok(new LoginResponse(
            true,
            result.getToken(),
            result.getUsername(),
            null,
            result.isPasswordChangeRequired()
        ));
    }

    /**
     * Logout current user.
     */
    @PostMapping("/logout")
    @Operation(summary = "Logout current user")
    public ResponseEntity<MessageResponse> logout(
            HttpServletRequest request,
            HttpServletResponse response) {

        String token = jwtService.extractToken(request);

        if (token != null) {
            authenticationService.logout(token);
            jwtService.clearToken(response);
        }

        log.info("User logged out successfully");

        return ResponseEntity.ok(new MessageResponse("Logged out successfully"));
    }

    /**
     * Change password for authenticated user.
     */
    @PostMapping("/change-password")
    @Operation(summary = "Change password for authenticated user")
    public ResponseEntity<MessageResponse> changePassword(
            @Valid @RequestBody ChangePasswordRequest request,
            HttpServletRequest httpRequest) {

        String token = jwtService.extractToken(httpRequest);
        if (token == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new MessageResponse("Not authenticated"));
        }

        String username = jwtService.extractUsername(token);

        // Validate new password
        Map<String, String> errors = authenticationService.getPasswordValidationErrors(request.getNewPassword());
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest()
                .body(new MessageResponse("Password does not meet requirements: " + errors.toString()));
        }

        boolean success = authenticationService.changePassword(
            username,
            request.getOldPassword(),
            request.getNewPassword()
        );

        if (!success) {
            return ResponseEntity.badRequest()
                .body(new MessageResponse("Failed to change password. Please check your current password."));
        }

        log.info("Password changed successfully for user: {}", username);

        return ResponseEntity.ok(new MessageResponse("Password changed successfully"));
    }

    /**
     * Initiate password reset process.
     */
    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset")
    public ResponseEntity<MessageResponse> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {

        log.info("Password reset requested for: {}", request.getEmailOrUsername());

        // Always return success to prevent user enumeration
        authenticationService.initiatePasswordReset(request.getEmailOrUsername());

        return ResponseEntity.ok(new MessageResponse(
            "If an account exists with that username/email, a password reset link has been sent."
        ));
    }

    /**
     * Reset password using token.
     */
    @PostMapping("/reset-password")
    @Operation(summary = "Reset password with token")
    public ResponseEntity<MessageResponse> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {

        // Validate new password
        Map<String, String> errors = authenticationService.getPasswordValidationErrors(request.getNewPassword());
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest()
                .body(new MessageResponse("Password does not meet requirements: " + errors.toString()));
        }

        boolean success = authenticationService.resetPassword(
            request.getToken(),
            request.getNewPassword()
        );

        if (!success) {
            return ResponseEntity.badRequest()
                .body(new MessageResponse("Invalid or expired reset token"));
        }

        log.info("Password reset successful");

        return ResponseEntity.ok(new MessageResponse("Password reset successfully"));
    }

    /**
     * Validate password against policy.
     */
    @PostMapping("/validate-password")
    @Operation(summary = "Validate password against policy")
    public ResponseEntity<PasswordValidationResponse> validatePassword(
            @Valid @RequestBody ValidatePasswordRequest request) {

        Map<String, String> errors = authenticationService.getPasswordValidationErrors(request.getPassword());
        boolean valid = errors.isEmpty();

        return ResponseEntity.ok(new PasswordValidationResponse(
            valid,
            errors,
            passwordPolicyService.getPolicyDescription()
        ));
    }

    /**
     * Get password policy requirements.
     */
    @GetMapping("/password-policy")
    @Operation(summary = "Get password policy requirements")
    public ResponseEntity<PasswordPolicyResponse> getPasswordPolicy() {
        return ResponseEntity.ok(new PasswordPolicyResponse(
            passwordPolicyService.getPolicy(),
            passwordPolicyService.getPolicyDescription()
        ));
    }

    // Request/Response DTOs

    @Data
    public static class LoginRequest {
        @NotBlank(message = "Username is required")
        private String username;

        @NotBlank(message = "Password is required")
        private String password;
    }

    @Data
    public static class LoginResponse {
        private final boolean success;
        private final String token;
        private final String username;
        private final String error;
        private final boolean passwordChangeRequired;
    }

    @Data
    public static class ChangePasswordRequest {
        @NotBlank(message = "Old password is required")
        private String oldPassword;

        @NotBlank(message = "New password is required")
        private String newPassword;
    }

    @Data
    public static class ForgotPasswordRequest {
        @NotBlank(message = "Username or email is required")
        private String emailOrUsername;
    }

    @Data
    public static class ResetPasswordRequest {
        @NotBlank(message = "Reset token is required")
        private String token;

        @NotBlank(message = "New password is required")
        private String newPassword;
    }

    @Data
    public static class ValidatePasswordRequest {
        @NotBlank(message = "Password is required")
        private String password;
    }

    @Data
    public static class MessageResponse {
        private final String message;
    }

    @Data
    public static class PasswordValidationResponse {
        private final boolean valid;
        private final Map<String, String> errors;
        private final String policyDescription;
    }

    @Data
    public static class PasswordPolicyResponse {
        private final Object policy;
        private final String description;
    }
}
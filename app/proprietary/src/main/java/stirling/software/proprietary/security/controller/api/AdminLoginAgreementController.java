package stirling.software.proprietary.security.controller.api;

import java.io.IOException;
import java.util.Map;
import java.util.Set;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.LoginAgreementService;

/**
 * Admin editing of the per-language login agreement markdown files
 * (customFiles/disclaimer/&lt;locale&gt;.md). The enable/visibility flags are managed through the
 * normal admin settings endpoints; only the live-edited text is handled here.
 */
@RestController
@RequestMapping("/api/v1/admin/login-agreement")
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
@Tag(name = "Admin Settings", description = "Login agreement text management")
@Hidden
@Slf4j
public class AdminLoginAgreementController {

    private final LoginAgreementService loginAgreementService;

    @GetMapping
    @Operation(summary = "List locales that currently have login agreement text")
    public Set<String> listLocales() {
        return loginAgreementService.listLocalesWithContent();
    }

    @GetMapping("/{locale}")
    @Operation(summary = "Read the login agreement markdown for a locale")
    public ResponseEntity<Map<String, String>> read(@PathVariable String locale) {
        String content = loginAgreementService.readRawForLocale(locale);
        if (content == null) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(Map.of("locale", locale, "content", content));
    }

    @PutMapping("/{locale}")
    @Operation(summary = "Write the login agreement markdown for a locale (blank clears it)")
    public ResponseEntity<Void> write(
            @PathVariable String locale, @RequestBody DisclaimerContentRequest request) {
        try {
            loginAgreementService.writeForLocale(
                    locale, request == null ? null : request.content());
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            log.error("Failed writing login agreement for locale {}", locale, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    public record DisclaimerContentRequest(String content) {}
}

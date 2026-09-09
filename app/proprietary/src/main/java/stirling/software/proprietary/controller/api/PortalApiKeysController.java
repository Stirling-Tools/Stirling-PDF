package stirling.software.proprietary.controller.api;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.ProprietaryUiDataApi;
import stirling.software.proprietary.model.api.apikey.CreateApiKeyRequest;
import stirling.software.proprietary.model.api.apikey.CreatedApiKeyDto;
import stirling.software.proprietary.model.api.apikey.PortalApiKeysResponse;
import stirling.software.proprietary.security.service.ApiKeyManagementService;

/**
 * Real backing for the portal Infrastructure → API Keys tab: list/create/revoke named, personal API
 * keys. Replaces the former portal-only mock endpoint. Not gated behind an Enterprise license - API
 * keys are a core auth feature available on every self-hosted instance.
 */
@ProprietaryUiDataApi
@RequiredArgsConstructor
public class PortalApiKeysController {

    private final ApiKeyManagementService apiKeyManagementService;

    // tier accepted for endpoint symmetry with the other infra tabs; ignored here.
    @GetMapping("/infrastructure/api-keys")
    @Operation(summary = "List API keys", description = "The caller's personal API keys.")
    public ResponseEntity<PortalApiKeysResponse> list(
            @RequestParam(value = "tier", required = false) String tier) {
        return ResponseEntity.ok(apiKeyManagementService.listVisibleKeys());
    }

    @PostMapping("/infrastructure/api-keys")
    @Operation(
            summary = "Create an API key",
            description = "Mints a personal key and returns its one-time secret.")
    public ResponseEntity<CreatedApiKeyDto> create(@RequestBody CreateApiKeyRequest request) {
        return ResponseEntity.ok(apiKeyManagementService.createKey(request));
    }

    @DeleteMapping("/infrastructure/api-keys/{id}")
    @Operation(summary = "Revoke an API key", description = "Disables a key the caller owns.")
    public ResponseEntity<Void> revoke(@PathVariable("id") Long id) {
        apiKeyManagementService.revokeKey(id);
        return ResponseEntity.noContent().build();
    }
}

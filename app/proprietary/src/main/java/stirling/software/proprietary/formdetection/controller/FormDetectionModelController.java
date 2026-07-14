package stirling.software.proprietary.formdetection.controller;

import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.model.ModelStatusResponse;
import stirling.software.proprietary.formdetection.service.FormDetectionModelManager;

/**
 * Admin-managed lifecycle for the Auto Form Detection model. Lives under the never-gated {@code
 * form-detection-model} endpoint key so install/status stay reachable while the feature itself (the
 * {@code form-detection} detect endpoint) is disabled until a model is ready.
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/ai/form-detection-model")
@RequiredArgsConstructor
@Tag(name = "Auto Form Detection")
public class FormDetectionModelController {

    private final FormDetectionModelManager manager;

    @GetMapping("/status")
    @Operation(summary = "Auto Form Detection model status, progress and catalog")
    public ResponseEntity<ModelStatusResponse> status() {
        return ResponseEntity.ok(manager.status());
    }

    @PostMapping("/install")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Install (download + checksum-verify) a catalog model")
    public ResponseEntity<ModelStatusResponse> install(@RequestBody InstallRequest request) {
        if (request == null || StringUtils.isBlank(request.getModelId())) {
            ModelStatusResponse s = manager.status();
            s.setError("modelId is required");
            return ResponseEntity.badRequest().body(s);
        }
        try {
            manager.startInstall(request.getModelId());
            return ResponseEntity.accepted().body(manager.status());
        } catch (IllegalStateException e) {
            ModelStatusResponse s = manager.status();
            s.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(s);
        } catch (IllegalArgumentException e) {
            ModelStatusResponse s = manager.status();
            s.setError(e.getMessage());
            return ResponseEntity.badRequest().body(s);
        }
    }

    @DeleteMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Uninstall a model")
    public ResponseEntity<ModelStatusResponse> delete(
            @RequestParam(name = "modelId", required = false) String modelId) {
        try {
            manager.deleteModel(modelId);
            return ResponseEntity.ok(manager.status());
        } catch (IllegalStateException e) {
            ModelStatusResponse s = manager.status();
            s.setError(e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(s);
        }
    }

    @PostMapping("/config")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(
            summary = "Update the feature on/off switch and execution mode (auto/browser/server)")
    public ResponseEntity<ModelStatusResponse> config(@RequestBody ConfigRequest request) {
        if (request == null) {
            return ResponseEntity.badRequest().body(manager.status());
        }
        try {
            if (request.getEnabled() != null) {
                manager.setEnabled(request.getEnabled());
            }
            if (StringUtils.isNotBlank(request.getExecutionMode())) {
                manager.setExecutionMode(request.getExecutionMode());
            }
            return ResponseEntity.ok(manager.status());
        } catch (IllegalArgumentException e) {
            ModelStatusResponse s = manager.status();
            s.setError(e.getMessage());
            return ResponseEntity.badRequest().body(s);
        }
    }

    @Data
    public static class ConfigRequest {
        /** Master on/off; {@code null} leaves it unchanged. */
        private Boolean enabled;

        /** auto|browser|server; blank/null leaves it unchanged. */
        private String executionMode;
    }

    @Data
    public static class InstallRequest {
        private String modelId;
    }
}

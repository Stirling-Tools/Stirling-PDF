package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import io.swagger.v3.oas.annotations.Operation;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ocr.OcrManifest;
import stirling.software.SPDF.service.OcrRuntimeService;
import stirling.software.common.annotations.api.UiDataApi;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.UserServiceInterface;

/**
 * Lets a user install the OCR engine and pick language models from inside the application.
 *
 * <p>Lives under {@code /api/v1/ui-data} rather than {@code /api/v1/misc}, alongside the existing
 * tessdata endpoints. That namespace is where UI-supporting data belongs, and it also keeps these
 * out of the generated tool model table - {@code /api/v1/misc/} is in the generator's allow list,
 * so a POST there would be published as a pipeline step, which none of this is.
 *
 * <p>The status is readable by anyone. Installing the engine and adding or removing languages
 * change what every user's OCR runs on, so with login on they are for admins only; the check is
 * made here, the way {@code ConfigController} decides who is an admin, because core carries no
 * method security of its own. With login off, which is how the desktop app starts the backend, they
 * stay open: an admin-only endpoint would be unreachable exactly where this feature is needed.
 */
@UiDataApi
@Slf4j
public class OcrRuntimeController {

    private final OcrRuntimeService ocrRuntimeService;
    private final ApplicationProperties applicationProperties;
    private final UserServiceInterface userService;

    public OcrRuntimeController(
            OcrRuntimeService ocrRuntimeService,
            ApplicationProperties applicationProperties,
            @Autowired(required = false) UserServiceInterface userService) {
        this.ocrRuntimeService = ocrRuntimeService;
        this.applicationProperties = applicationProperties;
        this.userService = userService;
    }

    /**
     * Whether the caller may change the shared runtime. Login counts as on only when the user
     * service is present too, as in {@code ConfigController}; without it there is no one to ask.
     */
    private boolean mayChangeRuntime() {
        if (!applicationProperties.getSecurity().isEnableLogin() || userService == null) {
            return true;
        }
        try {
            return userService.isCurrentUserAdmin();
        } catch (RuntimeException e) {
            log.debug("Could not tell whether the caller is an admin", e);
            return false;
        }
    }

    private static ResponseEntity<Map<String, Object>> adminsOnly() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Only an administrator can change the OCR installation"));
    }

    @Data
    public static class OcrLanguagesRequest {
        private List<String> install;
        private List<String> remove;
    }

    @GetMapping("/ocr/runtime")
    @Operation(
            summary = "Report what OCR is installed and what can be installed",
            description =
                    "Returns whether the OCR engine is present, which language models are on disk,"
                            + " and the catalogue of installable components with their download"
                            + " sizes. The catalogue address is configurable so it can point at an"
                            + " internal mirror.")
    public ResponseEntity<Map<String, Object>> status() {
        Map<String, Object> body = new TreeMap<>();
        body.put("engineInstalled", ocrRuntimeService.isEngineInstalled());
        body.put("platform", ocrRuntimeService.platformKey());
        body.put("installedLanguages", ocrRuntimeService.installedLanguages());
        body.put("progress", ocrRuntimeService.currentProgress());
        // Present when the Windows installer was asked for OCR but could not
        // fetch it - a proxy, a firewall, a laptop that lost its wifi. The
        // installer finishes anyway rather than rolling back, so this is how the
        // user hears about it at all.
        ocrRuntimeService.pendingRequest().ifPresent(request -> body.put("pending", request));

        try {
            OcrManifest manifest = ocrRuntimeService.loadManifest();
            body.put("engineAvailable", manifest.engine().get(ocrRuntimeService.platformKey()));
            body.put("availableLanguages", manifest.languages());
            body.put("availableExtras", manifest.extras());
            body.put("catalogueReachable", true);
        } catch (IOException e) {
            // A missing catalogue is not an error worth failing the whole panel over: what is
            // already installed still works, and the UI can say so instead of showing nothing.
            log.debug("OCR catalogue unavailable", e);
            body.put("catalogueReachable", false);
            body.put("catalogueError", e.getMessage());
        }
        return ResponseEntity.ok(body);
    }

    @PostMapping("/ocr/runtime/install")
    @Operation(
            summary = "Install the OCR engine for this platform",
            description =
                    "Downloads the engine listed in the catalogue, verifies its SHA-256 and unpacks"
                            + " it next to the application. Language models already installed are"
                            + " carried over.")
    public ResponseEntity<Map<String, Object>> installEngine() {
        if (!mayChangeRuntime()) {
            return adminsOnly();
        }
        try {
            ocrRuntimeService.installEngine();
        } catch (IOException e) {
            log.warn("Could not install the OCR engine", e);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("installed", false, "error", String.valueOf(e.getMessage())));
        }
        // Whatever the installer could not finish has now been done by hand.
        ocrRuntimeService.clearPendingRequest();
        // The engine path is resolved once at startup, so the tool group only comes back on the
        // next launch. Say so plainly rather than letting the user wonder why OCR is still hidden.
        return ResponseEntity.ok(Map.of("installed", true, "restartRequired", true));
    }

    @PostMapping("/ocr/languages")
    @Operation(
            summary = "Add or remove OCR language models",
            description =
                    "Takes effect immediately: the language list is read from disk on every OCR"
                            + " request, so no restart is needed.")
    public ResponseEntity<Map<String, Object>> languages(@RequestBody OcrLanguagesRequest request) {
        if (!mayChangeRuntime()) {
            return adminsOnly();
        }
        Map<String, String> failures = new TreeMap<>();

        for (String code : safe(request.getInstall())) {
            try {
                ocrRuntimeService.installLanguage(code);
            } catch (IOException e) {
                log.warn("Could not install the OCR language {}", code, e);
                failures.put(code, String.valueOf(e.getMessage()));
            }
        }
        for (String code : safe(request.getRemove())) {
            try {
                ocrRuntimeService.removeLanguage(code);
            } catch (IOException e) {
                log.warn("Could not remove the OCR language {}", code, e);
                failures.put(code, String.valueOf(e.getMessage()));
            }
        }

        Map<String, Object> body =
                Map.of(
                        "installedLanguages",
                        ocrRuntimeService.installedLanguages(),
                        "failed",
                        failures);
        // 207 keeps a partial result honest: some models landed, some did not, and the caller can
        // see exactly which.
        return failures.isEmpty()
                ? ResponseEntity.ok(body)
                : ResponseEntity.status(HttpStatus.MULTI_STATUS).body(body);
    }

    private static List<String> safe(List<String> values) {
        return values == null ? List.of() : values;
    }
}

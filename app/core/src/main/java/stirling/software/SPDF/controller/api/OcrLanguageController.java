package stirling.software.SPDF.controller.api;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.ocr.OcrLanguageInstaller;
import stirling.software.common.annotations.api.UiDataApi;

/**
 * OCR language management for the OCR tool's language picker. Shares the {@code ocr-pdf} endpoint
 * key, so it is reachable exactly when OCR is, and routes like the language list it extends.
 */
@Slf4j
@UiDataApi
@RequiredArgsConstructor
public class OcrLanguageController {

    private final OcrLanguageInstaller installer;

    @GetMapping("/ocr-pdf/languages")
    @Operation(summary = "List installed OCR languages and the ones that can be added here")
    public OcrLanguageInstaller.Languages languages() {
        return installer.languages();
    }

    @PostMapping("/ocr-pdf/languages/{code}")
    @Operation(summary = "Install an OCR language (desktop app only)")
    public OcrLanguageInstaller.Languages install(@PathVariable String code) {
        try {
            return installer.install(code);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        } catch (IllegalStateException e) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, e.getMessage(), e);
        } catch (IOException e) {
            log.warn("Installing OCR language {} failed", code, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, e.getMessage(), e);
        }
    }
}

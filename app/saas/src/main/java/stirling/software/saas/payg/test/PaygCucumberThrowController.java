package stirling.software.saas.payg.test;

import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.enumeration.ResourceWeight;

/**
 * Cucumber-only force-5xx endpoint. Gated behind the {@code payg-cucumber} Spring profile so the
 * bean never registers in production — only the PAYG cucumber compose stack activates the profile
 * (via {@code SPRING_PROFILES_ACTIVE=saas,payg-cucumber} in {@code docker-compose-saas.yml}).
 *
 * <p>Purpose: drive the PAYG filter+interceptor's 5xx-first-step branch end-to-end. No reliably-
 * 5xx-ing real tool endpoint exists in current Stirling — every malformed input is caught as 4xx by
 * {@code GlobalExceptionHandler}. Without this stub the only way to exercise the refund path was a
 * manual procedure (a temporary throw endpoint added, run, removed) documented in {@code
 * notes/PAYG_DESIGN.md} §7.5.2 M1. This controller replaces that procedure with a profile- gated
 * automated scenario.
 *
 * <p>{@link AutoJobPostMapping} consumes {@code multipart/form-data} so the filter's {@code
 * MultipartHttpServletRequest} cast runs and the input lineage hash is computed before the
 * controller throws. The PAYG filter chain therefore sees: preHandle → openProcess (CHARGED row
 * written) → controller throws → afterCompletion observes status 500 → markFirstStepFailed (row →
 * REFUNDED, job → CLOSED).
 *
 * <p>The thrown {@link IllegalStateException} is unwrapped by {@code GlobalExceptionHandler}'s
 * RuntimeException handler — it has no IOException / IllegalArgument / BaseAppException cause, so
 * it falls through to the "Unexpected RuntimeException" branch which sets HTTP 500. Don't use
 * {@code ResponseStatusException} here — its dedicated handler is reached before the unwrapping
 * branch but the upstream test still passes; {@link IllegalStateException} is the more honest mimic
 * of a real bug-driven 500.
 *
 * <p>{@code @Hidden} keeps this endpoint out of OpenAPI / Swagger output even when the profile is
 * active, so no docs leak to anyone running the cucumber stack interactively.
 *
 * <p><b>Return type matters:</b> the method declares {@link ResponseEntity}{@code <Void>}, not
 * {@code void}. Spring's {@code InvocableHandlerMethod} picks a return-value handler based on the
 * <i>declared</i> return type; {@code void} matches the "no body, status 200" handler regardless of
 * what the {@code @Around} advice on {@link AutoJobPostMapping} actually returns at runtime. The
 * first version of this stub declared {@code void} and the 500 ResponseEntity from {@code
 * JobExecutorService}'s catch block was silently discarded — the client saw a 200 with an empty
 * body. Declaring {@code ResponseEntity<Void>} matches the real runtime type and lets the advice's
 * 500 reach the wire.
 */
@Slf4j
@RestController
@Profile("payg-cucumber")
@RequestMapping("/api/v1/payg-cucumber")
@Hidden
public class PaygCucumberThrowController {

    @AutoJobPostMapping(
            value = "/throw-500",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.SMALL_WEIGHT)
    public ResponseEntity<Void> throw500(
            @RequestParam(value = "fileInput", required = false) MultipartFile fileInput) {
        // The file is read by the PAYG filter via getMultiFileMap() before we get here; the
        // controller param is just to keep Spring's multipart binding happy. We don't touch it.
        log.warn(
                "PAYG cucumber forced 500 (fileInput name='{}' size={} bytes)",
                fileInput != null ? fileInput.getOriginalFilename() : null,
                fileInput != null ? fileInput.getSize() : 0);
        throw new IllegalStateException("PAYG cucumber forced 500");
        // unreachable — kept as a type signature so AutoJobAspect's @Around return value (the
        // 500 ResponseEntity from JobExecutorService) actually reaches the wire.
    }
}

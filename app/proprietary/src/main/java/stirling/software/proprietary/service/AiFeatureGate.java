package stirling.software.proprietary.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.Features;

/**
 * Central gate for the AI feature switches ({@code aiEngine.features.*}); each {@code require*}
 * throws 503 when the engine is disabled or the capability is off.
 */
@Component
@RequiredArgsConstructor
public class AiFeatureGate {

    private final ApplicationProperties applicationProperties;

    private Features features() {
        return applicationProperties.getAiEngine().getFeatures();
    }

    private void require(boolean featureEnabled, String feature) {
        if (!applicationProperties.getAiEngine().isEnabled() || !featureEnabled) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "AI feature '" + feature + "' is disabled");
        }
    }

    /**
     * Shared entry point for chat and document questions; open while either is enabled, since a
     * request can't be attributed to just one. No per-capability gate exists for the same reason.
     */
    public void requireConversationalWorkflow() {
        require(features().isChat() || features().isDocumentQuestions(), "conversation");
    }

    public void requireCreatePdf() {
        require(features().isCreatePdf(), "createPdf");
    }

    public void requireMathAuditor() {
        require(features().isMathAuditor(), "mathAuditor");
    }

    public void requirePdfComment() {
        require(features().isPdfComment(), "pdfComment");
    }

    public void requireClassify() {
        require(features().isClassify(), "classify");
    }
}

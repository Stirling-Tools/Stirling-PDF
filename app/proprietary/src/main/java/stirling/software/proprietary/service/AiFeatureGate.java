package stirling.software.proprietary.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AiEngine.Features;

/**
 * Central gate for the per-capability AI feature switches ({@code aiEngine.features.*}). Each AI
 * capability entry point calls the matching {@code require*} method so an admin who turns a feature
 * off in the settings UI gets a clean 503 instead of the request silently reaching the engine. All
 * checks also fail closed when the AI engine itself is disabled.
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

    public void requireChat() {
        require(features().isChat(), "chat");
    }

    public void requireDocumentQuestions() {
        require(features().isDocumentQuestions(), "documentQuestions");
    }

    /**
     * The orchestrate endpoint is the single entry point behind both the chat assistant and
     * grounded document questions, so it stays available while either capability is enabled and
     * only fails closed when both are off (or the engine is disabled).
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

package stirling.software.saas.legal;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/** Records clickwrap consents to versioned legal documents (see {@link LegalConsent}). */
@Slf4j
@Service
@Profile("saas")
@RequiredArgsConstructor
public class LegalConsentService {

    private final LegalDocumentRegistry registry;
    private final LegalConsentRepository consents;

    /**
     * Record that the given user accepted the current version of {@code documentId} in {@code
     * context} (e.g. "trial", "quote"). No-op for an unknown document. Best-effort: callers treat a
     * failure as non-fatal so it never blocks the flow the consent accompanies.
     */
    @Transactional
    public void record(Long teamId, Long userId, String documentId, String context, String ip) {
        LegalDocumentMeta meta = registry.meta(documentId).orElse(null);
        if (meta == null) {
            log.warn("[legal] consent for unknown document '{}' ignored", documentId);
            return;
        }
        LegalConsent consent = new LegalConsent();
        consent.setTeamId(teamId);
        consent.setUserId(userId);
        consent.setDocumentId(meta.id());
        consent.setDocumentVersion(meta.version());
        consent.setContext(context);
        consent.setSignerIp(ip);
        consents.save(consent);
        log.info(
                "[legal] consent recorded team={} doc={} v{} context={}",
                teamId,
                meta.id(),
                meta.version(),
                context);
    }
}

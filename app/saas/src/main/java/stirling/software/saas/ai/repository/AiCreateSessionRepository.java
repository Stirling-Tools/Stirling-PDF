package stirling.software.saas.ai.repository;

import java.time.Instant;
import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;

@ApplicationScoped
public class AiCreateSessionRepository implements PanacheRepositoryBase<AiCreateSession, String> {

    /**
     * Persist-or-update an entity and return the managed instance. Replaces the Spring Data {@code
     * save} convenience: for a managed/updated entity, mutations are flushed by the active
     * transaction; for a new entity, {@code persist} attaches it.
     */
    public AiCreateSession save(AiCreateSession entity) {
        if (entity != null && !isPersistent(entity)) {
            persist(entity);
        }
        return entity;
    }

    public List<AiCreateSession> findByUserIdOrderByUpdatedAtDesc(String userId) {
        return find("userId = ?1 ORDER BY updatedAt DESC", userId).list();
    }

    public List<AiCreateSession> findByUserIdOrderByUpdatedAtDesc(String userId, int maxResults) {
        return find("userId = ?1 ORDER BY updatedAt DESC", userId).page(0, maxResults).list();
    }

    public List<AiCreateSession> findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
            String userId, int maxResults) {
        return find("userId = ?1 AND pdfUrl IS NOT NULL ORDER BY updatedAt DESC", userId)
                .page(0, maxResults)
                .list();
    }

    public List<AiCreateSession> findByUserIdOrderByUpdatedAtDesc(
            String userId, int page, int size) {
        return find("userId = ?1 ORDER BY updatedAt DESC", userId).page(page, size).list();
    }

    public List<AiCreateSession> findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
            String userId, int page, int size) {
        return find("userId = ?1 AND pdfUrl IS NOT NULL ORDER BY updatedAt DESC", userId)
                .page(page, size)
                .list();
    }

    public List<AiCreateSessionSummaryProjection> findSummariesByUserIdOrderByUpdatedAtDesc(
            String userId, int page, int size) {
        return findByUserIdOrderByUpdatedAtDesc(userId, page, size).stream()
                .map(AiCreateSessionSummaryProjection::of)
                .toList();
    }

    public List<AiCreateSessionSummaryProjection>
            findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
                    String userId, int page, int size) {
        return findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(userId, page, size).stream()
                .map(AiCreateSessionSummaryProjection::of)
                .toList();
    }

    /**
     * Lightweight summary view of an {@link AiCreateSession}. Was a Spring Data interface
     * projection; under Panache it is materialised from the entity. Getter names are preserved so
     * callers are unchanged.
     */
    public record AiCreateSessionSummaryProjection(
            String sessionId,
            String docType,
            String templateId,
            String promptLatest,
            String promptInitial,
            AiCreateSessionStatus status,
            String pdfUrl,
            Instant createdAt,
            Instant updatedAt) {

        static AiCreateSessionSummaryProjection of(AiCreateSession session) {
            return new AiCreateSessionSummaryProjection(
                    session.getSessionId(),
                    session.getDocType(),
                    session.getTemplateId(),
                    session.getPromptLatest(),
                    session.getPromptInitial(),
                    session.getStatus(),
                    session.getPdfUrl(),
                    session.getCreatedAt(),
                    session.getUpdatedAt());
        }

        public String getSessionId() {
            return sessionId;
        }

        public String getDocType() {
            return docType;
        }

        public String getTemplateId() {
            return templateId;
        }

        public String getPromptLatest() {
            return promptLatest;
        }

        public String getPromptInitial() {
            return promptInitial;
        }

        public AiCreateSessionStatus getStatus() {
            return status;
        }

        public String getPdfUrl() {
            return pdfUrl;
        }

        public Instant getCreatedAt() {
            return createdAt;
        }

        public Instant getUpdatedAt() {
            return updatedAt;
        }
    }
}

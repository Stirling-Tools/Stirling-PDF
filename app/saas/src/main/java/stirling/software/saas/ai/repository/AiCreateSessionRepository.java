package stirling.software.saas.ai.repository;

import java.util.List;

import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;

import jakarta.enterprise.context.ApplicationScoped;

import stirling.software.saas.ai.model.AiCreateSession;

@ApplicationScoped
public class AiCreateSessionRepository implements PanacheRepositoryBase<AiCreateSession, String> {

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
}

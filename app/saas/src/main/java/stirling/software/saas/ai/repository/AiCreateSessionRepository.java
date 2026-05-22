package stirling.software.saas.ai.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import stirling.software.saas.ai.model.AiCreateSession;
import stirling.software.saas.ai.model.AiCreateSessionStatus;

public interface AiCreateSessionRepository extends JpaRepository<AiCreateSession, String> {
    List<AiCreateSession> findByUserIdOrderByUpdatedAtDesc(String userId);

    List<AiCreateSession> findByUserIdOrderByUpdatedAtDesc(String userId, Pageable pageable);

    List<AiCreateSession> findByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
            String userId, Pageable pageable);

    @Query(
            """
            select s.sessionId as sessionId,
                   s.docType as docType,
                   s.templateId as templateId,
                   s.promptLatest as promptLatest,
                   s.promptInitial as promptInitial,
                   s.status as status,
                   s.pdfUrl as pdfUrl,
                   s.createdAt as createdAt,
                   s.updatedAt as updatedAt
              from AiCreateSession s
             where s.userId = :userId
             order by s.updatedAt desc
            """)
    List<AiCreateSessionSummaryProjection> findSummariesByUserIdOrderByUpdatedAtDesc(
            @Param("userId") String userId, Pageable pageable);

    @Query(
            """
            select s.sessionId as sessionId,
                   s.docType as docType,
                   s.templateId as templateId,
                   s.promptLatest as promptLatest,
                   s.promptInitial as promptInitial,
                   s.status as status,
                   s.pdfUrl as pdfUrl,
                   s.createdAt as createdAt,
                   s.updatedAt as updatedAt
              from AiCreateSession s
             where s.userId = :userId
               and s.pdfUrl is not null
             order by s.updatedAt desc
            """)
    List<AiCreateSessionSummaryProjection>
            findSummariesByUserIdAndPdfUrlIsNotNullOrderByUpdatedAtDesc(
                    @Param("userId") String userId, Pageable pageable);

    interface AiCreateSessionSummaryProjection {
        String getSessionId();

        String getDocType();

        String getTemplateId();

        String getPromptLatest();

        String getPromptInitial();

        AiCreateSessionStatus getStatus();

        String getPdfUrl();

        Instant getCreatedAt();

        Instant getUpdatedAt();
    }
}

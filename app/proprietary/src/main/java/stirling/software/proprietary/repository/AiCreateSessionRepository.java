package stirling.software.proprietary.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import stirling.software.proprietary.model.ai.AiCreateSession;

public interface AiCreateSessionRepository extends JpaRepository<AiCreateSession, String> {}

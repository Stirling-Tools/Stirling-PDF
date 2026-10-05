package stirling.software.proprietary.workflow.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.UUID;

import org.hibernate.LazyInitializationException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.StoredFileRepository;
import stirling.software.proprietary.workflow.dto.WorkflowSessionResponse;
import stirling.software.proprietary.workflow.model.WorkflowParticipant;
import stirling.software.proprietary.workflow.model.WorkflowSession;
import stirling.software.proprietary.workflow.model.WorkflowType;
import stirling.software.proprietary.workflow.util.WorkflowMapper;

/**
 * Participant endpoints map the session after the loader's transaction has ended, so the finder has
 * to bring the session graph back with it.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
// H2 has no jsonb type; the domain lets the workflow entities build their schema here.
@TestPropertySource(
        properties = {
            "spring.datasource.url=jdbc:h2:mem:workflowlazy;DB_CLOSE_DELAY=-1;INIT=CREATE DOMAIN IF"
                    + " NOT EXISTS JSONB AS JSON",
            "spring.datasource.driver-class-name=org.h2.Driver",
            "spring.datasource.username=sa",
            "spring.datasource.password="
        })
class WorkflowParticipantLazySessionDbTest {

    @Autowired private WorkflowParticipantRepository participantRepository;
    @Autowired private WorkflowSessionRepository sessionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private StoredFileRepository storedFileRepository;

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void plainFinderLeavesTheSessionUnreachable() {
        String token = seedSession();

        WorkflowParticipant participant =
                participantRepository.findByShareToken(token).orElseThrow();

        assertThrows(
                LazyInitializationException.class,
                () -> participant.getWorkflowSession().isActive());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void fetchJoinedFinderMapsTheSessionOutsideATransaction() {
        String token = seedSession();

        WorkflowParticipant participant =
                participantRepository.findByShareTokenWithSession(token).orElseThrow();
        WorkflowSessionResponse response =
                WorkflowMapper.toResponse(participant.getWorkflowSession(), null, false);

        assertEquals("owner-" + token, response.getOwnerUsername());
        assertEquals(1, response.getParticipantCount());
    }

    /** Persists an owner, a stored file, a session and one participant. Returns the share token. */
    private String seedSession() {
        String token = UUID.randomUUID().toString();

        User owner = new User();
        owner.setUsername("owner-" + token);
        owner.setPassword("x");
        owner = userRepository.save(owner);

        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setOriginalFilename("doc.pdf");
        file.setStorageKey("key-" + token);
        file = storedFileRepository.save(file);

        WorkflowSession session = new WorkflowSession();
        session.setOwner(owner);
        session.setWorkflowType(WorkflowType.SIGNING);
        session.setDocumentName("doc.pdf");
        session.setOriginalFile(file);

        WorkflowParticipant participant = new WorkflowParticipant();
        participant.setEmail("participant@example.com");
        participant.setShareToken(token);
        participant.setAccessRole(ShareAccessRole.EDITOR);
        session.addParticipant(participant);

        sessionRepository.save(session);
        return token;
    }

    @SpringBootConfiguration
    @EntityScan(
            basePackages = {
                "stirling.software.proprietary.workflow.model",
                "stirling.software.proprietary.storage.model",
                "stirling.software.proprietary.security.model",
                "stirling.software.proprietary.model"
            })
    @EnableJpaRepositories(
            basePackages = {
                "stirling.software.proprietary.workflow.repository",
                "stirling.software.proprietary.storage.repository",
                "stirling.software.proprietary.security.database.repository"
            })
    static class TestApp {}
}

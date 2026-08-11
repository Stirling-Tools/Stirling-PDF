package stirling.software.proprietary.storage.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Base64;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileEncryptionKey;
import stirling.software.proprietary.storage.repository.FileEncryptionKeyRepository;

/**
 * Key-creation against a real database and real transaction boundaries. The Mockito race test
 * throws synchronously from save(), which hides the production failure mode: under a caller's
 * transaction (e.g. WorkflowSessionService is class-level {@code @Transactional}) an assigned-UUID
 * INSERT defers to the outer flush, so without REQUIRES_NEW the duplicate-key error would surface
 * at commit — far from the recovery catch — with the outer transaction already rollback-only.
 */
@DataJpaTest
class FileEncryptionKeyServiceDbTest {

    private static final String MASTER =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes());

    @Autowired
    private FileEncryptionKeyRepository repository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void wipe() {
        repository.deleteAllInBatch();
    }

    private FileEncryptionKeyService newService() {
        TransactionTemplate requiresNew = new TransactionTemplate(transactionManager);
        requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        return new FileEncryptionKeyService(repository, new FileEncryptionMasterKey(MASTER, false), requiresNew);
    }

    private static User teamUser(long teamId) {
        Team team = new Team();
        team.setId(teamId);
        User user = new User();
        user.setTeam(team);
        return user;
    }

    @Test
    void createActive_duplicateInsertInsideCallerTransaction_recoversAndKeepsCallerHealthy() {
        // "Node A" creates the scope key first (committed independently).
        FileEncryptionKey winner = newService().createActive(FileEncryptionKey.ScopeType.TEAM, 42L);
        assertThat(repository.count()).isEqualTo(1);

        // "Node B" raced: it computed its key version BEFORE A's commit was visible, so it
        // attempts the same (scope, version) row. Only that read is faked; the flush, the
        // unique-constraint violation, and the recovery all run against the real database.
        FileEncryptionKeyRepository raceTimedRepo = org.mockito.Mockito.mock(
                FileEncryptionKeyRepository.class, org.mockito.AdditionalAnswers.delegatesTo(repository));
        org.mockito.Mockito.doReturn(java.util.Optional.empty())
                .when(raceTimedRepo)
                .findFirstByScopeTypeAndScopeIdOrderByKeyVersionDesc(FileEncryptionKey.ScopeType.TEAM, 42L);

        TransactionTemplate requiresNew = new TransactionTemplate(transactionManager);
        requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        FileEncryptionKeyService raced =
                new FileEncryptionKeyService(raceTimedRepo, new FileEncryptionMasterKey(MASTER, false), requiresNew);

        // Inside a caller transaction (the WorkflowSessionService shape): the duplicate insert
        // must be absorbed by createActive's own REQUIRES_NEW transaction, recover to the
        // winner's row, and leave the caller transaction committable.
        TransactionTemplate callerTx = new TransactionTemplate(transactionManager);
        FileEncryptionKey resolved = callerTx.execute(status -> {
            FileEncryptionKey row = raced.createActive(FileEncryptionKey.ScopeType.TEAM, 42L);
            assertThat(status.isRollbackOnly()).isFalse();
            return row;
        });

        assertThat(resolved.getKeyId()).isEqualTo(winner.getKeyId());
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void activeKekForOwner_roundTripsThroughRealDatabase() throws Exception {
        FileEncryptionKeyService service = newService();
        FileEncryptionKeyService.ScopeKek created = service.activeKekForOwner(teamUser(7));

        // Fresh service (cold caches) unwraps the same key material from the committed row.
        assertThat(newService().kekForDecrypt(created.keyId())).isEqualTo(created.key());
    }

    // The key entity/repository live in sibling packages, so point the JPA slice at the whole
    // proprietary tree (the entity graph pulls in User/Team either way).
    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}

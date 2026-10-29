package stirling.software.proprietary.storage.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

@DataJpaTest
class StoredFileRepositoryExpiryDbTest {

    @Autowired StoredFileRepository repository;
    @Autowired EntityManager em;

    @Test
    void findExpiredAfterId_returnsExpiredFilesPastTheCursorInIdOrder() {
        User owner = new User();
        owner.setUsername("owner");
        em.persist(owner);
        LocalDateTime now = LocalDateTime.of(2026, 10, 8, 12, 0);
        StoredFile expiredA = file(owner, now.minusMinutes(5));
        file(owner, null);
        file(owner, now.plusMinutes(5));
        StoredFile expiredB = file(owner, now.minusDays(1));
        em.flush();

        assertThat(ids(repository.findExpiredAfterId(now, 0L, PageRequest.of(0, 100))))
                .containsExactly(expiredA.getId(), expiredB.getId());
        assertThat(ids(repository.findExpiredAfterId(now, 0L, PageRequest.of(0, 1))))
                .containsExactly(expiredA.getId());
        assertThat(
                        ids(
                                repository.findExpiredAfterId(
                                        now, expiredA.getId(), PageRequest.of(0, 100))))
                .containsExactly(expiredB.getId());
    }

    private StoredFile file(User owner, LocalDateTime expiresAt) {
        StoredFile f = new StoredFile();
        f.setOwner(owner);
        f.setOriginalFilename("a.pdf");
        f.setStorageKey(UUID.randomUUID().toString());
        f.setExpiresAt(expiresAt);
        em.persist(f);
        return f;
    }

    private static List<Long> ids(List<StoredFile> files) {
        return files.stream().map(StoredFile::getId).toList();
    }

    @SpringBootConfiguration
    @EntityScan(basePackages = "stirling.software.proprietary")
    @EnableJpaRepositories(basePackageClasses = StoredFileRepository.class)
    static class TestApp {}
}

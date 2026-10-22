package stirling.software.proprietary.storage.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.annotation.DirtiesContext;

import jakarta.persistence.EntityManager;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;

@DataJpaTest
@DirtiesContext
class StorageFolderOwnershipDbTest {

    @Autowired private FolderRepository folders;
    @Autowired private StoredFileRepository files;
    @Autowired private EntityManager entityManager;

    @Test
    void folderAndFileQueriesEnforceOwnershipIndependently() {
        User alice = user("alice");
        User bob = user("bob");
        Folder aliceFolder = folder(alice);
        Folder bobFolder = folder(bob);
        StoredFile own = file(alice, aliceFolder);
        StoredFile foreign = file(bob, aliceFolder);
        file(alice, bobFolder);
        entityManager.flush();
        entityManager.clear();

        assertThat(folders.findByIdAndOwner(aliceFolder.getId(), alice)).isPresent();
        assertThat(folders.findByIdAndOwner(bobFolder.getId(), alice)).isEmpty();
        assertThat(files.findAllByFolderIdAndOwner(aliceFolder.getId(), alice))
                .extracting(StoredFile::getId)
                .containsExactly(own.getId());
        assertThat(files.findByIdAndOwner(foreign.getId(), alice)).isEmpty();
    }

    private User user(String name) {
        Team team = new Team();
        team.setName(name);
        entityManager.persist(team);
        User user = new User();
        user.setUsername(name);
        user.setPassword("test-password");
        user.setTeam(team);
        entityManager.persist(user);
        return user;
    }

    private Folder folder(User owner) {
        Folder folder = new Folder();
        folder.setId(UUID.randomUUID());
        folder.setOwner(owner);
        folder.setName("Documents");
        entityManager.persist(folder);
        return folder;
    }

    private StoredFile file(User owner, Folder folder) {
        StoredFile file = new StoredFile();
        file.setOwner(owner);
        file.setFolder(folder);
        file.setOriginalFilename("document.pdf");
        file.setContentType("application/pdf");
        file.setStorageKey(UUID.randomUUID().toString());
        file.setSizeBytes(10L);
        entityManager.persist(file);
        return file;
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage(basePackages = "stirling.software.proprietary")
    static class TestApp {}
}

package stirling.software.proprietary.security.database.repository;

import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;

import stirling.software.proprietary.security.model.JwtSigningKey;

@DataJpaTest
class JwtSigningKeyRepositoryTest {

    @Autowired
    private TestEntityManager entityManager;

    @Autowired
    private JwtSigningKeyRepository repository;

    private JwtSigningKey activeKey;
    private JwtSigningKey inactiveKey;

    @BeforeEach
    void setUp() {
        // Create test data
        activeKey = new JwtSigningKey("active-key-123", "active-public-key", "RS256");
        activeKey.setIsActive(true);
        activeKey.setCreatedAt(LocalDateTime.now().minusDays(1));
        
        inactiveKey = new JwtSigningKey("inactive-key-456", "inactive-public-key", "RS256");
        inactiveKey.setIsActive(false);
        inactiveKey.setCreatedAt(LocalDateTime.now().minusDays(2));
        
        entityManager.persistAndFlush(activeKey);
        entityManager.persistAndFlush(inactiveKey);
    }

    @Test
    void testFindByIsActiveTrue() {
        Optional<JwtSigningKey> result = repository.findByIsActiveTrue();
        
        assertTrue(result.isPresent());
        assertEquals("active-key-123", result.get().getKeyId());
        assertTrue(result.get().getIsActive());
    }

    @Test
    void testFindByIsActiveTrueWhenNoActiveKeys() {
        // Deactivate all keys
        activeKey.setIsActive(false);
        entityManager.persistAndFlush(activeKey);
        
        Optional<JwtSigningKey> result = repository.findByIsActiveTrue();
        
        assertFalse(result.isPresent());
    }

    @Test
    void testFindByKeyId() {
        Optional<JwtSigningKey> result = repository.findByKeyId("active-key-123");
        
        assertTrue(result.isPresent());
        assertEquals("active-key-123", result.get().getKeyId());
        assertEquals("active-public-key", result.get().getPublicKey());
    }

    @Test
    void testFindByKeyIdNotFound() {
        Optional<JwtSigningKey> result = repository.findByKeyId("non-existent-key");
        
        assertFalse(result.isPresent());
    }

    @Test
    void testFindByKeyIdAndIsActiveTrue() {
        Optional<JwtSigningKey> result = repository.findByKeyIdAndIsActiveTrue("active-key-123");
        
        assertTrue(result.isPresent());
        assertEquals("active-key-123", result.get().getKeyId());
        assertTrue(result.get().getIsActive());
    }

    @Test
    void testFindByKeyIdAndIsActiveTrueWithInactiveKey() {
        Optional<JwtSigningKey> result = repository.findByKeyIdAndIsActiveTrue("inactive-key-456");
        
        assertFalse(result.isPresent());
    }

    @Test
    void testSaveAndRetrieve() {
        JwtSigningKey newKey = new JwtSigningKey("new-key-789", "new-public-key", "RS256");
        
        JwtSigningKey saved = repository.save(newKey);
        
        assertNotNull(saved.getId());
        assertEquals("new-key-789", saved.getKeyId());
        assertEquals("new-public-key", saved.getPublicKey());
        assertEquals("RS256", saved.getAlgorithm());
        assertTrue(saved.getIsActive());
        assertNotNull(saved.getCreatedAt());
        
        // Verify it can be retrieved
        Optional<JwtSigningKey> retrieved = repository.findByKeyId("new-key-789");
        assertTrue(retrieved.isPresent());
        assertEquals(saved.getId(), retrieved.get().getId());
    }

    @Test
    void testUpdateIsActive() {
        // Update active key to inactive
        activeKey.setIsActive(false);
        repository.save(activeKey);
        
        Optional<JwtSigningKey> result = repository.findByIsActiveTrue();
        assertFalse(result.isPresent());
        
        // Verify the key still exists but is inactive
        Optional<JwtSigningKey> inactive = repository.findByKeyId("active-key-123");
        assertTrue(inactive.isPresent());
        assertFalse(inactive.get().getIsActive());
    }

    @Test
    void testUniqueConstraintOnKeyId() {
        JwtSigningKey duplicateKeyId = new JwtSigningKey("active-key-123", "duplicate-public-key", "RS256");
        
        // Should throw exception due to unique constraint on keyId
        assertThrows(Exception.class, () -> {
            repository.saveAndFlush(duplicateKeyId);
        });
    }

    @Test
    void testFindAll() {
        var allKeys = repository.findAll();
        
        assertEquals(2, allKeys.size());
        
        boolean foundActive = false;
        boolean foundInactive = false;
        
        for (JwtSigningKey key : allKeys) {
            if ("active-key-123".equals(key.getKeyId())) {
                foundActive = true;
                assertTrue(key.getIsActive());
            } else if ("inactive-key-456".equals(key.getKeyId())) {
                foundInactive = true;
                assertFalse(key.getIsActive());
            }
        }
        
        assertTrue(foundActive);
        assertTrue(foundInactive);
    }

    @Test
    void testDeleteByKeyId() {
        repository.deleteById(activeKey.getId());
        
        Optional<JwtSigningKey> result = repository.findByKeyId("active-key-123");
        assertFalse(result.isPresent());
        
        // Verify inactive key still exists
        Optional<JwtSigningKey> inactiveResult = repository.findByKeyId("inactive-key-456");
        assertTrue(inactiveResult.isPresent());
    }
}
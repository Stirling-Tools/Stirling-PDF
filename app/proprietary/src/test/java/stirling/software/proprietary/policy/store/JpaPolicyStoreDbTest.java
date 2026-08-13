package stirling.software.proprietary.policy.store;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;

import tools.jackson.databind.json.JsonMapper;

/**
 * {@link JpaPolicyStore#anyPolicyReferences} on a real (H2) database. It guards a scheduled DELETE
 * over stored certificates, so it has to be proven against the raw column rather than the parsed
 * policies {@code all()} would hand back.
 */
@DataJpaTest
class JpaPolicyStoreDbTest {

    @Autowired private PolicyRepository repository;

    private JpaPolicyStore store() {
        return new JpaPolicyStore(repository, JsonMapper.builder().build());
    }

    @Test
    void seesAnAssetIdMentionedByAStoredPolicy() {
        save("p1", "{\"steps\":[{\"fileParameters\":{\"p12File\":\"asset:abc-123\"}}]}");

        assertTrue(store().anyPolicyReferences("abc-123"));
        assertFalse(store().anyPolicyReferences("def-456"));
    }

    @Test
    void seesAnAssetIdInsideAPolicyRowItCannotParse() {
        // The whole point of matching raw JSON: a row all() skips as unreadable still holds its
        // certificate, and reclaiming that would be unrecoverable.
        save("broken", "{ this is not valid json, asset:abc-123");

        assertTrue(store().all().isEmpty());
        assertTrue(store().anyPolicyReferences("abc-123"));
    }

    @Test
    void ignoresBlankIds() {
        save("p1", "{\"steps\":[]}");

        assertFalse(store().anyPolicyReferences(""));
        assertFalse(store().anyPolicyReferences(null));
    }

    private void save(String id, String policyJson) {
        PolicyEntity entity = new PolicyEntity();
        entity.setId(id);
        entity.setName(id);
        entity.setPolicyJson(policyJson);
        repository.save(entity);
    }

    @SpringBootConfiguration
    @AutoConfigurationPackage
    static class TestApp {}
}

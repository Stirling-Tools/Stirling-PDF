package stirling.software.proprietary.policy.source;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * Tests for {@link JpaSourceStore}'s entity mapping. The repository is mocked; real Hibernate/H2
 * persistence is exercised at application boot, mirroring {@link
 * stirling.software.proprietary.policy.store.JpaPolicyStore}'s test convention.
 */
@ExtendWith(MockitoExtension.class)
class JpaSourceStoreTest {

    @Mock private SourceRepository repository;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private JpaSourceStore store;

    @BeforeEach
    void setUp() {
        store = new JpaSourceStore(repository, objectMapper);
    }

    @Test
    void saveAssignsAnIdAndPersistsTheSourceAsJson() {
        Source saved =
                store.save(
                        new Source(
                                null,
                                "Claims intake",
                                "folder",
                                Map.of("directory", "/in/claims"),
                                true,
                                "alice",
                                7L));

        assertNotNull(saved.id());
        ArgumentCaptor<SourceEntity> captor = ArgumentCaptor.forClass(SourceEntity.class);
        verify(repository).save(captor.capture());
        SourceEntity entity = captor.getValue();
        assertEquals(saved.id(), entity.getId());
        assertEquals("folder", entity.getType());
        assertEquals("alice", entity.getOwner());
        assertEquals(Long.valueOf(7L), entity.getTeamId());
        assertTrue(entity.isEnabled());
        // The stored JSON round-trips back to an equal source.
        assertEquals(saved, objectMapper.readValue(entity.getSourceJson(), Source.class));
    }

    @Test
    void getDeserializesTheSourceFromJson() {
        Source source =
                new Source("s1", "Claims", "folder", Map.of("directory", "/in"), true, "alice", 1L);
        when(repository.findById("s1")).thenReturn(Optional.of(entityFor(source)));

        assertEquals(source, store.get("s1").orElseThrow());
    }

    @Test
    void allDeserializesEverySource() {
        Source a = new Source("a", "A", "folder", Map.of("directory", "/a"), true, "alice", 1L);
        when(repository.findAll()).thenReturn(List.of(entityFor(a)));

        assertEquals(List.of(a), store.all());
    }

    @Test
    void findByTeamDelegatesToTheScopedQuery() {
        Source mine = new Source("a", "A", "folder", Map.of("directory", "/a"), true, "alice", 7L);
        when(repository.findByTeam(7L)).thenReturn(List.of(entityFor(mine)));

        assertEquals(List.of(mine), store.findByTeam(7L));
    }

    @Test
    void deleteReturnsWhetherTheSourceExisted() {
        when(repository.existsById("s1")).thenReturn(true);
        assertTrue(store.delete("s1"));
        verify(repository).deleteById("s1");

        when(repository.existsById("missing")).thenReturn(false);
        assertFalse(store.delete("missing"));
    }

    private SourceEntity entityFor(Source source) {
        SourceEntity entity = new SourceEntity();
        entity.setId(source.id());
        entity.setName(source.name());
        entity.setType(source.type());
        entity.setOwner(source.owner());
        entity.setTeamId(source.teamId());
        entity.setEnabled(source.enabled());
        entity.setSourceJson(objectMapper.writeValueAsString(source));
        return entity;
    }
}

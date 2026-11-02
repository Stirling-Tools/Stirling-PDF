package stirling.software.proprietary.cache;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.model.Team;
import stirling.software.proprietary.security.database.repository.AuthorityRepository;
import stirling.software.proprietary.security.database.repository.UserIdentity;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;

class ExternalWriteEvictionServiceTest {

    private static final String USER = User.class.getName();
    private static final UUID LIVE = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID DELETED = UUID.fromString("00000000-0000-0000-0000-000000000002");

    private UserRepository users;
    private AuthorityRepository authorities;
    private CacheEvictionBroadcaster broadcaster;
    private ExternalWriteEvictionService service;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        authorities = mock(AuthorityRepository.class);
        broadcaster = mock(CacheEvictionBroadcaster.class);
        service = new ExternalWriteEvictionService(users, authorities, broadcaster);
    }

    @Test
    void resolvedSupabaseUserEvictsTheUserItsRolesAndItsUsername() {
        when(users.findIdentitiesBySupabaseIdIn(any()))
                .thenReturn(List.of(new UserIdentity(5L, "a@example.com", LIVE)));
        when(authorities.findIdsByUserIdIn(List.of(5L))).thenReturn(List.of(70L));

        List<CacheEviction> evicted =
                service.evict(
                        new ExternalWriteEvictionService.Request(List.of(LIVE), null, null, null));

        assertThat(evicted)
                .containsExactly(
                        CacheEviction.entityWithCollections(USER, "5"),
                        CacheEviction.naturalId(USER, "a@example.com"),
                        CacheEviction.entity(Authority.class.getName(), "70"));
        verify(broadcaster).broadcast(evicted);
    }

    @Test
    void userThatNoLongerResolvesEvictsTheWholeUserRegion() {
        when(users.findIdentitiesBySupabaseIdIn(any()))
                .thenReturn(List.of(new UserIdentity(5L, "a@example.com", LIVE)));

        List<CacheEviction> evicted =
                service.evict(
                        new ExternalWriteEvictionService.Request(
                                List.of(LIVE, DELETED), null, null, null));

        assertThat(evicted)
                .contains(
                        CacheEviction.entityRegion(USER),
                        CacheEviction.entityRegion(Authority.class.getName()));
    }

    @Test
    void deletedUsernameStillEvictsItsNaturalIdMapping() {
        when(users.findIdentitiesByUsernameIn(any())).thenReturn(List.of());

        List<CacheEviction> evicted =
                service.evict(
                        new ExternalWriteEvictionService.Request(
                                null, null, List.of("gone@example.com"), null));

        assertThat(evicted)
                .contains(
                        CacheEviction.naturalId(USER, "gone@example.com"),
                        CacheEviction.entityRegion(USER));
    }

    @Test
    void teamsEvictTheTeamAndItsCollections() {
        List<CacheEviction> evicted =
                service.evict(
                        new ExternalWriteEvictionService.Request(null, null, null, List.of(9L)));

        assertThat(evicted)
                .containsExactly(CacheEviction.entityWithCollections(Team.class.getName(), "9"));
    }

    @Test
    void emptyRequestBroadcastsNothingToEvict() {
        assertThat(service.evict(new ExternalWriteEvictionService.Request(null, null, null, null)))
                .isEmpty();
        verify(users, never()).findIdentitiesByIdIn(any());
    }

    @Test
    void rejectsOversizedRequests() {
        List<Long> ids =
                LongStream.rangeClosed(1, ExternalWriteEvictionService.MAX_IDS + 1)
                        .boxed()
                        .toList();

        assertThatThrownBy(
                        () ->
                                service.evict(
                                        new ExternalWriteEvictionService.Request(
                                                null, ids, null, Collections.emptyList())))
                .isInstanceOf(IllegalArgumentException.class);
        verify(broadcaster, never()).broadcast(any());
    }
}

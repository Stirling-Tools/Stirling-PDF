package stirling.software.saas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.model.exception.UserNotFoundException;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * Unit tests for {@link SupabaseUserService}.
 *
 * <p>Thin CRUD facade over {@link SupabaseUserRepository}. Every method either delegates to the
 * repository or, in {@code getUser}, translates a {@link Optional#empty()} into a {@link
 * UserNotFoundException}. The Supabase boundary is fully mocked - no DB, no network.
 */
@ExtendWith(MockitoExtension.class)
class SupabaseUserServiceTest {

    @Mock private SupabaseUserRepository supabaseUserRepository;

    @InjectMocks private SupabaseUserService service;

    private static final UUID SUPABASE_ID = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private static final String EMAIL = "user@example.com";

    private static SupabaseUser supabaseUser(UUID id, String email, boolean anonymous) {
        SupabaseUser u = new SupabaseUser();
        u.setId(id);
        u.setEmail(email);
        u.setAnonymous(anonymous);
        return u;
    }

    @Nested
    @DisplayName("getUser")
    class GetUser {

        @Test
        @DisplayName("returns the entity when the repository finds it by id")
        void found_returnsEntity() {
            SupabaseUser existing = supabaseUser(SUPABASE_ID, EMAIL, false);
            when(supabaseUserRepository.findById(SUPABASE_ID)).thenReturn(Optional.of(existing));

            SupabaseUser result = service.getUser(SUPABASE_ID);

            assertThat(result).isSameAs(existing);
            verify(supabaseUserRepository).findById(SUPABASE_ID);
        }

        @Test
        @DisplayName("throws UserNotFoundException carrying the id when the repository is empty")
        void missing_throwsUserNotFound() {
            when(supabaseUserRepository.findById(SUPABASE_ID)).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.getUser(SUPABASE_ID))
                    .isInstanceOf(UserNotFoundException.class)
                    .hasMessageContaining(SUPABASE_ID.toString())
                    .hasMessageContaining("not found");

            verify(supabaseUserRepository, never()).save(any());
        }

        @Test
        @DisplayName("looks the user up by the exact id it is given")
        void passesIdThrough() {
            UUID other = UUID.fromString("99999999-8888-7777-6666-555555555555");
            when(supabaseUserRepository.findById(other))
                    .thenReturn(Optional.of(supabaseUser(other, "other@example.com", true)));

            SupabaseUser result = service.getUser(other);

            assertThat(result.getId()).isEqualTo(other);
            verify(supabaseUserRepository).findById(other);
        }
    }

    @Nested
    @DisplayName("createSupabaseUser")
    class CreateSupabaseUser {

        @Test
        @DisplayName("builds a SupabaseUser from the args and returns the saved entity")
        void buildsAndSavesUser() {
            // Repository echoes whatever it was handed.
            when(supabaseUserRepository.save(any(SupabaseUser.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            SupabaseUser result = service.createSupabaseUser(SUPABASE_ID, EMAIL, false);

            ArgumentCaptor<SupabaseUser> captor = ArgumentCaptor.forClass(SupabaseUser.class);
            verify(supabaseUserRepository).save(captor.capture());
            SupabaseUser saved = captor.getValue();
            assertThat(saved.getId()).isEqualTo(SUPABASE_ID);
            assertThat(saved.getEmail()).isEqualTo(EMAIL);
            assertThat(saved.isAnonymous()).isFalse();
            // The method returns exactly what the repository produced.
            assertThat(result).isSameAs(saved);
        }

        @Test
        @DisplayName("propagates the anonymous flag when true")
        void anonymousFlagTrue() {
            when(supabaseUserRepository.save(any(SupabaseUser.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            service.createSupabaseUser(SUPABASE_ID, EMAIL, true);

            ArgumentCaptor<SupabaseUser> captor = ArgumentCaptor.forClass(SupabaseUser.class);
            verify(supabaseUserRepository).save(captor.capture());
            assertThat(captor.getValue().isAnonymous()).isTrue();
        }

        @Test
        @DisplayName("accepts a null email and persists it unchanged (no normalisation)")
        void nullEmail_persistedAsNull() {
            when(supabaseUserRepository.save(any(SupabaseUser.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            service.createSupabaseUser(SUPABASE_ID, null, false);

            ArgumentCaptor<SupabaseUser> captor = ArgumentCaptor.forClass(SupabaseUser.class);
            verify(supabaseUserRepository).save(captor.capture());
            assertThat(captor.getValue().getEmail()).isNull();
        }

        @Test
        @DisplayName("returns the repository's instance, not a freshly built one")
        void returnsRepositoryInstance() {
            SupabaseUser persisted = supabaseUser(SUPABASE_ID, EMAIL, false);
            when(supabaseUserRepository.save(any(SupabaseUser.class))).thenReturn(persisted);

            SupabaseUser result = service.createSupabaseUser(SUPABASE_ID, EMAIL, false);

            assertThat(result).isSameAs(persisted);
        }

        @Test
        @DisplayName("does not read the user back before creating it")
        void doesNotFindBeforeSave() {
            when(supabaseUserRepository.save(any(SupabaseUser.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            service.createSupabaseUser(SUPABASE_ID, EMAIL, false);

            verify(supabaseUserRepository, never()).findById(any());
        }
    }

    @Nested
    @DisplayName("save")
    class Save {

        @Test
        @DisplayName("delegates straight to the repository and returns its result")
        void delegatesToRepository() {
            SupabaseUser input = supabaseUser(SUPABASE_ID, EMAIL, false);
            SupabaseUser persisted = supabaseUser(SUPABASE_ID, EMAIL, false);
            when(supabaseUserRepository.save(input)).thenReturn(persisted);

            SupabaseUser result = service.save(input);

            assertThat(result).isSameAs(persisted);
            verify(supabaseUserRepository).save(input);
        }

        @Test
        @DisplayName("passes a null entity through to the repository without guarding")
        void nullEntity_passedThrough() {
            when(supabaseUserRepository.save(null)).thenReturn(null);

            SupabaseUser result = service.save(null);

            assertThat(result).isNull();
            verify(supabaseUserRepository).save(null);
        }
    }

    @Test
    @DisplayName("repository save failures bubble out of createSupabaseUser unchanged")
    void createSupabaseUser_repositoryThrows_propagates() {
        when(supabaseUserRepository.save(any(SupabaseUser.class)))
                .thenThrow(new RuntimeException("constraint violation"));

        assertThatThrownBy(() -> service.createSupabaseUser(SUPABASE_ID, EMAIL, false))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("constraint violation");
    }
}

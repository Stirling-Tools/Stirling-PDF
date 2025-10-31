package stirling.software.proprietary.security.database.repository;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.Date;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.web.authentication.rememberme.PersistentRememberMeToken;

import stirling.software.proprietary.security.model.PersistentLogin;

class JPATokenRepositoryImplTest {

    private final PersistentLoginRepository persistentLoginRepository =
            mock(PersistentLoginRepository.class);
    private final JPATokenRepositoryImpl tokenRepository =
            new JPATokenRepositoryImpl(persistentLoginRepository);

    @Nested
    @DisplayName("createNewToken")
    class CreateNewTokenTests {

        @Test
        @DisplayName("should save new PersistentLogin with correct values")
        void shouldSaveNewToken() {
            Date date = new Date();
            PersistentRememberMeToken token =
                    new PersistentRememberMeToken("user1", "series123", "tokenABC", date);

            tokenRepository.createNewToken(token);

            ArgumentCaptor<PersistentLogin> captor = ArgumentCaptor.forClass(PersistentLogin.class);
            verify(persistentLoginRepository).save(captor.capture());

            PersistentLogin saved = captor.getValue();
            assertEquals("series123", saved.getSeries());
            assertEquals("user1", saved.getUsername());
            assertEquals("tokenABC", saved.getToken());
            assertEquals(date.toInstant(), saved.getLastUsed());
        }
    }

    @Nested
    @DisplayName("updateToken")
    class UpdateTokenTests {

        @Test
        @DisplayName("should update existing token if found")
        void shouldUpdateExistingToken() {
            PersistentLogin existing = new PersistentLogin();
            existing.setSeries("series123");
            existing.setUsername("user1");
            existing.setToken("oldToken");
            existing.setLastUsed(new Date().toInstant());

            when(persistentLoginRepository.findById("series123")).thenReturn(Optional.of(existing));

            Date newDate = new Date();
            tokenRepository.updateToken("series123", "newToken", newDate);

            assertEquals("newToken", existing.getToken());
            assertEquals(newDate.toInstant(), existing.getLastUsed());
            verify(persistentLoginRepository).save(existing);
        }

        @Test
        @DisplayName("should do nothing if token not found")
        void shouldDoNothingIfNotFound() {
            when(persistentLoginRepository.findById("unknownSeries")).thenReturn(Optional.empty());

            tokenRepository.updateToken("unknownSeries", "newToken", new Date());

            verify(persistentLoginRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getTokenForSeries")
    class GetTokenForSeriesTests {

        @Test
        @DisplayName("should return PersistentRememberMeToken if found")
        void shouldReturnTokenIfFound() {
            Date date = new Date();
            PersistentLogin login = new PersistentLogin();
            login.setSeries("series123");
            login.setUsername("user1");
            login.setToken("tokenXYZ");
            login.setLastUsed(date.toInstant());

            when(persistentLoginRepository.findById("series123")).thenReturn(Optional.of(login));

            PersistentRememberMeToken result = tokenRepository.getTokenForSeries("series123");

            assertNotNull(result);
            assertEquals("user1", result.getUsername());
            assertEquals("series123", result.getSeries());
            assertEquals("tokenXYZ", result.getTokenValue());
            assertEquals(date, result.getDate());
        }

        @Test
        @DisplayName("should return null if token not found")
        void shouldReturnNullIfNotFound() {
            when(persistentLoginRepository.findById("series123")).thenReturn(Optional.empty());

            PersistentRememberMeToken result = tokenRepository.getTokenForSeries("series123");

            assertNull(result);
        }
    }

    @Nested
    @DisplayName("removeUserTokens")
    class RemoveUserTokensTests {

        @Test
        @DisplayName("should call deleteByUsername normally")
        void shouldCallDeleteByUsername() {
            tokenRepository.removeUserTokens("user1");
            verify(persistentLoginRepository).deleteByUsername("user1");
        }

        @Test
        @DisplayName("should swallow exception if deleteByUsername fails")
        void shouldSwallowException() {
            doThrow(new RuntimeException("DB error"))
                    .when(persistentLoginRepository)
                    .deleteByUsername("user1");

            assertDoesNotThrow(() -> tokenRepository.removeUserTokens("user1"));
            verify(persistentLoginRepository).deleteByUsername("user1");
        }
    }
}

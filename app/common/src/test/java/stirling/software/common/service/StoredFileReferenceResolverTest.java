package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

class StoredFileReferenceResolverTest {

    private StoredFileResolver storedFileResolver;

    @SuppressWarnings("unchecked")
    private final ObjectProvider<StoredFileResolver> provider = mock(ObjectProvider.class);

    private StoredFileReferenceResolver resolver;

    @BeforeEach
    void setUp() {
        storedFileResolver = mock(StoredFileResolver.class);
        when(provider.getIfAvailable()).thenReturn(storedFileResolver);
        resolver = new StoredFileReferenceResolver(provider);
    }

    @Test
    void recognisesOnlyTheStoragePrefix() {
        assertTrue(resolver.isStoredFileReference("storage:42"));
        assertFalse(resolver.isStoredFileReference("job-file-id"));
        assertFalse(resolver.isStoredFileReference(null));
    }

    @Test
    void resolvesTheNumericId() {
        MultipartFile file = mock(MultipartFile.class);
        when(storedFileResolver.resolve(42L)).thenReturn(file);

        assertSame(file, resolver.resolve("storage:42"));
        verify(storedFileResolver).resolve(42L);
    }

    @Test
    void rejectsMalformedIds() {
        ResponseStatusException error =
                assertThrows(
                        ResponseStatusException.class,
                        () -> resolver.resolve("storage:not-a-number"));

        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
    }

    @Test
    void rejectsReferencesWhenNoStorageModuleIsPresent() {
        when(provider.getIfAvailable()).thenReturn(null);

        ResponseStatusException error =
                assertThrows(ResponseStatusException.class, () -> resolver.resolve("storage:7"));

        assertEquals(HttpStatus.NOT_IMPLEMENTED, error.getStatusCode());
    }

    @Test
    void resolvesAllInOrder() {
        MultipartFile first = mock(MultipartFile.class);
        MultipartFile second = mock(MultipartFile.class);
        when(storedFileResolver.resolve(1L)).thenReturn(first);
        when(storedFileResolver.resolve(2L)).thenReturn(second);

        assertArrayEquals(
                new MultipartFile[] {first, second},
                resolver.resolveAll(List.of("storage:1", "storage:2")));
    }
}

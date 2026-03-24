package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Field;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.service.UserServiceInterface;

class JobOwnershipServiceImplTest {

    private JobOwnershipServiceImpl service;
    private UserServiceInterface userService;

    @BeforeEach
    void setUp() throws Exception {
        service = new JobOwnershipServiceImpl();
        userService = mock(UserServiceInterface.class);
        Field field = JobOwnershipServiceImpl.class.getDeclaredField("userService");
        field.setAccessible(true);
        field.set(service, userService);
    }

    // --- getCurrentUserId tests ---

    @Test
    void getCurrentUserId_withValidUsername_returnsUsername() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        Optional<String> result = service.getCurrentUserId();
        assertTrue(result.isPresent());
        assertEquals("alice", result.get());
    }

    @Test
    void getCurrentUserId_nullUsername_returnsEmpty() {
        when(userService.getCurrentUsername()).thenReturn(null);
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    @Test
    void getCurrentUserId_emptyUsername_returnsEmpty() {
        when(userService.getCurrentUsername()).thenReturn("");
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    @Test
    void getCurrentUserId_anonymousUser_returnsEmpty() {
        when(userService.getCurrentUsername()).thenReturn("anonymousUser");
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    @Test
    void getCurrentUserId_exceptionThrown_returnsEmpty() {
        when(userService.getCurrentUsername()).thenThrow(new RuntimeException("fail"));
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    @Test
    void getCurrentUserId_nullUserService_returnsEmpty() throws Exception {
        Field field = JobOwnershipServiceImpl.class.getDeclaredField("userService");
        field.setAccessible(true);
        field.set(service, null);
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    // --- createScopedJobKey tests ---

    @Test
    void createScopedJobKey_authenticatedUser_returnsScopedKey() {
        when(userService.getCurrentUsername()).thenReturn("bob");
        assertEquals("bob:job123", service.createScopedJobKey("job123"));
    }

    @Test
    void createScopedJobKey_noUser_returnsJobId() {
        when(userService.getCurrentUsername()).thenReturn(null);
        assertEquals("job123", service.createScopedJobKey("job123"));
    }

    // --- validateJobAccess tests ---

    @Test
    void validateJobAccess_noUser_allowsAccess() {
        when(userService.getCurrentUsername()).thenReturn(null);
        assertTrue(service.validateJobAccess("any:key"));
    }

    @Test
    void validateJobAccess_ownerAccess_returnsTrue() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        assertTrue(service.validateJobAccess("alice:job1"));
    }

    @Test
    void validateJobAccess_differentUser_throwsSecurityException() {
        when(userService.getCurrentUsername()).thenReturn("alice");
        assertThrows(SecurityException.class, () -> service.validateJobAccess("bob:job1"));
    }

    // --- extractJobId tests ---

    @Test
    void extractJobId_scopedKey_extractsJobId() {
        assertEquals("job123", service.extractJobId("alice:job123"));
    }

    @Test
    void extractJobId_unscopedKey_returnsAsIs() {
        assertEquals("job123", service.extractJobId("job123"));
    }

    @Test
    void extractJobId_multipleColons_extractsAfterFirst() {
        assertEquals("job:with:colons", service.extractJobId("user:job:with:colons"));
    }
}

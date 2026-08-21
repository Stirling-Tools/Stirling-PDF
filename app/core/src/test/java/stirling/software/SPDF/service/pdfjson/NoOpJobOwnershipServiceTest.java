package stirling.software.SPDF.service.pdfjson;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class NoOpJobOwnershipServiceTest {

    private NoOpJobOwnershipService service;

    @BeforeEach
    void setUp() {
        service = new NoOpJobOwnershipService();
    }

    @Test
    void getCurrentUserId_alwaysReturnsEmpty() {
        assertEquals(Optional.empty(), service.getCurrentUserId());
    }

    @Test
    void createScopedJobKey_returnsJobIdUnchanged() {
        assertEquals("myJob", service.createScopedJobKey("myJob"));
    }

    @Test
    void createScopedJobKey_handlesNull() {
        assertNull(service.createScopedJobKey(null));
    }

    @Test
    void createScopedJobKey_handlesEmptyString() {
        assertEquals("", service.createScopedJobKey(""));
    }

    @Test
    void validateJobAccess_alwaysReturnsTrue() {
        assertTrue(service.validateJobAccess("anyKey"));
    }

    @Test
    void validateJobAccess_withScopedKey_stillReturnsTrue() {
        assertTrue(service.validateJobAccess("user:job123"));
    }

    @Test
    void extractJobId_returnsKeyAsIs() {
        assertEquals("job123", service.extractJobId("job123"));
    }

    @Test
    void extractJobId_scopedKey_returnsUnchanged() {
        assertEquals("user:job123", service.extractJobId("user:job123"));
    }
}

package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WeeklyActiveUsersServiceTest {

    private WeeklyActiveUsersService service;

    @BeforeEach
    void setUp() {
        service = new WeeklyActiveUsersService();
    }

    @Test
    void recordBrowserAccess_newBrowser_incrementsTotalUnique() {
        service.recordBrowserAccess("browser-1");
        assertEquals(1, service.getTotalUniqueBrowsers());
        assertEquals(1, service.getWeeklyActiveUsers());
    }

    @Test
    void recordBrowserAccess_sameBrowserTwice_doesNotDoubleCounts() {
        service.recordBrowserAccess("browser-1");
        service.recordBrowserAccess("browser-1");
        assertEquals(1, service.getTotalUniqueBrowsers());
        assertEquals(1, service.getWeeklyActiveUsers());
    }

    @Test
    void recordBrowserAccess_multipleBrowsers_countsAll() {
        service.recordBrowserAccess("browser-1");
        service.recordBrowserAccess("browser-2");
        service.recordBrowserAccess("browser-3");
        assertEquals(3, service.getTotalUniqueBrowsers());
        assertEquals(3, service.getWeeklyActiveUsers());
    }

    @Test
    void recordBrowserAccess_nullBrowserId_isIgnored() {
        service.recordBrowserAccess(null);
        assertEquals(0, service.getTotalUniqueBrowsers());
        assertEquals(0, service.getWeeklyActiveUsers());
    }

    @Test
    void recordBrowserAccess_emptyBrowserId_isIgnored() {
        service.recordBrowserAccess("");
        assertEquals(0, service.getTotalUniqueBrowsers());
    }

    @Test
    void recordBrowserAccess_blankBrowserId_isIgnored() {
        service.recordBrowserAccess("   ");
        assertEquals(0, service.getTotalUniqueBrowsers());
    }

    @Test
    void getWeeklyActiveUsers_removesOldEntries() throws Exception {
        service.recordBrowserAccess("old-browser");

        // Manipulate the internal map to set an old timestamp
        Field activeBrowsersField =
                WeeklyActiveUsersService.class.getDeclaredField("activeBrowsers");
        activeBrowsersField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Instant> activeBrowsers =
                (Map<String, Instant>) activeBrowsersField.get(service);
        activeBrowsers.put("old-browser", Instant.now().minus(8, ChronoUnit.DAYS));

        // Add a fresh browser
        service.recordBrowserAccess("new-browser");

        // getWeeklyActiveUsers should clean up old entries
        long wau = service.getWeeklyActiveUsers();
        assertEquals(1, wau);
        // totalUniqueBrowsers should still be 2
        assertEquals(2, service.getTotalUniqueBrowsers());
    }

    @Test
    void performCleanup_removesOldEntries() throws Exception {
        service.recordBrowserAccess("old-browser");

        Field activeBrowsersField =
                WeeklyActiveUsersService.class.getDeclaredField("activeBrowsers");
        activeBrowsersField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, Instant> activeBrowsers =
                (Map<String, Instant>) activeBrowsersField.get(service);
        activeBrowsers.put("old-browser", Instant.now().minus(8, ChronoUnit.DAYS));

        service.performCleanup();
        assertEquals(0, service.getWeeklyActiveUsers());
    }

    @Test
    void performCleanup_keepsRecentEntries() {
        service.recordBrowserAccess("recent-browser");
        service.performCleanup();
        assertEquals(1, service.getWeeklyActiveUsers());
    }

    @Test
    void getDaysOnline_returnsZeroInitially() {
        // Service was just created, should be 0 days
        assertEquals(0, service.getDaysOnline());
    }

    @Test
    void getStartTime_returnsNonNull() {
        Instant startTime = service.getStartTime();
        assertNotNull(startTime);
        // Start time should be very recent
        assertTrue(
                ChronoUnit.SECONDS.between(startTime, Instant.now()) < 5,
                "Start time should be within 5 seconds of now");
    }

    @Test
    void getWeeklyActiveUsers_emptyService_returnsZero() {
        assertEquals(0, service.getWeeklyActiveUsers());
    }

    @Test
    void getTotalUniqueBrowsers_emptyService_returnsZero() {
        assertEquals(0, service.getTotalUniqueBrowsers());
    }
}

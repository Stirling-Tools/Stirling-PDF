package stirling.software.proprietary.model.dto;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class TeamWithUserCountDTOTest {

    @Test
    void allArgsConstructor_setsFields() {
        TeamWithUserCountDTO dto = new TeamWithUserCountDTO(1L, "Engineering", 42L);

        assertEquals(1L, dto.getId());
        assertEquals("Engineering", dto.getName());
        assertEquals(42L, dto.getUserCount());
    }

    @Test
    void noArgsConstructor_and_setters_work() {
        TeamWithUserCountDTO dto = new TeamWithUserCountDTO();

        assertNull(dto.getId());
        assertNull(dto.getName());
        assertNull(dto.getUserCount());

        dto.setId(7L);
        dto.setName("Ops");
        dto.setUserCount(5L);

        assertEquals(7L, dto.getId());
        assertEquals("Ops", dto.getName());
        assertEquals(5L, dto.getUserCount());
    }

    @Test
    void equals_and_hashCode_based_on_fields() {
        TeamWithUserCountDTO a = new TeamWithUserCountDTO(10L, "Team", 3L);
        TeamWithUserCountDTO b = new TeamWithUserCountDTO(10L, "Team", 3L);
        TeamWithUserCountDTO c = new TeamWithUserCountDTO(10L, "Team", 4L); // differs in userCount

        assertEquals(a, b);
        assertEquals(a.hashCode(), b.hashCode());

        assertNotEquals(a, c);
        // Not strictly required but often true when a field differs:
        assertNotEquals(a.hashCode(), c.hashCode());
    }

    @Test
    void toString_contains_field_values() {
        TeamWithUserCountDTO dto = new TeamWithUserCountDTO(2L, "QA", 8L);
        String ts = dto.toString();

        assertTrue(ts.contains("2"));
        assertTrue(ts.contains("QA"));
        assertTrue(ts.contains("8"));
    }
}

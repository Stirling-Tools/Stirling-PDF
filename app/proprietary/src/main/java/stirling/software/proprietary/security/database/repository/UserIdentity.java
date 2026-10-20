package stirling.software.proprietary.security.database.repository;

import java.util.UUID;

public record UserIdentity(Long id, String username, UUID supabaseId) {}

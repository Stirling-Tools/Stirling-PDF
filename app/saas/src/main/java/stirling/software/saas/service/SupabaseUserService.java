package stirling.software.saas.service;

import java.util.UUID;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.model.exception.UserNotFoundException;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * CRUD over Supabase's {@code auth.users} mirror. Exists only under the saas profile because the
 * {@code auth} schema is Supabase-specific.
 */
@Service
@Profile("saas")
@RequiredArgsConstructor
public class SupabaseUserService {

    private final SupabaseUserRepository supabaseUserRepository;

    public SupabaseUser getUser(UUID supabaseId) {
        return supabaseUserRepository
                .findById(supabaseId)
                .orElseThrow(
                        () ->
                                new UserNotFoundException(
                                        "Supabase user " + supabaseId + " not found"));
    }

    public SupabaseUser createSupabaseUser(UUID supabaseId, String email, boolean isAnonymous) {
        SupabaseUser supabaseUser = new SupabaseUser();
        supabaseUser.setId(supabaseId);
        supabaseUser.setEmail(email);
        supabaseUser.setAnonymous(isAnonymous);
        return supabaseUserRepository.save(supabaseUser);
    }

    public SupabaseUser save(SupabaseUser supabaseUser) {
        return supabaseUserRepository.save(supabaseUser);
    }
}

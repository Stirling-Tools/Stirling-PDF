package stirling.software.saas.service;

import java.util.UUID;

import io.quarkus.arc.profile.IfBuildProfile;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.RequiredArgsConstructor;

import stirling.software.saas.model.SupabaseUser;
import stirling.software.saas.model.exception.UserNotFoundException;
import stirling.software.saas.repository.SupabaseUserRepository;

/**
 * CRUD over Supabase's {@code auth.users} mirror. Exists only under the saas profile because the
 * {@code auth} schema is Supabase-specific.
 */
@ApplicationScoped
@IfBuildProfile("saas")
@RequiredArgsConstructor
public class SupabaseUserService {

    private final SupabaseUserRepository supabaseUserRepository;

    public SupabaseUser getUser(UUID supabaseId) {
        return supabaseUserRepository
                .findByIdOptional(supabaseId)
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
        supabaseUserRepository.persist(supabaseUser);
        return supabaseUser;
    }

    public SupabaseUser save(SupabaseUser supabaseUser) {
        // TODO: Migration required - Spring Data save() did an upsert (merge); SupabaseUser uses an
        // assigned UUID id and this path updates an existing row, so use EntityManager.merge to
        // preserve update-or-insert semantics rather than Panache persist (INSERT-only).
        return supabaseUserRepository.getEntityManager().merge(supabaseUser);
    }
}

package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import stirling.software.proprietary.security.repository.OrgOwnerRepository;

class OrgOwnerSaasIsolationTest {
    @Test
    void everySharedEntryPointIsInertOnSaas() {
        Environment env = mock(Environment.class);
        when(env.acceptsProfiles(any(Profiles.class))).thenReturn(true);
        OrgOwnerRepository repository = mock(OrgOwnerRepository.class);
        OrgOwnerService service =
                new OrgOwnerService(repository, null, null, env, null, null, null, null);
        assertTrue(service.ownerId().isEmpty());
        assertFalse(service.isOwner(1L));
        assertFalse(service.isCurrentUser(null));
        service.protect(1L, false);
        service.protect(1L, true);
        service.renamed(1L, "new-name");
        service.resolveOwner();
        service.reconcile("admin");
        service.reconcileAfterCommit();
        verifyNoInteractions(repository);
    }
}

package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import stirling.software.proprietary.model.security.PersistentAuditEvent;
import stirling.software.proprietary.repository.PersistentAuditEventRepository;

/**
 * The scan must drop read/polling noise (UI_DATA/HTTP_REQUEST) at the query level. Otherwise a busy
 * scope's recent rows fill with noise and the visible audit list shrinks as traffic grows.
 */
@ExtendWith(MockitoExtension.class)
class PortalAuditReadServiceTest {

    @Mock private PersistentAuditEventRepository repo;

    @InjectMocks private PortalAuditReadService service;

    private static Page<PersistentAuditEvent> emptyPage() {
        return new PageImpl<>(List.of());
    }

    @Test
    void serverScanExcludesReadNoiseAndNeverPullsEverything() {
        when(repo.findByTypeNotIn(anyList(), any(Pageable.class))).thenReturn(emptyPage());

        service.serverEvents();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> excluded = ArgumentCaptor.forClass(List.class);
        verify(repo).findByTypeNotIn(excluded.capture(), any(Pageable.class));
        assertThat(excluded.getValue()).contains("UI_DATA", "HTTP_REQUEST");
        verify(repo, never()).findAll(any(Pageable.class));
    }

    @Test
    void teamScanExcludesReadNoiseForTheTeamPrincipals() {
        when(repo.findByTypeNotInAndPrincipalIn(anyList(), anyList(), any(Pageable.class)))
                .thenReturn(emptyPage());

        service.scopedEvents("team:1", List.of("a@acme.com", "b@acme.com"));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<String>> excluded = ArgumentCaptor.forClass(List.class);
        verify(repo)
                .findByTypeNotInAndPrincipalIn(excluded.capture(), anyList(), any(Pageable.class));
        assertThat(excluded.getValue()).contains("UI_DATA", "HTTP_REQUEST");
    }

    @Test
    void emptyTeamPrincipalsShortCircuitToNoQuery() {
        assertThat(service.scopedEvents("team:1", List.of())).isEmpty();
        verify(repo, never())
                .findByTypeNotInAndPrincipalIn(anyList(), anyList(), any(Pageable.class));
    }
}

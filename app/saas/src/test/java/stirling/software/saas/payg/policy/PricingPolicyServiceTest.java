package stirling.software.saas.payg.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.context.ApplicationEventPublisher;

import stirling.software.saas.payg.repository.PaygTeamExtensionsRepository;
import stirling.software.saas.payg.repository.PricingPolicyRepository;

/**
 * Unit tests for {@link PricingPolicyService}: lookup precedence (override → default), cache
 * hit/miss, invalidation on {@link PolicyChangedEvent}, mutation paths publishing the event.
 */
class PricingPolicyServiceTest {

    private PricingPolicyRepository policyRepo;
    private PaygTeamExtensionsRepository extensionsRepo;
    private ApplicationEventPublisher events;
    private PricingPolicyService service;

    private PricingPolicy defaultPolicy;
    private PricingPolicy overridePolicy;

    @BeforeEach
    void setUp() {
        policyRepo = Mockito.mock(PricingPolicyRepository.class);
        extensionsRepo = Mockito.mock(PaygTeamExtensionsRepository.class);
        events = Mockito.mock(ApplicationEventPublisher.class);
        service = new PricingPolicyService(policyRepo, extensionsRepo, events);

        defaultPolicy = policy(1L, "v1-default", true);
        overridePolicy = policy(2L, "v1-enterprise", false);

        when(policyRepo.findFirstByIsDefaultTrue()).thenReturn(Optional.of(defaultPolicy));
        when(policyRepo.findById(1L)).thenReturn(Optional.of(defaultPolicy));
        when(policyRepo.findById(2L)).thenReturn(Optional.of(overridePolicy));
        when(policyRepo.existsById(2L)).thenReturn(true);
    }

    @Test
    void noOverride_returnsDefault() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());

        PricingPolicy result = service.getEffectivePolicy(42L);

        assertThat(result).isEqualTo(defaultPolicy);
    }

    @Test
    void overrideSet_returnsOverride() {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(42L);
        ext.setPricingPolicyId(2L);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.of(ext));

        PricingPolicy result = service.getEffectivePolicy(42L);

        assertThat(result).isEqualTo(overridePolicy);
    }

    @Test
    void overridePointsAtMissingPolicy_fallsBackToDefault() {
        // Race condition: team's override row references a policy that has since been deleted.
        // Service should log + fall back rather than throw, so the team still gets billed
        // correctly under the default.
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(42L);
        ext.setPricingPolicyId(999L);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.of(ext));
        when(policyRepo.findById(999L)).thenReturn(Optional.empty());

        PricingPolicy result = service.getEffectivePolicy(42L);

        assertThat(result).isEqualTo(defaultPolicy);
    }

    @Test
    void noDefaultExists_throws() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());
        when(policyRepo.findFirstByIsDefaultTrue()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getEffectivePolicy(42L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No default pricing_policy row");
    }

    @Test
    void nullTeamId_returnsDefaultPolicyDirectly_noCacheLookup() {
        PricingPolicy result = service.getEffectivePolicy(null);

        assertThat(result).isEqualTo(defaultPolicy);
        verify(extensionsRepo, never()).findById(any());
        // Team-less users go straight to the default — no cache pollution either.
        assertThat(service.cacheSize()).isZero();
    }

    @Test
    void nullTeamIdUncached_returnsDefaultPolicyDirectly() {
        PricingPolicy result = service.getEffectivePolicyUncached(null);

        assertThat(result).isEqualTo(defaultPolicy);
        verify(extensionsRepo, never()).findById(any());
    }

    @Test
    void nullTeamId_noDefaultExists_throws() {
        when(policyRepo.findFirstByIsDefaultTrue()).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getEffectivePolicy(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("No default pricing_policy row");
    }

    @Test
    void secondCallHitsCache_noRepoLookup() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());

        service.getEffectivePolicy(42L);
        service.getEffectivePolicy(42L);
        service.getEffectivePolicy(42L);

        // Three calls, one DB lookup — the cache holds the result.
        verify(policyRepo, times(1)).findFirstByIsDefaultTrue();
        verify(extensionsRepo, times(1)).findById(42L);
    }

    @Test
    void uncachedRead_alwaysHitsRepo() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());

        service.getEffectivePolicyUncached(42L);
        service.getEffectivePolicyUncached(42L);

        verify(policyRepo, times(2)).findFirstByIsDefaultTrue();
    }

    @Test
    void policyChangedEvent_invalidatesCache() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());

        service.getEffectivePolicy(42L);
        assertThat(service.cacheSize()).isEqualTo(1);

        service.onPolicyChanged(new PolicyChangedEvent(this, "test"));

        assertThat(service.cacheSize()).isZero();
        // Next call repopulates from DB.
        service.getEffectivePolicy(42L);
        verify(policyRepo, times(2)).findFirstByIsDefaultTrue();
    }

    @Test
    void create_rejectsDraftWithId() {
        PricingPolicy draft = policy(99L, "v2", false);
        assertThatThrownBy(() -> service.create(draft))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not carry a policy_id");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void create_rejectsDefaultFlagPreSet() {
        PricingPolicy draft = policy(null, "v2", true);
        assertThatThrownBy(() -> service.create(draft))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("setDefault");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void create_savesAndPublishesEvent() {
        PricingPolicy draft = policy(null, "v2-fresh", false);
        PricingPolicy saved = policy(3L, "v2-fresh", false);
        when(policyRepo.save(draft)).thenReturn(saved);

        PricingPolicy result = service.create(draft);

        assertThat(result).isEqualTo(saved);
        ArgumentCaptor<PolicyChangedEvent> evt = ArgumentCaptor.forClass(PolicyChangedEvent.class);
        verify(events).publishEvent(evt.capture());
        assertThat(evt.getValue().getPayload()).contains("create:3");
    }

    @Test
    void setDefault_promotesAndClearsExisting() {
        // newDefaultId = 2, current default is 1
        PricingPolicy promoted = policy(2L, "v1-enterprise", true);
        when(policyRepo.findById(2L)).thenReturn(Optional.of(overridePolicy));
        when(policyRepo.save(any(PricingPolicy.class))).thenReturn(promoted);

        PricingPolicy result = service.setDefault(2L);

        verify(policyRepo).clearDefaultFlag();
        assertThat(result.getIsDefault()).isTrue();
        verify(events, atLeastOnce()).publishEvent(any(PolicyChangedEvent.class));
    }

    @Test
    void setDefault_alreadyDefault_isNoop() {
        // Calling setDefault on the row that's already default → return it, don't re-flag, but
        // still don't fire an event (no state change). Keeps callers idempotent without spamming
        // listeners.
        PricingPolicy result = service.setDefault(1L);

        assertThat(result).isEqualTo(defaultPolicy);
        verify(policyRepo, never()).clearDefaultFlag();
        verify(policyRepo, never()).save(any(PricingPolicy.class));
        verify(events, never()).publishEvent(any());
    }

    @Test
    void setDefault_unknownId_throws() {
        when(policyRepo.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.setDefault(999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("No pricing_policy with id 999");
        verify(events, never()).publishEvent(any());
    }

    @Test
    void setTeamOverride_setsAndPublishes() {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(42L);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.of(ext));
        when(extensionsRepo.save(any(PaygTeamExtensions.class))).thenReturn(ext);

        service.setTeamOverride(42L, 2L);

        assertThat(ext.getPricingPolicyId()).isEqualTo(2L);
        verify(extensionsRepo).save(ext);
        verify(events).publishEvent(any(PolicyChangedEvent.class));
    }

    @Test
    void setTeamOverride_clearsWithNullPolicyId() {
        PaygTeamExtensions ext = new PaygTeamExtensions();
        ext.setTeamId(42L);
        ext.setPricingPolicyId(2L);
        when(extensionsRepo.findById(42L)).thenReturn(Optional.of(ext));
        when(extensionsRepo.save(any(PaygTeamExtensions.class))).thenReturn(ext);

        service.setTeamOverride(42L, null);

        assertThat(ext.getPricingPolicyId()).isNull();
    }

    @Test
    void setTeamOverride_unknownPolicyId_throwsBeforeSave() {
        when(policyRepo.existsById(999L)).thenReturn(false);

        assertThatThrownBy(() -> service.setTeamOverride(42L, 999L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("No pricing_policy with id 999");

        verify(extensionsRepo, never()).save(any(PaygTeamExtensions.class));
        verify(events, never()).publishEvent(any());
    }

    @Test
    void setTeamOverride_missingExtensionsRow_throws() {
        when(extensionsRepo.findById(42L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.setTeamOverride(42L, 2L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("payg_team_extensions row");
    }

    private static PricingPolicy policy(Long id, String version, boolean isDefault) {
        PricingPolicy p = new PricingPolicy();
        p.setId(id);
        p.setVersion(version);
        p.setEffectiveFrom(LocalDateTime.now());
        p.setDocPagesPerUnit(25);
        p.setDocBytesPerUnit(5L * 1024 * 1024);
        p.setMinChargeUnits(1);
        p.setFileUnitCap(1000);
        p.setIsDefault(isDefault);
        return p;
    }
}

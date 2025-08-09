package stirling.software.proprietary.security.service;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.security.repository.OrganizationRepository;

@Service
@RequiredArgsConstructor
public class OrganizationService {

    private final OrganizationRepository organizationRepository;

    public static final String DEFAULT_ORG_NAME = "Default Organization";
    public static final String INTERNAL_ORG_NAME = "Internal Organization";

    public Organization getOrCreateDefaultOrganization() {
        return organizationRepository
                .findByName(DEFAULT_ORG_NAME)
                .orElseGet(
                        () -> {
                            Organization defaultOrg = new Organization();
                            defaultOrg.setName(DEFAULT_ORG_NAME);
                            defaultOrg.setDescription("Default organization for initial setup");
                            return organizationRepository.save(defaultOrg);
                        });
    }

    public Organization getOrCreateInternalOrganization() {
        return organizationRepository
                .findByName(INTERNAL_ORG_NAME)
                .orElseGet(
                        () -> {
                            Organization internalOrg = new Organization();
                            internalOrg.setName(INTERNAL_ORG_NAME);
                            internalOrg.setDescription(
                                    "Internal organization for system operations");
                            return organizationRepository.save(internalOrg);
                        });
    }
}

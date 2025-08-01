package stirling.software.proprietary.security.controller.api;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.model.Organization;
import stirling.software.proprietary.model.dto.OrganizationWithTeamCountDTO;
import stirling.software.proprietary.security.repository.OrganizationRepository;
import stirling.software.proprietary.security.service.OrganizationService;
import stirling.software.proprietary.security.service.RoleBasedAuthorizationService;

@RestController
@RequestMapping("/api/v1/organizations")
@RequiredArgsConstructor
public class OrganizationController {

    private final OrganizationRepository organizationRepository;
    private final OrganizationService organizationService;
    private final RoleBasedAuthorizationService authorizationService;

    @GetMapping
    public ResponseEntity<List<OrganizationWithTeamCountDTO>> getAllOrganizations() {
        if (!authorizationService.canManageOrganizations()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        List<OrganizationWithTeamCountDTO> organizations =
                organizationRepository.findAllOrganizationsWithTeamCount();
        return ResponseEntity.ok(organizations);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Organization> getOrganization(@PathVariable Long id) {
        Optional<Organization> organizationOpt = organizationRepository.findById(id);
        if (organizationOpt.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Organization organization = organizationOpt.get();
        if (!authorizationService.canViewOrganization(organization)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        return ResponseEntity.ok(organization);
    }

    @PostMapping
    public ResponseEntity<?> createOrganization(@RequestBody Organization organization) {
        if (!authorizationService.canManageOrganizations()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to create organizations");
        }

        if (organizationRepository.existsByNameIgnoreCase(organization.getName())) {
            return ResponseEntity.badRequest()
                    .body("Organization with name '" + organization.getName() + "' already exists");
        }
        Organization savedOrganization = organizationRepository.save(organization);
        return ResponseEntity.status(HttpStatus.CREATED).body(savedOrganization);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> updateOrganization(
            @PathVariable Long id, @RequestBody Organization organization) {
        if (!authorizationService.canManageOrganizations()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to update organizations");
        }

        Optional<Organization> existingOrganization = organizationRepository.findById(id);
        if (existingOrganization.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        if (organizationRepository.existsByNameIgnoreCase(organization.getName())
                && !existingOrganization.get().getName().equalsIgnoreCase(organization.getName())) {
            return ResponseEntity.badRequest()
                    .body("Organization with name '" + organization.getName() + "' already exists");
        }

        organization.setId(id);
        Organization savedOrganization = organizationRepository.save(organization);
        return ResponseEntity.ok(savedOrganization);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteOrganization(@PathVariable Long id) {
        if (!authorizationService.canManageOrganizations()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body("Not authorized to delete organizations");
        }

        Optional<Organization> organization = organizationRepository.findById(id);
        if (organization.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        // Prevent deletion of default organizations
        if (OrganizationService.DEFAULT_ORG_NAME.equals(organization.get().getName())
                || OrganizationService.INTERNAL_ORG_NAME.equals(organization.get().getName())) {
            return ResponseEntity.badRequest().body("Cannot delete system organizations");
        }

        if (!organization.get().getTeams().isEmpty()) {
            return ResponseEntity.badRequest()
                    .body("Cannot delete organization with existing teams");
        }

        organizationRepository.deleteById(id);
        return ResponseEntity.ok().build();
    }
}

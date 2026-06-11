package stirling.software.proprietary.policy.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.UserServiceInterface;

/** Self-hosted: the manage-all-policies role is a global admin. */
@ExtendWith(MockitoExtension.class)
class AdminPolicyManagementAuthorityTest {

    @Mock private UserServiceInterface userService;

    @Test
    void adminMayManageAllPolicies() {
        when(userService.isCurrentUserAdmin()).thenReturn(true);
        assertTrue(new AdminPolicyManagementAuthority(userService).canManageAllPolicies());
    }

    @Test
    void nonAdminMayNot() {
        when(userService.isCurrentUserAdmin()).thenReturn(false);
        assertFalse(new AdminPolicyManagementAuthority(userService).canManageAllPolicies());
    }
}

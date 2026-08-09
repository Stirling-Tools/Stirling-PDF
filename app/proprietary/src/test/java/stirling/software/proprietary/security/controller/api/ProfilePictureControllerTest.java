package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.ProfilePictureService;
import stirling.software.proprietary.security.service.ProfilePictureService.StoredImage;
import stirling.software.proprietary.security.service.UserService;

/**
 * The visibility rule lives in the service, but the controller is what applies it. These pin the
 * glue: feed the batch the filtered id set, and never confirm an avatar the caller may not see.
 */
@ExtendWith(MockitoExtension.class)
class ProfilePictureControllerTest {

    @Mock private ProfilePictureService profilePictureService;
    @Mock private UserService userService;

    private MockMvc mockMvc;

    private static final Principal VIEWER = () -> "viewer";

    @BeforeEach
    void setUp() {
        mockMvc =
                MockMvcBuilders.standaloneSetup(
                                new ProfilePictureController(profilePictureService, userService))
                        .build();
        User viewer = new User();
        viewer.setId(1L);
        viewer.setUsername("viewer");
        // lenient: the unknown-principal case never resolves this one.
        lenient()
                .when(userService.findByUsernameIgnoreCase("viewer"))
                .thenReturn(Optional.of(viewer));
    }

    @Test
    void theBatchOnlyLooksUpThumbnailsForIdsTheViewerMaySee() throws Exception {
        when(profilePictureService.visibleUserIds(any(), anyCollection()))
                .thenReturn(Set.of(1L, 2L));
        when(profilePictureService.thumbnailDataUrls(anyCollection()))
                .thenReturn(
                        Map.of(1L, "data:image/png;base64,AQID", 2L, "data:image/png;base64,BAUG"));

        mockMvc.perform(
                        get("/api/v1/user/profile-pictures")
                                .param("userIds", "1,2,3")
                                .principal(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.1").exists())
                .andExpect(jsonPath("$.2").exists())
                .andExpect(jsonPath("$.3").doesNotExist());

        // The load-bearing assertion: passing the unfiltered ids here would leak every avatar, and
        // thumbnailDataUrls does no filtering of its own.
        ArgumentCaptor<Collection<Long>> looked = ArgumentCaptor.forClass(Collection.class);
        verify(profilePictureService).thumbnailDataUrls(looked.capture());
        assertThat(looked.getValue()).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void theBatchIsCappedSoOneRequestCannotSweepAWholeInstall() throws Exception {
        when(profilePictureService.visibleUserIds(any(), anyCollection())).thenReturn(Set.of());
        when(profilePictureService.thumbnailDataUrls(anyCollection())).thenReturn(Map.of());
        // Duplicated ids also exercise the distinct() pass before the cap applies.
        String ids =
                LongStream.rangeClosed(1, 600)
                        .boxed()
                        .flatMap(id -> List.of(id, id).stream())
                        .map(String::valueOf)
                        .collect(Collectors.joining(","));

        mockMvc.perform(
                        get("/api/v1/user/profile-pictures")
                                .param("userIds", ids)
                                .principal(VIEWER))
                .andExpect(status().isOk());

        ArgumentCaptor<Collection<Long>> requested = ArgumentCaptor.forClass(Collection.class);
        verify(profilePictureService).visibleUserIds(any(), requested.capture());
        assertThat(requested.getValue()).hasSize(500);
    }

    @Test
    void anEmptyIdListSkipsTheServiceEntirely() throws Exception {
        mockMvc.perform(get("/api/v1/user/profile-pictures").param("userIds", "").principal(VIEWER))
                .andExpect(status().isOk());

        verify(profilePictureService, never()).thumbnailDataUrls(anyCollection());
    }

    @Test
    void ownPictureIsA404WhenThereIsNoneRatherThanAnEmptyBody() throws Exception {
        when(profilePictureService.findImage(1L)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/v1/user/profile-picture").principal(VIEWER))
                .andExpect(status().isNotFound());
    }

    @Test
    void ownPictureIsNeverCached() throws Exception {
        // Every user shares this URI, so a cached copy would follow the browser profile, not the
        // account.
        when(profilePictureService.findImage(1L))
                .thenReturn(Optional.of(new StoredImage(new byte[] {1, 2, 3}, "image/png")));

        mockMvc.perform(get("/api/v1/user/profile-picture").principal(VIEWER))
                .andExpect(status().isOk())
                .andExpect(
                        result ->
                                assertThat(result.getResponse().getHeader("Cache-Control"))
                                        .contains("no-store"));
    }

    @Test
    void anUnknownPrincipalGetsA401RatherThanAnEmptyRoster() throws Exception {
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        mockMvc.perform(
                        get("/api/v1/user/profile-pictures")
                                .param("userIds", "1")
                                .principal(() -> "ghost"))
                .andExpect(status().isUnauthorized());
    }
}

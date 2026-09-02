package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
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
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.service.ProfilePictureService;
import stirling.software.proprietary.security.service.ProfilePictureService.InvalidProfilePictureException;
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
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(
                        result ->
                                assertThat(result.getResponse().getHeader("Cache-Control"))
                                        .contains("no-store"));
    }

    @Test
    void aStoredTypeThatIsNotAMediaTypeStillServesAsPngRatherThanA500() throws Exception {
        // Nothing writes this today, but parsing the column back would turn a bad row into a 500.
        when(profilePictureService.findImage(1L))
                .thenReturn(Optional.of(new StoredImage(new byte[] {1, 2, 3}, "not a media type")));

        mockMvc.perform(get("/api/v1/user/profile-picture").principal(VIEWER))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG));
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

    @Test
    void uploadStoresAgainstTheResolvedUserNotTheRequest() throws Exception {
        mockMvc.perform(multipart("/api/v1/user/profile-picture").file(png()).principal(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasProfilePicture").value(true));

        // The load-bearing assertion: the account written to comes from the principal, so a
        // request cannot aim the upload at somebody else.
        ArgumentCaptor<User> stored = ArgumentCaptor.forClass(User.class);
        verify(profilePictureService).store(stored.capture(), any(MultipartFile.class));
        assertThat(stored.getValue().getId()).isEqualTo(1L);
    }

    @Test
    void aRejectedUploadIsA400CarryingTheReasonRatherThanA500() throws Exception {
        doThrow(new InvalidProfilePictureException("Image is larger than 5MB"))
                .when(profilePictureService)
                .store(any(), any(MultipartFile.class));

        mockMvc.perform(multipart("/api/v1/user/profile-picture").file(png()).principal(VIEWER))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("invalidImage"))
                .andExpect(jsonPath("$.message").value("Image is larger than 5MB"));
    }

    @Test
    void uploadFromAnUnknownPrincipalStoresNothing() throws Exception {
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        mockMvc.perform(
                        multipart("/api/v1/user/profile-picture")
                                .file(png())
                                .principal(() -> "ghost"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(profilePictureService);
    }

    @Test
    void removeDeletesTheSignedInUsersOwnPicture() throws Exception {
        mockMvc.perform(delete("/api/v1/user/profile-picture").principal(VIEWER))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasProfilePicture").value(false));

        verify(profilePictureService).delete(1L);
    }

    @Test
    void removeFromAnUnknownPrincipalDeletesNothing() throws Exception {
        when(userService.findByUsernameIgnoreCase("ghost")).thenReturn(Optional.empty());

        mockMvc.perform(delete("/api/v1/user/profile-picture").principal(() -> "ghost"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(profilePictureService);
    }

    private static MockMultipartFile png() {
        return new MockMultipartFile("file", "avatar.png", "image/png", new byte[] {1, 2, 3});
    }
}

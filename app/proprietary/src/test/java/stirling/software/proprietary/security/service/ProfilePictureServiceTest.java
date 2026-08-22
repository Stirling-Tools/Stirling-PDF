package stirling.software.proprietary.security.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.UserProfilePictureRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.Authority;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.UserProfilePicture;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;
import stirling.software.proprietary.security.service.ProfilePictureService.InvalidProfilePictureException;

@ExtendWith(MockitoExtension.class)
class ProfilePictureServiceTest {

    @Mock private UserProfilePictureRepository profilePictureRepository;
    @Mock private TeamMembershipRepository teamMembershipRepository;
    @Mock private UserRepository userRepository;

    private ProfilePictureService service;

    @BeforeEach
    void setUp() {
        service =
                new ProfilePictureService(
                        profilePictureRepository, teamMembershipRepository, userRepository);
    }

    private static User user(Long id, String... authorities) {
        User user = new User();
        user.setId(id);
        user.setUsername("user" + id);
        for (String authority : authorities) {
            Authority granted = new Authority();
            granted.setAuthority(authority);
            user.addAuthority(granted);
        }
        return user;
    }

    private static byte[] pngBytes(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.RED);
        g.fillRect(0, 0, width, height);
        g.dispose();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    @Test
    void storeNormalisesToTwoFixedSquareSizes() throws IOException {
        User owner = user(1L);
        when(profilePictureRepository.findById(1L)).thenReturn(Optional.empty());
        when(profilePictureRepository.save(any(UserProfilePicture.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        // Deliberately non-square and oversized so both the crop and the downscale are exercised.
        MockMultipartFile file =
                new MockMultipartFile("file", "me.png", "image/png", pngBytes(900, 400));
        service.store(owner, file);

        ArgumentCaptor<UserProfilePicture> saved =
                ArgumentCaptor.forClass(UserProfilePicture.class);
        org.mockito.Mockito.verify(profilePictureRepository).save(saved.capture());
        UserProfilePicture picture = saved.getValue();

        assertThat(picture.getUserId()).isEqualTo(1L);
        assertThat(picture.getContentType()).isEqualTo("image/png");

        BufferedImage avatar = ImageIO.read(new ByteArrayInputStream(picture.getImageData()));
        assertThat(avatar.getWidth()).isEqualTo(ProfilePictureService.AVATAR_SIZE);
        assertThat(avatar.getHeight()).isEqualTo(ProfilePictureService.AVATAR_SIZE);

        BufferedImage thumbnail =
                ImageIO.read(new ByteArrayInputStream(picture.getThumbnailData()));
        assertThat(thumbnail.getWidth()).isEqualTo(ProfilePictureService.THUMBNAIL_SIZE);
        assertThat(thumbnail.getHeight()).isEqualTo(ProfilePictureService.THUMBNAIL_SIZE);
    }

    @Test
    void storeRejectsAFileThatIsNotAnImage() {
        MockMultipartFile file =
                new MockMultipartFile(
                        "file",
                        "payload.png",
                        "image/png",
                        "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service.store(user(1L), file))
                .isInstanceOf(InvalidProfilePictureException.class)
                .hasMessageContaining("Unsupported image format");
    }

    @Test
    void storeRejectsAnSvgEvenThoughImageIoCanRasteriseOne() {
        // The app ships TwelveMonkeys' Batik plugin, so ImageIO.read() would happily render this
        // scriptable document. Only PNG/JPEG/WebP signatures may reach a reader.
        String svg =
                "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"64\" height=\"64\">"
                        + "<script>alert(1)</script></svg>";
        MockMultipartFile file =
                new MockMultipartFile(
                        "file", "avatar.png", "image/png", svg.getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service.store(user(1L), file))
                .isInstanceOf(InvalidProfilePictureException.class)
                .hasMessageContaining("Unsupported image format");
    }

    @Test
    void anExtremeAspectRatioStillDecodesOnlyTheCentreSquare() {
        // Subsampling alone is bounded by the SHORT edge, so on a 50000x1000 frame the step is 1
        // and the whole ~200MB raster would be decoded. The region is what keeps it bounded.
        Rectangle region = ProfilePictureService.centreSquare(50000, 1000);
        assertThat(region.width).isEqualTo(1000);
        assertThat(region.height).isEqualTo(1000);
        assertThat(region.x).isEqualTo(24500);
        assertThat(region.y).isZero();

        long decodedPixels =
                (long) region.width
                        * region.height
                        / (long) Math.pow(ProfilePictureService.subsamplingStep(region.width), 2);
        assertThat(decodedPixels).isLessThan(2_000_000L);
    }

    @Test
    void aSquareBombIsSubsampledDownToRoughlyTwiceTheTargetEdge() {
        Rectangle region = ProfilePictureService.centreSquare(7000, 7000);
        int step = ProfilePictureService.subsamplingStep(region.width);

        assertThat(region.width / step)
                .isBetween(
                        ProfilePictureService.AVATAR_SIZE, 3 * ProfilePictureService.AVATAR_SIZE);
    }

    @Test
    void anImageAlreadySmallerThanTheTargetIsNotSubsampled() {
        assertThat(ProfilePictureService.subsamplingStep(200)).isEqualTo(1);
    }

    @Test
    void storeRejectsAnEmptyUpload() {
        MockMultipartFile file = new MockMultipartFile("file", "me.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> service.store(user(1L), file))
                .isInstanceOf(InvalidProfilePictureException.class);
    }

    @Test
    void storeAcceptsAJpegAndStillWritesPng() throws IOException {
        User owner = user(1L);
        when(profilePictureRepository.findById(1L)).thenReturn(Optional.empty());
        when(profilePictureRepository.save(any(UserProfilePicture.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        BufferedImage source = new BufferedImage(120, 80, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream jpeg = new ByteArrayOutputStream();
        ImageIO.write(source, "jpeg", jpeg);
        MockMultipartFile file =
                new MockMultipartFile("file", "me.jpg", "image/jpeg", jpeg.toByteArray());

        service.store(owner, file);

        ArgumentCaptor<UserProfilePicture> saved =
                ArgumentCaptor.forClass(UserProfilePicture.class);
        org.mockito.Mockito.verify(profilePictureRepository).save(saved.capture());
        assertThat(saved.getValue().getContentType()).isEqualTo("image/png");
        assertThat(ImageIO.read(new ByteArrayInputStream(saved.getValue().getImageData())))
                .isNotNull();
    }

    @Test
    void everyoneCanSeeTheirOwnPicture() {
        User viewer = user(7L);
        stubNoTeams();

        assertThat(service.visibleUserIds(viewer, List.of(7L))).containsExactly(7L);
    }

    @Test
    void adminsCanSeeEveryPicture() {
        User admin = user(1L, Role.ADMIN.getRoleId());

        assertThat(service.visibleUserIds(admin, List.of(99L))).containsExactly(99L);
    }

    @Test
    void teammatesCanSeeEachOther() {
        User viewer = user(1L, Role.USER.getRoleId());
        when(teamMembershipRepository.findUserTeamPairs(anyCollection()))
                .thenReturn(List.of(new Object[] {1L, 50L}, new Object[] {2L, 50L}));
        when(userRepository.findPrimaryTeamIdsByUserIds(anyCollection())).thenReturn(List.of());

        assertThat(service.visibleUserIds(viewer, List.of(2L))).containsExactly(2L);
    }

    @Test
    void aUserOnAnotherTeamIsNotVisible() {
        User viewer = user(1L, Role.USER.getRoleId());
        when(teamMembershipRepository.findUserTeamPairs(anyCollection()))
                .thenReturn(List.of(new Object[] {1L, 50L}, new Object[] {3L, 51L}));
        when(userRepository.findPrimaryTeamIdsByUserIds(anyCollection())).thenReturn(List.of());

        assertThat(service.visibleUserIds(viewer, List.of(3L))).isEmpty();
    }

    @Test
    void theLegacyPrimaryTeamAlsoCountsAsSharedMembership() {
        // An install predating team_memberships still has users.team_id; both are consulted.
        User viewer = user(1L, Role.USER.getRoleId());
        when(teamMembershipRepository.findUserTeamPairs(anyCollection())).thenReturn(List.of());
        when(userRepository.findPrimaryTeamIdsByUserIds(anyCollection()))
                .thenReturn(List.of(new Object[] {1L, 50L}, new Object[] {4L, 50L}));

        assertThat(service.visibleUserIds(viewer, List.of(4L))).containsExactly(4L);
    }

    @Test
    void visibleUserIdsFiltersOutStrangers() {
        User viewer = user(1L, Role.USER.getRoleId());
        when(teamMembershipRepository.findUserTeamPairs(anyCollection()))
                .thenReturn(
                        List.of(
                                new Object[] {1L, 50L},
                                new Object[] {2L, 50L},
                                new Object[] {3L, 51L}));
        when(userRepository.findPrimaryTeamIdsByUserIds(anyCollection())).thenReturn(List.of());

        assertThat(service.visibleUserIds(viewer, List.of(1L, 2L, 3L))).isEqualTo(Set.of(1L, 2L));
    }

    @Test
    void anAnonymousViewerSeesNothing() {
        assertThat(service.visibleUserIds(null, List.of(1L, 2L))).isEmpty();
    }

    @Test
    void thumbnailsAreReturnedAsPngDataUrls() {
        byte[] bytes = {1, 2, 3};
        when(profilePictureRepository.findThumbnailsByUserIds(anyCollection()))
                .thenReturn(List.<Object[]>of(new Object[] {5L, bytes}));

        assertThat(service.thumbnailDataUrls(List.of(5L)))
                .containsEntry(5L, "data:image/png;base64,AQID");
    }

    private void stubNoTeams() {
        lenient()
                .when(teamMembershipRepository.findUserTeamPairs(anyCollection()))
                .thenReturn(List.of());
        lenient()
                .when(userRepository.findPrimaryTeamIdsByUserIds(anyCollection()))
                .thenReturn(List.of());
    }
}

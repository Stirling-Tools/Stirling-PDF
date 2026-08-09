package stirling.software.proprietary.security.service;

import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.security.database.repository.UserProfilePictureRepository;
import stirling.software.proprietary.security.database.repository.UserRepository;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.security.model.UserProfilePicture;
import stirling.software.proprietary.security.repository.TeamMembershipRepository;

/**
 * Per-user avatars. Uploads are re-encoded, never stored as sent, so EXIF and polyglot payloads
 * don't survive. Visible to yourself, to admins, and to people you share a team with; nobody else.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProfilePictureService {

    /** Stored avatar edge length, used by the account page and the sidebar. */
    public static final int AVATAR_SIZE = 256;

    /** Roster thumbnail edge length; small enough to inline as a data URL. */
    public static final int THUMBNAIL_SIZE = 64;

    /** Largest upload accepted before decoding. */
    public static final long MAX_UPLOAD_BYTES = 5L * 1024 * 1024;

    /** Sanity bound on the header; the region+subsampling read in decode() bounds the memory. */
    private static final long MAX_SOURCE_PIXELS = 50_000_000L;

    private static final String PNG = "image/png";

    private static final byte[] PNG_SIGNATURE = {
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A
    };
    private static final byte[] JPEG_SIGNATURE = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] RIFF_SIGNATURE = {'R', 'I', 'F', 'F'};

    private final UserProfilePictureRepository profilePictureRepository;
    private final TeamMembershipRepository teamMembershipRepository;
    private final UserRepository userRepository;

    /** Thrown when an upload is missing, too large, or not a decodable image. */
    public static class InvalidProfilePictureException extends RuntimeException {
        public InvalidProfilePictureException(String message) {
            super(message);
        }
    }

    /** A stored avatar ready to serve. */
    public record StoredImage(byte[] data, String contentType) {}

    @Transactional(readOnly = true)
    public Optional<StoredImage> findImage(Long userId) {
        if (userId == null) {
            return Optional.empty();
        }
        List<Object[]> rows = profilePictureRepository.findImageByUserId(userId);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Object[] row = rows.get(0);
        byte[] data = (byte[]) row[0];
        if (data == null || data.length == 0) {
            return Optional.empty();
        }
        return Optional.of(new StoredImage(data, (String) row[1]));
    }

    /**
     * Which of {@code userIds} have an avatar. Rosters use this without loading any image bytes.
     */
    @Transactional(readOnly = true)
    public Set<Long> withPicture(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(profilePictureRepository.findUserIdsWithPicture(userIds));
    }

    /**
     * Thumbnails as {@code data:image/png;base64,...}, keyed by user id. Missing rows are absent.
     */
    @Transactional(readOnly = true)
    public Map<Long, String> thumbnailDataUrls(Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, String> result = new LinkedHashMap<>();
        for (Object[] row : profilePictureRepository.findThumbnailsByUserIds(userIds)) {
            byte[] data = (byte[]) row[1];
            if (data != null && data.length > 0) {
                result.put(
                        (Long) row[0],
                        "data:" + PNG + ";base64," + Base64.getEncoder().encodeToString(data));
            }
        }
        return result;
    }

    /**
     * Validates, re-encodes and stores {@code file} as {@code user}'s avatar, replacing any prior.
     */
    @Transactional
    public void store(User user, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidProfilePictureException("No image was uploaded");
        }
        if (file.getSize() > MAX_UPLOAD_BYTES) {
            throw new InvalidProfilePictureException(
                    "Image is larger than " + (MAX_UPLOAD_BYTES / (1024 * 1024)) + "MB");
        }

        BufferedImage source = decode(file);
        byte[] avatar = encodePng(resizeSquare(source, AVATAR_SIZE));
        byte[] thumbnail = encodePng(resizeSquare(source, THUMBNAIL_SIZE));

        UserProfilePicture picture =
                profilePictureRepository
                        .findById(user.getId())
                        .orElseGet(
                                () -> {
                                    UserProfilePicture fresh = new UserProfilePicture();
                                    fresh.setUserId(user.getId());
                                    return fresh;
                                });
        picture.setImageData(avatar);
        picture.setThumbnailData(thumbnail);
        picture.setContentType(PNG);
        profilePictureRepository.save(picture);
    }

    @Transactional
    public void delete(Long userId) {
        if (userId != null) {
            profilePictureRepository.deleteByUserId(userId);
        }
    }

    /** The subset of {@code targetUserIds} {@code viewer} may see, applying the same rule. */
    @Transactional(readOnly = true)
    public Set<Long> visibleUserIds(User viewer, Collection<Long> targetUserIds) {
        if (viewer == null || viewer.getId() == null || targetUserIds == null) {
            return Set.of();
        }
        if (isAdmin(viewer)) {
            return new HashSet<>(targetUserIds);
        }
        Set<Long> lookups = new HashSet<>(targetUserIds);
        lookups.remove(null);
        lookups.add(viewer.getId());
        Map<Long, Set<Long>> teamsByUser = teamIds(lookups);
        Set<Long> viewerTeams = teamsByUser.getOrDefault(viewer.getId(), Set.of());

        Set<Long> visible = new HashSet<>();
        for (Long targetId : targetUserIds) {
            if (targetId == null) {
                continue;
            }
            if (viewer.getId().equals(targetId)
                    || !Collections.disjoint(
                            viewerTeams, teamsByUser.getOrDefault(targetId, Set.of()))) {
                visible.add(targetId);
            }
        }
        return visible;
    }

    private boolean isAdmin(User user) {
        return user.getAuthorities().stream()
                .anyMatch(authority -> Role.ADMIN.getRoleId().equals(authority.getAuthority()));
    }

    /**
     * Team ids per user, from both membership rows and the primary users.team_id. Both are
     * consulted because an install can carry a primary team that predates the membership table.
     */
    private Map<Long, Set<Long>> teamIds(Collection<Long> userIds) {
        Map<Long, Set<Long>> byUser = new HashMap<>();
        for (Object[] row : teamMembershipRepository.findUserTeamPairs(userIds)) {
            byUser.computeIfAbsent((Long) row[0], key -> new HashSet<>()).add((Long) row[1]);
        }
        for (Object[] row : userRepository.findPrimaryTeamIdsByUserIds(userIds)) {
            byUser.computeIfAbsent((Long) row[0], key -> new HashSet<>()).add((Long) row[1]);
        }
        return byUser;
    }

    /**
     * Decodes an upload, picking the reader by signature rather than letting {@code ImageIO.read}
     * choose: the app ships TwelveMonkeys' Batik plugin, which would rasterise a scriptable SVG
     * renamed to .png. Dimensions come from the header, so a bomb is refused before it allocates.
     */
    private BufferedImage decode(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            log.debug("Profile picture upload could not be read", e);
            throw new InvalidProfilePictureException("The file could not be read");
        }

        String format = sniffFormat(bytes);
        if (format == null) {
            throw new InvalidProfilePictureException(
                    "Unsupported image format - use PNG, JPEG or WebP");
        }

        Iterator<ImageReader> readers = ImageIO.getImageReadersByFormatName(format);
        if (!readers.hasNext()) {
            throw new InvalidProfilePictureException(
                    "No decoder available for " + format.toUpperCase(Locale.ROOT) + " images");
        }
        ImageReader reader = readers.next();
        try (ImageInputStream in =
                ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            reader.setInput(in, true, true);
            int width = reader.getWidth(0);
            int height = reader.getHeight(0);
            if (width <= 0 || height <= 0 || (long) width * height > MAX_SOURCE_PIXELS) {
                throw new InvalidProfilePictureException("Image dimensions are too large");
            }
            Rectangle region = centreSquare(width, height);
            int step = subsamplingStep(region.width);
            ImageReadParam params = reader.getDefaultReadParam();
            params.setSourceRegion(region);
            params.setSourceSubsampling(step, step, 0, 0);
            return reader.read(0, params);
        } catch (IOException | RuntimeException e) {
            if (e instanceof InvalidProfilePictureException invalid) {
                throw invalid;
            }
            log.debug("Profile picture upload could not be decoded", e);
            throw new InvalidProfilePictureException("The file could not be read as an image");
        } finally {
            reader.dispose();
        }
    }

    /**
     * The centre square we are going to keep anyway. Read as a region, not just subsampled, because
     * the step below is bounded by the SHORT edge: a 50000x1000 PNG is a few KB on the wire, clears
     * the pixel cap, and would still decode to ~200MB if we read the whole frame.
     */
    static Rectangle centreSquare(int width, int height) {
        int edge = Math.min(width, height);
        return new Rectangle((width - edge) / 2, (height - edge) / 2, edge, edge);
    }

    /** Largest decode step that still leaves ~2x the target edge to scale down from. */
    static int subsamplingStep(int edge) {
        return Math.max(1, edge / (2 * AVATAR_SIZE));
    }

    /**
     * The ImageIO format name for the bytes, by signature - or null when it isn't one of the three
     * formats we accept. Deliberately ignores the client-supplied filename and content type.
     */
    private static String sniffFormat(byte[] bytes) {
        if (startsWith(bytes, PNG_SIGNATURE)) {
            return "png";
        }
        if (startsWith(bytes, JPEG_SIGNATURE)) {
            return "jpeg";
        }
        // RIFF....WEBP
        if (bytes.length >= 12
                && startsWith(bytes, RIFF_SIGNATURE)
                && bytes[8] == 'W'
                && bytes[9] == 'E'
                && bytes[10] == 'B'
                && bytes[11] == 'P') {
            return "webp";
        }
        return null;
    }

    private static boolean startsWith(byte[] bytes, byte[] prefix) {
        if (bytes.length < prefix.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (bytes[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    /**
     * Centre-crops to a square then scales to {@code size}, drawn on white so alpha never bleeds.
     */
    private static BufferedImage resizeSquare(BufferedImage source, int size) {
        int edge = Math.min(source.getWidth(), source.getHeight());
        int x = (source.getWidth() - edge) / 2;
        int y = (source.getHeight() - edge) / 2;
        BufferedImage square = source.getSubimage(x, y, edge, edge);

        BufferedImage scaled = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = scaled.createGraphics();
        try {
            g.setRenderingHint(
                    RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(square, 0, 0, size, size, null);
        } finally {
            g.dispose();
        }
        return scaled;
    }

    private static byte[] encodePng(BufferedImage image) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            if (!ImageIO.write(image, "png", out)) {
                log.warn("No PNG writer available; profile picture could not be encoded");
                throw new InvalidProfilePictureException("Could not encode the image");
            }
        } catch (IOException e) {
            // The input is an image we just built, so this is ours, not the user's.
            log.warn("Profile picture could not be encoded as PNG", e);
            throw new InvalidProfilePictureException("Could not encode the image");
        }
        return out.toByteArray();
    }
}

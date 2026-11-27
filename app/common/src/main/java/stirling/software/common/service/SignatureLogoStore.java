package stirling.software.common.service;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Iterator;
import java.util.Optional;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.util.ExceptionUtils;

/**
 * The logo drawn faded behind visible certificate signatures: the bundled Stirling PDF logo unless
 * an admin has uploaded the organisation's, which is kept as a PNG under customFiles so it survives
 * upgrades. Uploads are PNG or JPEG, decoded and re-encoded so the stored file carries no metadata
 * and every reader gets a plain PNG.
 */
@Service
public class SignatureLogoStore {

    static final int MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
    private static final String DEFAULT_LOGO = "static/images/signature.png";
    static final int MAX_DIMENSION = 4096;

    private final Path file;

    @Autowired
    public SignatureLogoStore() {
        this(Path.of(InstallationPathConfig.getCustomFilesPath(), "signature", "logo.png"));
    }

    SignatureLogoStore(Path file) {
        this.file = file;
    }

    /** The logo to draw: the uploaded one, or else the bundled Stirling PDF logo. */
    public byte[] effective() throws IOException {
        Optional<byte[]> custom = read();
        if (custom.isPresent()) {
            return custom.get();
        }
        try (InputStream in = new ClassPathResource(DEFAULT_LOGO).getInputStream()) {
            return in.readAllBytes();
        }
    }

    /** The uploaded logo, or empty when the bundled one is in use. */
    public Optional<byte[]> read() throws IOException {
        if (!Files.isRegularFile(file)) {
            return Optional.empty();
        }
        return Optional.of(Files.readAllBytes(file));
    }

    /**
     * Replaces the logo.
     *
     * @throws IllegalArgumentException when the upload is not a PNG or JPEG, is over 2 MB, or is
     *     larger than 4096 pixels on a side
     */
    public void save(byte[] upload) throws IOException {
        byte[] png = toPng(upload, "logo");
        Files.createDirectories(file.getParent());
        Path temp = Files.createTempFile(file.getParent(), "logo", ".png");
        try {
            Files.write(temp, png);
            Files.move(
                    temp,
                    file,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    /** Removes the uploaded logo, so signatures go back to the bundled one. */
    public void delete() throws IOException {
        Files.deleteIfExists(file);
    }

    /**
     * {@code upload} as a plain PNG, for any image drawn on a signature.
     *
     * @param field the request field named in the error
     * @throws IllegalArgumentException when the upload is not a PNG or JPEG, is over 2 MB, or is
     *     larger than 4096 pixels on a side
     */
    public static byte[] toPng(byte[] upload, String field) throws IOException {
        BufferedImage image = decode(upload, field);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);
        return png.toByteArray();
    }

    /**
     * Refuses an upload over 2 MB from its declared size, before its bytes are read into memory.
     *
     * @param field the request field named in the error
     * @throws IllegalArgumentException when {@code size} is over 2 MB
     */
    public static void requireUploadSize(long size, String field) {
        if (size > MAX_UPLOAD_BYTES) {
            throw invalid(field, "the file is over 2 MB");
        }
    }

    private static BufferedImage decode(byte[] upload, String field) throws IOException {
        if (upload == null || upload.length == 0) {
            throw invalid(field, "the file is empty");
        }
        requireUploadSize(upload.length, field);
        if (!isPng(upload) && !isJpeg(upload)) {
            throw invalid(field, "the file must be a PNG or JPEG image");
        }
        // Size is checked from the header before decoding, so a small file that claims a huge
        // canvas cannot exhaust memory.
        try (ImageInputStream input =
                ImageIO.createImageInputStream(new ByteArrayInputStream(upload))) {
            if (input == null) {
                throw invalid(field, "the image could not be read");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                throw invalid(field, "the image could not be read");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                if (reader.getWidth(0) > MAX_DIMENSION || reader.getHeight(0) > MAX_DIMENSION) {
                    throw invalid(field, "the image is larger than 4096 pixels on a side");
                }
                return reader.read(0);
            } catch (IOException e) {
                throw invalid(field, "the image could not be read");
            } finally {
                reader.dispose();
            }
        }
    }

    private static boolean isPng(byte[] bytes) {
        return bytes.length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 'P'
                && bytes[2] == 'N'
                && bytes[3] == 'G';
    }

    private static boolean isJpeg(byte[] bytes) {
        return bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF;
    }

    private static IllegalArgumentException invalid(String field, String reason) {
        return ExceptionUtils.createIllegalArgumentException(
                "error.invalidArgument", "Invalid argument: {0}", field + " - " + reason);
    }
}

package stirling.software.SPDF.controller.api.misc;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.swagger.MultiFileResponse;
import stirling.software.SPDF.model.api.PDFExtractImagesRequest;
import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.tool.ToolArity;
import stirling.software.common.model.tool.ToolFormat;
import stirling.software.common.model.tool.ToolIO;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class ExtractImagesController {

    private static final int MAX_KEY_DEPTH = 32;
    private static final int MAX_KEY_NODES = 4096;

    private static final Set<COSName> DECODE_RELEVANT_IMAGE_KEYS =
            Set.of(
                    COSName.BITS_PER_COMPONENT,
                    COSName.COLORSPACE,
                    COSName.DECODE,
                    COSName.DECODE_PARMS,
                    COSName.FILTER,
                    COSName.HEIGHT,
                    COSName.IMAGE_MASK,
                    COSName.MASK,
                    COSName.MATTE,
                    COSName.SMASK,
                    COSName.SMASK_IN_DATA,
                    COSName.WIDTH);

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            value = "/extract-images",
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @MultiFileResponse
    @ToolIO(produces = ToolFormat.IMAGE, arity = ToolArity.SIMO)
    @Operation(
            summary = "Extract images from a PDF file",
            description =
                    "This endpoint extracts images from a given PDF file and returns them in a zip"
                            + " file. Users can specify the output image format.")
    public ResponseEntity<Resource> extractImages(@ModelAttribute PDFExtractImagesRequest request)
            throws IOException {
        MultipartFile file = request.getFileInput();
        String imageFormat = request.getFormat();

        String baseFilename = GeneralUtils.removeExtension(file.getOriginalFilename());
        ImageFingerprints fingerprints = new ImageFingerprints();

        TempFile zipFile = new TempFile(tempFileManager, ".zip");
        try (ZipOutputStream zipStream =
                        new ZipOutputStream(Files.newOutputStream(zipFile.getPath()));
                PDDocument pdfDoc = pdfDocumentFactory.load(file)) {

            zipStream.setLevel(Deflater.BEST_COMPRESSION);

            int totalPages = pdfDoc.getNumberOfPages();
            for (int pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                PDPage currentPage = pdfDoc.getPage(pageIndex);
                extractAndAddImagesToZip(
                        currentPage,
                        imageFormat,
                        baseFilename,
                        pageIndex + 1,
                        fingerprints,
                        zipStream);
            }
        } catch (Exception e) {
            zipFile.close();
            throw e;
        }

        return WebResponseUtils.zipFileToWebResponse(
                zipFile, baseFilename + "_extracted-images.zip");
    }

    private void extractAndAddImagesToZip(
            PDPage page,
            String imageFormat,
            String baseFilename,
            int pageNumber,
            ImageFingerprints fingerprints,
            ZipOutputStream zipOutput)
            throws IOException {
        if (page.getResources() == null || page.getResources().getXObjectNames() == null) {
            return;
        }

        int imageCount = 1;
        for (COSName resourceName : page.getResources().getXObjectNames()) {
            if (!page.getResources().isImageXObject(resourceName)) {
                continue;
            }

            try {
                PDImageXObject imageObject =
                        (PDImageXObject) page.getResources().getXObject(resourceName);

                if (!fingerprints.isFirstOccurrence(imageObject)) {
                    continue;
                }

                RenderedImage sourceImage = imageObject.getImage();
                RenderedImage outputImage = toWritableImage(sourceImage, imageFormat);

                String imagePath =
                        baseFilename
                                + "_page_"
                                + pageNumber
                                + "_"
                                + imageCount++
                                + "."
                                + imageFormat;

                zipOutput.putNextEntry(new ZipEntry(imagePath));
                if (!ImageIO.write(outputImage, imageFormat, zipOutput)) {
                    throw ExceptionUtils.createIllegalArgumentException(
                            "error.unsupportedImageFormat",
                            "No image writer is available for format {0}.",
                            imageFormat);
                }
                zipOutput.closeEntry();

            } catch (IOException e) {
                ExceptionUtils.logException("image extraction failed", e);
                throw ExceptionUtils.handlePdfException(e, "during image extraction");
            }
        }
    }

    /**
     * Per-document dedup state. A fingerprint is memoised against the image's COS object, so an
     * XObject drawn on every page is digested once for the document rather than once per page, and
     * an image that cannot be fingerprinted falls back to a key unique to that COS object, so it
     * deduplicates against itself without ever colliding with another image.
     */
    static final class ImageFingerprints {

        private final Map<COSBase, String> keysByImage = new IdentityHashMap<>();
        private final Set<String> extracted = new HashSet<>();
        private int unfingerprintableImages;
        private boolean failureLogged;

        boolean isFirstOccurrence(PDImageXObject image) {
            return extracted.add(keyFor(image));
        }

        String keyFor(PDImageXObject image) {
            COSBase imageCos = image.getCOSObject();
            String key = keysByImage.get(imageCos);
            if (key == null) {
                key = fingerprint(image);
                keysByImage.put(imageCos, key);
            }
            return key;
        }

        private String fingerprint(PDImageXObject image) {
            try {
                return imageContentKey(image);
            } catch (IOException | NoSuchAlgorithmException | RuntimeException e) {
                if (!failureLogged) {
                    failureLogged = true;
                    log.warn("Could not fingerprint embedded image, deduplicating by identity", e);
                }
                return "identity:" + unfingerprintableImages++;
            }
        }
    }

    /**
     * Content fingerprint identifying one embedded image, used to extract a repeated image only
     * once. Folds in the encoded stream and the image dictionary entries decoding depends on -
     * filters, colour space, decode array and masks - with indirect references resolved, so two
     * copies of the same image match while two images that merely share encoded bytes do not.
     * Entries that leave the decoded pixels unchanged, such as metadata and optional content, are
     * ignored so they cannot defeat the dedup.
     *
     * @throws IOException when a stream cannot be read, or the object graph exceeds the walk's node
     *     budget; the caller must fall back rather than treat the image as unique
     */
    private static String imageContentKey(PDImageXObject image)
            throws IOException, NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        KeyWalk walk = new KeyWalk();
        digestValue(digest, image.getCOSObject(), walk, 0);
        if (!image.isStencil()) {
            digestValue(digest, image.getColorSpace().getCOSObject(), walk, 0);
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    /**
     * Bounds one fingerprint walk. An indirect object is expanded at most once per walk and the
     * whole walk is capped at {@code MAX_KEY_NODES} nodes, so a shared sub-graph cannot be
     * re-walked once per incoming edge and a crafted graph cannot fan out exponentially within the
     * depth cap.
     */
    private static final class KeyWalk {

        private final Set<Long> expanded = new HashSet<>();
        private int remainingNodes = MAX_KEY_NODES;

        private void enterNode() throws IOException {
            if (--remainingNodes < 0) {
                throw new IOException(
                        "image object graph exceeds " + MAX_KEY_NODES + " fingerprint nodes");
            }
        }
    }

    private static void digestValue(MessageDigest digest, COSBase value, KeyWalk walk, int depth)
            throws IOException {
        if (value == null || depth > MAX_KEY_DEPTH) {
            digest.update((byte) 'x');
            return;
        }
        walk.enterNode();
        switch (value) {
            case COSObject reference -> {
                if (!walk.expanded.add(reference.getObjectNumber())) {
                    digest.update((byte) 'c');
                    return;
                }
                digestValue(digest, reference.getObject(), walk, depth + 1);
            }
            case COSStream stream -> {
                digest.update((byte) 's');
                try (InputStream raw = stream.createRawInputStream()) {
                    byte[] buffer = new byte[8192];
                    for (int read; (read = raw.read(buffer)) != -1; ) {
                        digest.update(buffer, 0, read);
                    }
                }
                digestDictionary(digest, stream, walk, depth);
            }
            case COSDictionary dictionary -> {
                digest.update((byte) 'd');
                digestDictionary(digest, dictionary, walk, depth);
            }
            case COSArray array -> {
                digest.update((byte) 'a');
                for (int i = 0; i < array.size(); i++) {
                    digestValue(digest, array.get(i), walk, depth + 1);
                }
            }
            case COSString text -> {
                digest.update((byte) 't');
                digest.update(text.getBytes());
            }
            case COSName name -> {
                digest.update((byte) 'n');
                digest.update(name.getName().getBytes(StandardCharsets.UTF_8));
            }
            default -> {
                digest.update((byte) 'v');
                digest.update(value.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
    }

    private static void digestDictionary(
            MessageDigest digest, COSDictionary dictionary, KeyWalk walk, int depth)
            throws IOException {
        boolean imageDictionary = COSName.IMAGE.equals(dictionary.getCOSName(COSName.SUBTYPE));
        List<COSName> keys = new ArrayList<>(dictionary.keySet());
        keys.sort(Comparator.comparing(COSName::getName));
        for (COSName key : keys) {
            if (COSName.LENGTH.equals(key)) {
                continue;
            }
            if (imageDictionary && !DECODE_RELEVANT_IMAGE_KEYS.contains(key)) {
                continue;
            }
            digest.update(key.getName().getBytes(StandardCharsets.UTF_8));
            digestValue(digest, dictionary.getItem(key), walk, depth + 1);
        }
    }

    /**
     * Returns an image ImageIO can write in {@code format}, reusing {@code source} when it is
     * already compatible. Redrawing costs a second full-size buffer, so it is avoided when the
     * decoded image already has the type the format needs.
     */
    private RenderedImage toWritableImage(RenderedImage source, String format) {
        int requiredType =
                "png".equalsIgnoreCase(format)
                        ? BufferedImage.TYPE_INT_ARGB
                        : BufferedImage.TYPE_INT_RGB;

        if (source instanceof BufferedImage buffered && buffered.getType() == requiredType) {
            return buffered;
        }

        BufferedImage result =
                new BufferedImage(source.getWidth(), source.getHeight(), requiredType);
        Graphics2D graphics = result.createGraphics();
        graphics.drawImage((Image) source, 0, 0, null);
        graphics.dispose();

        return result;
    }
}

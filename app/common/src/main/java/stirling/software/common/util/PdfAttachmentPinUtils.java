package stirling.software.common.util;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDNameTreeNode;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDFileSpecification;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationFileAttachment;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.misc.AttachmentPinSpec;

/**
 * Adds and reads clickable file-attachment pins on embedded files.
 *
 * <p>A pin is a {@link PDAnnotationFileAttachment} whose target is a file specification already in
 * the document's embedded-files name tree. Callers place pins after the embedded file exists, so
 * adding an attachment and pinning it in one batch is safe. Pins are replaced per filename: placing
 * a pin removes any earlier pin for the same file, which keeps the one-pin-per-attachment UI
 * unambiguous.
 */
@Slf4j
@UtilityClass
public class PdfAttachmentPinUtils {

    private static final float PIN_WIDTH = 18f;
    private static final float PIN_HEIGHT = 18f;

    /** Place pins that are visible on screen but not printed. */
    public static int applyPins(
            PDDocument document, List<AttachmentPinSpec> pins, Collection<String> removals)
            throws IOException {
        return applyPins(document, pins, removals, false);
    }

    /**
     * Replace pins for the listed filenames and add the supplied pins.
     *
     * <p>Removals run first, then each pin removes any earlier pin for its own filename before the
     * new annotation is added. Invalid pages, coordinates and missing embedded files are logged and
     * skipped; one bad pin never blocks the rest of the batch.
     *
     * <p>{@code printable} sets the PDF Print flag. PDF/A output needs it set, while ordinary
     * viewer pins stay non-printable.
     *
     * @return number of pins added
     */
    public static int applyPins(
            PDDocument document,
            List<AttachmentPinSpec> pins,
            Collection<String> removals,
            boolean printable)
            throws IOException {
        removePins(document, removals);
        if (pins == null || pins.isEmpty()) {
            return 0;
        }

        Map<String, PDComplexFileSpecification> embeddedFiles = embeddedFiles(document);
        int applied = 0;
        for (AttachmentPinSpec pin : pins) {
            if (!isValid(pin, document)) {
                log.warn("Skipping attachment pin with an invalid page or coordinates: {}", pin);
                continue;
            }

            PDComplexFileSpecification fileSpecification =
                    findFileSpecification(embeddedFiles, pin.filename());
            if (fileSpecification == null) {
                log.warn(
                        "Skipping attachment pin for '{}': embedded file not found",
                        pin.filename());
                continue;
            }

            removePins(document, List.of(pin.filename()));
            PDPage page = document.getPage(pin.pageIndex());
            PDRectangle rectangle = pinRectangle(page, pin.x(), pin.y());
            page.getAnnotations()
                    .add(
                            createAnnotation(
                                    document,
                                    fileSpecification,
                                    pin.filename(),
                                    rectangle,
                                    printable));
            applied++;
        }
        return applied;
    }

    /**
     * Merge pins already present in a document with pins explicitly requested for a new output.
     *
     * <p>Removed and deleted filenames are dropped. A requested pin replaces a preserved pin with
     * the same filename, so a caller can move an existing pin without leaving both behind. PDF/A
     * conversion needs this because the converted document starts without page annotations.
     */
    public static List<AttachmentPinSpec> mergePins(
            Collection<AttachmentPinSpec> preserved,
            Collection<AttachmentPinSpec> requested,
            Collection<String> removals) {
        Set<String> excluded = new HashSet<>();
        if (removals != null) {
            for (String filename : removals) {
                if (filename != null) {
                    excluded.add(filename.toLowerCase(Locale.ROOT));
                }
            }
        }

        Set<String> requestedNames = new HashSet<>();
        if (requested != null) {
            for (AttachmentPinSpec pin : requested) {
                if (pin != null && pin.filename() != null) {
                    requestedNames.add(pin.filename().toLowerCase(Locale.ROOT));
                }
            }
        }

        List<AttachmentPinSpec> merged = new ArrayList<>();
        if (preserved != null) {
            for (AttachmentPinSpec pin : preserved) {
                if (pin == null || pin.filename() == null) {
                    continue;
                }
                String filename = pin.filename().toLowerCase(Locale.ROOT);
                if (!excluded.contains(filename) && !requestedNames.contains(filename)) {
                    merged.add(pin);
                }
            }
        }
        if (requested != null) {
            merged.addAll(requested);
        }
        return merged;
    }

    /**
     * Find the first pin for each embedded file, keyed by lowercase filename.
     *
     * <p>The returned coordinates are normalized to the displayed page, matching {@link
     * AttachmentPinSpec}. The caller decides whether a pin belongs to a listed attachment.
     */
    public static Map<String, AttachmentPinSpec> findPins(PDDocument document) throws IOException {
        Map<String, AttachmentPinSpec> pins = new LinkedHashMap<>();
        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            PDPage page = document.getPage(pageIndex);
            for (PDAnnotation annotation : page.getAnnotations()) {
                if (!(annotation instanceof PDAnnotationFileAttachment fileAttachment)) {
                    continue;
                }
                String filename = fileSpecificationName(fileAttachment.getFile());
                if (filename == null || filename.isBlank()) {
                    continue;
                }
                String key = filename.toLowerCase(Locale.ROOT);
                if (pins.containsKey(key)) {
                    continue;
                }
                PDRectangle rectangle = fileAttachment.getRectangle();
                if (rectangle == null) {
                    continue;
                }
                pins.put(key, toNormalizedSpec(pageIndex, filename, page, rectangle));
            }
        }
        return pins;
    }

    /** Remove every file-attachment pin that targets one of the supplied filenames. */
    public static void removePins(PDDocument document, Collection<String> filenames)
            throws IOException {
        if (filenames == null || filenames.isEmpty()) {
            return;
        }
        Set<String> targets =
                filenames.stream()
                        .filter(Objects::nonNull)
                        .map(name -> name.toLowerCase(Locale.ROOT))
                        .collect(Collectors.toSet());
        if (targets.isEmpty()) {
            return;
        }

        // A rename changes the file-spec name but keeps the same dictionary. Match
        // that dictionary as well so removal by the new name still finds a pin that
        // was created under the old one.
        Set<COSDictionary> targetSpecs = new HashSet<>();
        embeddedFiles(document)
                .forEach(
                        (key, specification) -> {
                            String name = fileSpecificationName(specification);
                            if (name != null && targets.contains(name.toLowerCase(Locale.ROOT))) {
                                targetSpecs.add(specification.getCOSObject());
                            }
                        });

        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            List<PDAnnotation> annotations = document.getPage(pageIndex).getAnnotations();
            // COSArrayList.iterator() only walks the filtered Java list; remove by
            // index so the page's /Annots array changes too.
            for (int index = annotations.size() - 1; index >= 0; index--) {
                PDAnnotation annotation = annotations.get(index);
                if (annotation instanceof PDAnnotationFileAttachment fileAttachment) {
                    String filename = fileSpecificationName(fileAttachment.getFile());
                    boolean nameMatches =
                            filename != null && targets.contains(filename.toLowerCase(Locale.ROOT));
                    boolean specMatches =
                            !targetSpecs.isEmpty()
                                    && fileAttachment.getFile()
                                            instanceof PDComplexFileSpecification specification
                                    && targetSpecs.contains(specification.getCOSObject());
                    if (nameMatches || specMatches) {
                        annotations.remove(index);
                    }
                }
            }
        }
    }

    /** A pin is placeable when it names a file, a page in range, and finite coordinates. */
    private static boolean isValid(AttachmentPinSpec pin, PDDocument document) {
        if (pin == null || pin.filename() == null || pin.filename().isBlank()) {
            return false;
        }
        if (pin.pageIndex() < 0 || pin.pageIndex() >= document.getNumberOfPages()) {
            return false;
        }
        return Float.isFinite(pin.x()) && Float.isFinite(pin.y());
    }

    private static PDAnnotationFileAttachment createAnnotation(
            PDDocument document,
            PDComplexFileSpecification fileSpecification,
            String filename,
            PDRectangle rectangle,
            boolean printable)
            throws IOException {
        PDAnnotationFileAttachment annotation = new PDAnnotationFileAttachment();
        annotation.setRectangle(rectangle);
        annotation.setPrinted(printable);
        annotation.setHidden(false);
        annotation.setNoView(false);
        annotation.setNoZoom(true);
        annotation.setNoRotate(true);
        annotation.setFile(fileSpecification);
        annotation.setAttachmentName(PDAnnotationFileAttachment.ATTACHMENT_NAME_PUSH_PIN);
        annotation.setContents("Attachment: " + filename);
        annotation.setSubject("Embedded attachment");
        annotation.setTitlePopup("Stirling PDF");
        annotation.setCreationDate(Calendar.getInstance());
        annotation.setAnnotationName("AttachmentPin_" + UUID.randomUUID());

        try {
            PDAppearanceDictionary appearance = new PDAppearanceDictionary();
            PDAppearanceStream stream = new PDAppearanceStream(document);
            stream.setBBox(new PDRectangle(0, 0, rectangle.getWidth(), rectangle.getHeight()));
            stream.setResources(new PDResources());
            try (PDPageContentStream content = new PDPageContentStream(document, stream)) {
                drawPin(content, rectangle.getWidth(), rectangle.getHeight());
            }
            appearance.setNormalAppearance(stream);
            annotation.setAppearance(appearance);
        } catch (IOException | RuntimeException e) {
            log.warn("Could not create the pin appearance for '{}': {}", filename, e.getMessage());
        }
        return annotation;
    }

    private static void drawPin(PDPageContentStream content, float width, float height)
            throws IOException {
        float headRadius = width * 0.34f;
        float headX = width / 2f;
        float headY = height * 0.64f;

        content.setNonStrokingColor(0.231f, 0.510f, 0.965f);
        content.moveTo(headX, 0f);
        content.lineTo(headX - headRadius * 0.62f, headY - headRadius * 0.2f);
        content.lineTo(headX + headRadius * 0.62f, headY - headRadius * 0.2f);
        content.closePath();
        content.fill();
        drawCircle(content, headX, headY, headRadius);

        content.setNonStrokingColor(1f, 1f, 1f);
        drawCircle(content, headX, headY, headRadius * 0.42f);
    }

    private static void drawCircle(
            PDPageContentStream content, float centerX, float centerY, float radius)
            throws IOException {
        float handle = radius * 0.5522848f;
        content.moveTo(centerX + radius, centerY);
        content.curveTo(
                centerX + radius,
                centerY + handle,
                centerX + handle,
                centerY + radius,
                centerX,
                centerY + radius);
        content.curveTo(
                centerX - handle,
                centerY + radius,
                centerX - radius,
                centerY + handle,
                centerX - radius,
                centerY);
        content.curveTo(
                centerX - radius,
                centerY - handle,
                centerX - handle,
                centerY - radius,
                centerX,
                centerY - radius);
        content.curveTo(
                centerX + handle,
                centerY - radius,
                centerX + radius,
                centerY - handle,
                centerX + radius,
                centerY);
        content.closePath();
        content.fill();
    }

    /** Map normalized displayed-page coordinates to a PDF-space icon rectangle. */
    private static PDRectangle pinRectangle(PDPage page, float x, float y) {
        PDRectangle cropBox = page.getCropBox();
        int rotation = pageRotation(page);
        boolean rotatedQuarterTurn = rotation == 90 || rotation == 270;
        float displayWidth = rotatedQuarterTurn ? cropBox.getHeight() : cropBox.getWidth();
        float displayHeight = rotatedQuarterTurn ? cropBox.getWidth() : cropBox.getHeight();
        float displayX = clampUnit(x) * displayWidth;
        float displayY = clampUnit(y) * displayHeight;

        float centerX;
        float centerY;
        switch (rotation) {
            case 90 -> {
                centerX = cropBox.getLowerLeftX() + displayY;
                centerY = cropBox.getLowerLeftY() + displayX;
            }
            case 180 -> {
                centerX = cropBox.getLowerLeftX() + cropBox.getWidth() - displayX;
                centerY = cropBox.getLowerLeftY() + displayY;
            }
            case 270 -> {
                centerX = cropBox.getLowerLeftX() + cropBox.getWidth() - displayY;
                centerY = cropBox.getLowerLeftY() + cropBox.getHeight() - displayX;
            }
            default -> {
                centerX = cropBox.getLowerLeftX() + displayX;
                centerY = cropBox.getUpperRightY() - displayY;
            }
        }

        float lowerLeftX = centerX - PIN_WIDTH / 2f;
        float lowerLeftY = centerY - PIN_HEIGHT / 2f;
        lowerLeftX =
                Math.max(
                        cropBox.getLowerLeftX(),
                        Math.min(lowerLeftX, cropBox.getUpperRightX() - PIN_WIDTH));
        lowerLeftY =
                Math.max(
                        cropBox.getLowerLeftY(),
                        Math.min(lowerLeftY, cropBox.getUpperRightY() - PIN_HEIGHT));
        return new PDRectangle(lowerLeftX, lowerLeftY, PIN_WIDTH, PIN_HEIGHT);
    }

    /** Inverse of {@link #pinRectangle}; used when listing pins back to the editor. */
    private static AttachmentPinSpec toNormalizedSpec(
            int pageIndex, String filename, PDPage page, PDRectangle rectangle) {
        PDRectangle cropBox = page.getCropBox();
        float centerX = rectangle.getLowerLeftX() + rectangle.getWidth() / 2f;
        float centerY = rectangle.getLowerLeftY() + rectangle.getHeight() / 2f;
        float relativeX = centerX - cropBox.getLowerLeftX();
        float relativeY = centerY - cropBox.getLowerLeftY();
        int rotation = pageRotation(page);

        float normalizedX;
        float normalizedY;
        switch (rotation) {
            case 90 -> {
                normalizedX = relativeY / cropBox.getHeight();
                normalizedY = relativeX / cropBox.getWidth();
            }
            case 180 -> {
                normalizedX = 1f - relativeX / cropBox.getWidth();
                normalizedY = relativeY / cropBox.getHeight();
            }
            case 270 -> {
                normalizedX = 1f - relativeY / cropBox.getHeight();
                normalizedY = 1f - relativeX / cropBox.getWidth();
            }
            default -> {
                normalizedX = relativeX / cropBox.getWidth();
                normalizedY = 1f - relativeY / cropBox.getHeight();
            }
        }
        return new AttachmentPinSpec(
                filename, pageIndex, clampUnit(normalizedX), clampUnit(normalizedY));
    }

    /** Normalize malformed rotations to 0 so coordinates stay predictable. */
    private static int pageRotation(PDPage page) {
        int rotation = Math.floorMod(page.getRotation(), 360);
        if (rotation % 90 != 0) {
            return 0;
        }
        return rotation;
    }

    private static float clampUnit(float value) {
        return Math.max(0f, Math.min(1f, value));
    }

    private static Map<String, PDComplexFileSpecification> embeddedFiles(PDDocument document)
            throws IOException {
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        if (catalog == null) {
            return Map.of();
        }
        PDDocumentNameDictionary names = catalog.getNames();
        if (names == null) {
            return Map.of();
        }
        PDEmbeddedFilesNameTreeNode tree = names.getEmbeddedFiles();
        if (tree == null) {
            return Map.of();
        }
        Map<String, PDComplexFileSpecification> files = new LinkedHashMap<>();
        collectFiles(tree, files);
        return files;
    }

    private static void collectFiles(
            PDNameTreeNode<PDComplexFileSpecification> node,
            Map<String, PDComplexFileSpecification> files)
            throws IOException {
        Map<String, PDComplexFileSpecification> names = node.getNames();
        if (names != null) {
            files.putAll(names);
        }
        List<PDNameTreeNode<PDComplexFileSpecification>> kids = node.getKids();
        if (kids != null) {
            for (PDNameTreeNode<PDComplexFileSpecification> kid : kids) {
                collectFiles(kid, files);
            }
        }
    }

    /** Resolve a filename case-insensitively when the exact key misses. */
    private static PDComplexFileSpecification findFileSpecification(
            Map<String, PDComplexFileSpecification> files, String filename) {
        if (filename == null) {
            return null;
        }
        PDComplexFileSpecification exact = files.get(filename);
        if (exact != null) {
            return exact;
        }
        for (Map.Entry<String, PDComplexFileSpecification> entry : files.entrySet()) {
            String name = fileSpecificationName(entry.getValue());
            if (name == null) {
                name = entry.getKey();
            }
            if (name != null && name.equalsIgnoreCase(filename)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static String fileSpecificationName(PDFileSpecification specification) {
        if (specification instanceof PDComplexFileSpecification complex) {
            String name = complex.getFileUnicode();
            if (name == null || name.isBlank()) {
                name = complex.getFile();
            }
            return name;
        }
        return specification != null ? specification.getFile() : null;
    }

    /** Convenience overload for callers that do not need removals. */
    public static int applyPins(PDDocument document, List<AttachmentPinSpec> pins)
            throws IOException {
        return applyPins(document, pins, List.of());
    }

    /** Return the pin for one filename, or {@code null} when it has no pin. */
    public static AttachmentPinSpec findPin(PDDocument document, String filename)
            throws IOException {
        if (filename == null) {
            return null;
        }
        return findPins(document).get(filename.toLowerCase(Locale.ROOT));
    }
}

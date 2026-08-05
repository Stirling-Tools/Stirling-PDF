package stirling.software.common.pdf.ua;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSInteger;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDNumberTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDMarkInfo;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDObjectReference;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureElement;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.apache.pdfbox.pdmodel.documentinterchange.taggedpdf.PDListAttributeObject;
import org.apache.pdfbox.pdmodel.documentinterchange.taggedpdf.PDTableAttributeObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotation;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;

import lombok.extern.slf4j.Slf4j;

/**
 * Serialises a {@link DocumentStructure} into a PDF structure tree.
 *
 * <p>Runs after {@link MarkedContentInjector}, which is what assigns the marked content ids this
 * writer references. Building the parent tree is the fiddly part: it maps each page's {@code
 * /StructParents} key to an array indexed by marked content id, so a consumer can go from a glyph
 * back to its structure element.
 */
@Slf4j
public class StructTreeWriter {

    private static final COSName STRUCT_PARENT = COSName.getPDFName("StructParent");
    private static final COSName NUMS = COSName.getPDFName("Nums");
    private static final String PDF2_STANDARD_NAMESPACE = "http://iso.org/pdf2/ssn";

    /** Per-page marked content id to owning element, built while walking the tree. */
    private final Map<Integer, Map<Integer, PDStructureElement>> mcidOwners = new LinkedHashMap<>();

    private COSDictionary standardNamespace;
    private int nextParentKey;

    public void write(PDDocument document, DocumentStructure structure, PdfUaProfile profile)
            throws IOException {
        PDStructureTreeRoot root = new PDStructureTreeRoot();
        PDStructureElement documentElement =
                new PDStructureElement(StructType.DOCUMENT.tag(), root);
        if (structure.getLanguage() != null) {
            documentElement.setLanguage(structure.getLanguage());
        }
        if (profile == PdfUaProfile.UA2) {
            applyNamespace(documentElement, document);
        }

        for (StructBlock block : structure.getBlocks()) {
            if (block.isArtifact()) {
                continue;
            }
            PDStructureElement child = buildElement(document, block, documentElement, profile);
            if (child != null) {
                documentElement.appendKid(child);
            }
        }

        root.appendKid(documentElement);
        buildParentTree(document, root);
        registerNamespaces(root);

        PDMarkInfo markInfo = new PDMarkInfo();
        markInfo.setMarked(true);
        document.getDocumentCatalog().setMarkInfo(markInfo);
        document.getDocumentCatalog().setStructureTreeRoot(root);
    }

    /** Recursively builds an element, returning null when the block carries no content at all. */
    private PDStructureElement buildElement(
            PDDocument document,
            StructBlock block,
            PDStructureElement parent,
            PdfUaProfile profile) {

        // Prune on assigned MCIDs, not on claimed ranges. When several blocks claim the same
        // operator - which is what happens to every line inside a form XObject, since they all
        // resolve to the invoking Do - only the first is given content. Emitting the rest would
        // announce a run of empty paragraphs to a screen reader, which is worse than omitting them.
        if (!carriesContent(block)) {
            return null;
        }
        StructType type = effectiveType(block, profile);
        PDStructureElement element = new PDStructureElement(type.tag(), parent);
        PDPage page = document.getPage(block.getPageIndex());
        element.setPage(page);

        if (profile == PdfUaProfile.UA2) {
            applyNamespace(element, document);
        }
        applyAttributes(block, element);

        for (int mcid : block.getMcids()) {
            element.appendKid(mcid);
            mcidOwners
                    .computeIfAbsent(block.getPageIndex(), k -> new LinkedHashMap<>())
                    .put(mcid, element);
        }

        for (StructBlock child : block.getChildren()) {
            PDStructureElement childElement = buildElement(document, child, element, profile);
            if (childElement != null) {
                element.appendKid(childElement);
            }
        }
        return element;
    }

    /** True when this block, or something beneath it, was actually given marked content. */
    private static boolean carriesContent(StructBlock block) {
        if (!block.getMcids().isEmpty()) {
            return true;
        }
        return block.getChildren().stream().anyMatch(StructTreeWriter::carriesContent);
    }

    /** PDF/UA-2 replaces Note with FENote for footnotes. */
    private static StructType effectiveType(StructBlock block, PdfUaProfile profile) {
        if (profile == PdfUaProfile.UA2 && block.getType() == StructType.NOTE) {
            return StructType.FENOTE;
        }
        return block.getType();
    }

    private static void applyAttributes(StructBlock block, PDStructureElement element) {
        if (block.getAlt() != null && !block.getAlt().isBlank()) {
            element.setAlternateDescription(block.getAlt());
        }
        if (block.getActualText() != null && !block.getActualText().isBlank()) {
            element.setActualText(block.getActualText());
        }
        if (block.getLang() != null && !block.getLang().isBlank()) {
            element.setLanguage(block.getLang());
        }
        if (block.getId() != null && !block.getId().isBlank()) {
            element.setElementIdentifier(block.getId());
        }
        if (block.getScope() != null) {
            PDTableAttributeObject table = new PDTableAttributeObject();
            table.setScope(block.getScope());
            element.addAttribute(table);
        }
        if (block.getListNumbering() != null) {
            PDListAttributeObject list = new PDListAttributeObject();
            list.setListNumbering(block.getListNumbering());
            element.addAttribute(list);
        }
    }

    /** PDF/UA-2 requires every element to declare the standard structure namespace. */
    private void applyNamespace(PDStructureElement element, PDDocument document) {
        element.getCOSObject().setItem(COSName.getPDFName("NS"), standardNamespace());
    }

    /** The PDF 2.0 standard structure namespace, created once per document. */
    private COSDictionary standardNamespace() {
        if (standardNamespace == null) {
            standardNamespace = new COSDictionary();
            standardNamespace.setName(COSName.TYPE, "Namespace");
            standardNamespace.setString(COSName.getPDFName("NS"), PDF2_STANDARD_NAMESPACE);
        }
        return standardNamespace;
    }

    private void registerNamespaces(PDStructureTreeRoot root) {
        if (standardNamespace == null) {
            return;
        }
        COSArray namespaces = new COSArray();
        namespaces.add(standardNamespace);
        root.getCOSObject().setItem(COSName.getPDFName("Namespaces"), namespaces);
    }

    /**
     * Builds {@code /ParentTree}: one entry per page keyed by {@code /StructParents}, whose value
     * is an array indexed by marked content id, plus one entry per annotation keyed by {@code
     * /StructParent}.
     */
    private void buildParentTree(PDDocument document, PDStructureTreeRoot root) {
        COSArray nums = new COSArray();
        nextParentKey = 0;

        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            Map<Integer, PDStructureElement> owners = mcidOwners.get(pageIndex);
            if (owners == null || owners.isEmpty()) {
                continue;
            }
            PDPage page = document.getPage(pageIndex);
            int key = nextParentKey++;
            page.setStructParents(key);

            int maxMcid = owners.keySet().stream().mapToInt(Integer::intValue).max().orElse(-1);
            COSArray entries = new COSArray();
            for (int mcid = 0; mcid <= maxMcid; mcid++) {
                PDStructureElement owner = owners.get(mcid);
                entries.add(
                        owner != null ? owner.getCOSObject() : org.apache.pdfbox.cos.COSNull.NULL);
            }
            nums.add(COSInteger.get(key));
            nums.add(entries);
        }

        List<COSBase> annotationEntries = tagAnnotations(document, root);
        for (int i = 0; i + 1 < annotationEntries.size(); i += 2) {
            nums.add(annotationEntries.get(i));
            nums.add(annotationEntries.get(i + 1));
        }

        COSDictionary parentTreeDict = new COSDictionary();
        parentTreeDict.setItem(NUMS, nums);
        root.setParentTree(new PDNumberTreeNode(parentTreeDict, PDStructureElement.class));
        root.setParentTreeNextKey(nextParentKey);
    }

    /**
     * Gives every visible annotation a structure element so it is reachable from the tree, which
     * PDF/UA-1 clause 7.18 requires. Link annotations become Link elements; anything else becomes
     * an Annot.
     */
    private List<COSBase> tagAnnotations(PDDocument document, PDStructureTreeRoot root) {
        List<COSBase> entries = new ArrayList<>();
        PDStructureElement documentElement = firstDocumentElement(root);
        if (documentElement == null) {
            return entries;
        }
        for (int pageIndex = 0; pageIndex < document.getNumberOfPages(); pageIndex++) {
            PDPage page = document.getPage(pageIndex);
            List<PDAnnotation> annotations;
            try {
                annotations = page.getAnnotations();
            } catch (IOException e) {
                log.debug("Could not read annotations on page {}: {}", pageIndex, e.getMessage());
                continue;
            }
            for (PDAnnotation annotation : annotations) {
                if (annotation == null
                        || annotation.isHidden()
                        || annotation.isNoView()
                        || "Popup".equals(annotation.getSubtype())) {
                    continue;
                }
                PDStructureElement element =
                        new PDStructureElement(annotationType(annotation), documentElement);
                element.setPage(page);

                PDObjectReference reference = new PDObjectReference();
                reference.setReferencedObject(annotation);
                element.appendKid(reference);
                documentElement.appendKid(element);

                int key = nextParentKey++;
                annotation.getCOSObject().setInt(STRUCT_PARENT, key);
                entries.add(COSInteger.get(key));
                entries.add(element.getCOSObject());

                if (annotation.getContents() == null || annotation.getContents().isBlank()) {
                    annotation.setContents(defaultContents(annotation));
                }
            }
        }
        return entries;
    }

    /**
     * A widget must sit inside a Form element (clause 7.18.4) and a link inside a Link element;
     * anything else is a generic Annot.
     */
    private static String annotationType(PDAnnotation annotation) {
        if (annotation instanceof PDAnnotationWidget) {
            return StructType.FORM.tag();
        }
        if (annotation instanceof PDAnnotationLink) {
            return StructType.LINK.tag();
        }
        return "Annot";
    }

    private static String defaultContents(PDAnnotation annotation) {
        if (annotation instanceof PDAnnotationLink link && link.getAction() != null) {
            return "Link";
        }
        return annotation.getSubtype() == null ? "Annotation" : annotation.getSubtype();
    }

    private static PDStructureElement firstDocumentElement(PDStructureTreeRoot root) {
        for (Object kid : root.getKids()) {
            if (kid instanceof PDStructureElement element) {
                return element;
            }
        }
        return null;
    }
}

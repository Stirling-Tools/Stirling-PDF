package stirling.software.proprietary.integration.purview.protection;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSObject;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;

public final class ProtectedPdfDetector {

    public static final String MICROSOFT_SUBTYPE = "MicrosoftIRMServices";

    private static final COSName ENCRYPTED_PAYLOAD = COSName.getPDFName("EncryptedPayload");
    private static final COSName EP = COSName.getPDFName("EP");
    private static final COSName AF = COSName.getPDFName("AF");
    private static final COSName AF_RELATIONSHIP = COSName.getPDFName("AFRelationship");

    private ProtectedPdfDetector() {}

    public static boolean isMicrosoftProtected(PDDocument document) {
        return encryptedPayloadSubtype(document).filter(MICROSOFT_SUBTYPE::equals).isPresent();
    }

    public static Optional<String> encryptedPayloadSubtype(PDDocument document) {
        for (COSDictionary fileSpec : candidateFileSpecs(document)) {
            COSDictionary payload = fileSpec.getCOSDictionary(EP);
            if (payload != null) {
                String subtype = payload.getNameAsString(COSName.SUBTYPE);
                return Optional.of(subtype == null ? "" : subtype);
            }
        }
        return Optional.empty();
    }

    private static List<COSDictionary> candidateFileSpecs(PDDocument document) {
        List<COSDictionary> specs = new ArrayList<>();
        COSDictionary catalog = document.getDocumentCatalog().getCOSObject();
        if (catalog.getDictionaryObject(AF) instanceof COSArray associated) {
            for (COSBase entry : associated) {
                if (dereference(entry) instanceof COSDictionary spec
                        && ENCRYPTED_PAYLOAD.equals(spec.getCOSName(AF_RELATIONSHIP))) {
                    specs.add(spec);
                }
            }
        }
        PDDocumentNameDictionary names = document.getDocumentCatalog().getNames();
        PDEmbeddedFilesNameTreeNode embedded = names == null ? null : names.getEmbeddedFiles();
        if (embedded != null) {
            try {
                Map<String, PDComplexFileSpecification> files = embedded.getNames();
                if (files != null) {
                    files.values().forEach(file -> specs.add(file.getCOSObject()));
                }
            } catch (IOException e) {
                return specs;
            }
        }
        return specs;
    }

    private static COSBase dereference(COSBase base) {
        return base instanceof COSObject object ? object.getObject() : base;
    }
}

package stirling.software.proprietary.integration.purview.protection;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentNameDictionary;
import org.apache.pdfbox.pdmodel.PDEmbeddedFilesNameTreeNode;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.filespecification.PDComplexFileSpecification;
import org.apache.pdfbox.pdmodel.common.filespecification.PDEmbeddedFile;

final class ProtectedPdfFixtures {

    private ProtectedPdfFixtures() {}

    static byte[] wrapper(String subtype, boolean listInAssociatedFiles, boolean listInNameTree)
            throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            PDEmbeddedFile payload =
                    new PDEmbeddedFile(document, new ByteArrayInputStream(new byte[] {1, 2, 3}));
            PDComplexFileSpecification spec = new PDComplexFileSpecification();
            spec.setFile("payload.pdf");
            spec.setFileUnicode("payload.pdf");
            spec.setEmbeddedFile(payload);
            COSDictionary specDictionary = spec.getCOSObject();
            specDictionary.setItem(
                    COSName.getPDFName("AFRelationship"), COSName.getPDFName("EncryptedPayload"));
            COSDictionary encryptedPayload = new COSDictionary();
            encryptedPayload.setItem(COSName.TYPE, COSName.getPDFName("EncryptedPayload"));
            encryptedPayload.setItem(COSName.SUBTYPE, COSName.getPDFName(subtype));
            encryptedPayload.setItem(COSName.VERSION, new COSString("2"));
            specDictionary.setItem(COSName.getPDFName("EP"), encryptedPayload);

            if (listInAssociatedFiles) {
                COSArray associated = new COSArray();
                associated.add(specDictionary);
                document.getDocumentCatalog()
                        .getCOSObject()
                        .setItem(COSName.getPDFName("AF"), associated);
            }
            if (listInNameTree) {
                PDEmbeddedFilesNameTreeNode tree = new PDEmbeddedFilesNameTreeNode();
                tree.setNames(java.util.Map.of("payload.pdf", spec));
                PDDocumentNameDictionary names =
                        new PDDocumentNameDictionary(document.getDocumentCatalog());
                names.setEmbeddedFiles(tree);
                document.getDocumentCatalog().setNames(names);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    static byte[] plain() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}

package stirling.software.SPDF.controller.api.misc;

import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.annotations.AutoJobPostMapping;
import stirling.software.common.annotations.api.MiscApi;
import stirling.software.common.enumeration.ResourceWeight;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.jpdfium.PdfDocument;

@MiscApi
@Slf4j
@RequiredArgsConstructor
public class DecompressPdfController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;

    @AutoJobPostMapping(
            value = "/decompress-pdf",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            resourceWeight = ResourceWeight.MEDIUM_WEIGHT)
    @Operation(
            summary = "Decompress PDF streams",
            description = "Fully decompresses all PDF streams including text content")
    public ResponseEntity<Resource> decompressPdf(@ModelAttribute PDFFile request)
            throws IOException {

        MultipartFile file = request.getFileInput();

        // JPDFium fast pre-validate: catches corrupt PDFs cheaply before the expensive PDFBox walk.
        // JPDFium's FPDF_SaveAsCopy has no "uncompress streams" flag, so PDFBox does the actual
        // work.
        File inputTemp = null;
        try {
            inputTemp = tempFileManager.convertMultipartFileToFile(file);
            try (PdfDocument ignored = PdfDocument.open(inputTemp.toPath())) {
                // pre-validate only
            } catch (Exception e) {
                log.debug(
                        "JPDFium pre-validate failed; proceeding with PDFBox: {}", e.getMessage());
            }

            try (PDDocument document = pdfDocumentFactory.load(file)) {
                // Walk every object and strip stream filters so PDFBox writes raw bytes
                processAllObjects(document);

                // Hybrid fallback: PDFium cannot save uncompressed, so use PDFBox NO_COMPRESSION
                TempFile tempOut = tempFileManager.createManagedTempFile(".pdf");
                try {
                    document.save(tempOut.getFile(), CompressParameters.NO_COMPRESSION);
                } catch (IOException e) {
                    tempOut.close();
                    throw e;
                }

                return WebResponseUtils.pdfFileToWebResponse(
                        tempOut,
                        GeneralUtils.generateFilename(
                                file.getOriginalFilename(), "_decompressed.pdf"));
            }
        } finally {
            if (inputTemp != null) {
                tempFileManager.deleteTempFile(inputTemp);
            }
        }
    }

    private void processAllObjects(PDDocument document) {
        Set<COSBase> processed = new HashSet<>();
        COSDocument cosDoc = document.getDocument();

        for (COSObjectKey key : cosDoc.getXrefTable().keySet()) {
            COSObject obj = cosDoc.getObjectFromPool(key);
            processObject(obj, processed);
        }
    }

    private void processObject(COSBase obj, Set<COSBase> processed) {
        if (obj == null || processed.contains(obj)) return;
        processed.add(obj);

        if (obj instanceof COSObject cosObj) {
            processObject(cosObj.getObject(), processed);
        } else if (obj instanceof COSDictionary dict) {
            processDictionary(dict, processed);
        } else if (obj instanceof COSArray array) {
            processArray(array, processed);
        }
    }

    private void processDictionary(COSDictionary dict, Set<COSBase> processed) {
        for (COSName key : dict.keySet()) {
            processObject(dict.getDictionaryObject(key), processed);
        }

        if (dict instanceof COSStream stream) {
            decompressStream(stream);
        }
    }

    private void processArray(COSArray array, Set<COSBase> processed) {
        for (int i = 0; i < array.size(); i++) {
            processObject(array.get(i), processed);
        }
    }

    private void decompressStream(COSStream stream) {
        try {
            log.debug("Processing stream: {}", stream);

            if (stream.containsKey(COSName.FILTER)
                    || stream.containsKey(COSName.DECODE_PARMS)
                    || stream.containsKey(COSName.D)) {

                byte[] decompressedBytes;
                try (COSInputStream is = stream.createInputStream()) {
                    decompressedBytes = IOUtils.toByteArray(is);
                }

                stream.removeItem(COSName.FILTER);
                stream.removeItem(COSName.DECODE_PARMS);
                stream.removeItem(COSName.D);

                try (OutputStream out = stream.createRawOutputStream()) {
                    out.write(decompressedBytes);
                }

                stream.setInt(COSName.LENGTH, decompressedBytes.length);
            }
        } catch (IOException e) {
            ExceptionUtils.logException("stream decompression", e);
        }
    }
}

package stirling.software.SPDF.controller.api.misc;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.pdfwriter.compress.CompressParameters;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.api.PDFFile;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/misc")
@Slf4j
@Tag(name = "Misc", description = "Miscellaneous APIs")
@RequiredArgsConstructor
public class DecompressPdfController {

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    @PostMapping(value = "/decompress-pdf", consumes = "multipart/form-data")
    @Operation(
            summary = "Decompress PDF streams",
            description = "Fully decompresses all PDF streams including text content")
    public ResponseEntity<byte[]> decompressPdf(@ModelAttribute PDFFile request)
            throws IOException {

        MultipartFile file = request.getFileInput();

        try (PDDocument document = pdfDocumentFactory.load(file)) {
            // Process all objects in document
            processAllObjects(document);

            // Save with explicit no compression
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos, CompressParameters.NO_COMPRESSION);

            String outputFilename =
                    file.getOriginalFilename().replaceFirst("\\.(?=[^.]+$)", "_decompressed.");
            return WebResponseUtils.bytesToWebResponse(
                    baos.toByteArray(), outputFilename, MediaType.APPLICATION_PDF);
        }
    }

    private void processAllObjects(PDDocument document) {
        Set<COSBase> processed = new HashSet<>();
        COSDocument cosDoc = document.getDocument();

        // Process all objects in the document
        for (COSObjectKey key : cosDoc.getXrefTable().keySet()) {
            COSObject obj = cosDoc.getObjectFromPool(key);
            processObject(obj, processed);
        }
    }

    private void processObject(COSBase obj, Set<COSBase> processed) {
        // Skip null objects or already processed objects to avoid infinite recursion
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
        // Process all dictionary entries
        for (COSName key : dict.keySet()) {
            processObject(dict.getDictionaryObject(key), processed);
        }

        // If this is a stream, decompress it
        if (dict instanceof COSStream stream) {
            decompressStream(stream);
        }
    }

    private void processArray(COSArray array, Set<COSBase> processed) {
        // Process all array elements
        for (int i = 0; i < array.size(); i++) {
            processObject(array.get(i), processed);
        }
    }

    private void decompressStream(COSStream stream) {
        try {
            log.debug("Processing stream: {}", stream);

            // Only remove filter information if it exists
            if (stream.containsKey(COSName.FILTER)
                    || stream.containsKey(COSName.DECODE_PARMS)
                    || stream.containsKey(COSName.D)) {

                // Read the decompressed content first
                byte[] decompressedBytes;
                try (COSInputStream is = stream.createInputStream()) {
                    decompressedBytes = IOUtils.toByteArray(is);
                }

                // Now remove filter information
                stream.removeItem(COSName.FILTER);
                stream.removeItem(COSName.DECODE_PARMS);
                stream.removeItem(COSName.D);

                // Write the raw content back
                try (OutputStream out = stream.createRawOutputStream()) {
                    out.write(decompressedBytes);
                }

                // Set the Length to reflect the new stream size
                stream.setInt(COSName.LENGTH, decompressedBytes.length);
            }
        } catch (IOException e) {
            log.error("Error decompressing stream", e);
            // Continue processing other streams even if this one fails
        }
    }
}

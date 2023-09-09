package stirling.software.SPDF.controller.api.misc;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Map;
import java.util.Map.Entry;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.misc.MetadataRequest;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@Tag(name = "Other", description = "Other APIs")
public class MetadataController {


    private String checkUndefined(String entry) {
        // Check if the string is "undefined"
        if ("undefined".equals(entry)) {
            // Return null if it is
            return null;
        }
        // Return the original string if it's not "undefined"
        return entry;

    }

    @PostMapping(consumes = "multipart/form-data", value = "/update-metadata")
    @Operation(summary = "Update metadata of a PDF file",
            description = "This endpoint allows you to update the metadata of a given PDF file. You can add, modify, or delete standard and custom metadata fields. Input:PDF Output:PDF Type:SISO")
    public ResponseEntity<byte[]> metadata(@ModelAttribute MetadataRequest request) throws IOException {
        
        // Extract PDF file from the request object
        MultipartFile pdfFile = request.getFileInput();

        // Extract metadata information
        Boolean deleteAll = request.getDeleteAll();
        String author = request.getAuthor();
        String creationDate = request.getCreationDate();
        String creator = request.getCreator();
        String keywords = request.getKeywords();
        String modificationDate = request.getModificationDate();
        String producer = request.getProducer();
        String subject = request.getSubject();
        String title = request.getTitle();
        String trapped = request.getTrapped();

        // Extract additional custom parameters
        Map<String, String> allRequestParams = request.getAllRequestParams();

        // Load the PDF file into a PDDocument
        PDDocument document = PDDocument.load(pdfFile.getBytes());

        // Get the document information from the PDF
        PDDocumentInformation info = document.getDocumentInformation();

        // Check if each metadata value is "undefined" and set it to null if it is
        author = checkUndefined(author);
        creationDate = checkUndefined(creationDate);
        creator = checkUndefined(creator);
        keywords = checkUndefined(keywords);
        modificationDate = checkUndefined(modificationDate);
        producer = checkUndefined(producer);
        subject = checkUndefined(subject);
        title = checkUndefined(title);
        trapped = checkUndefined(trapped);

        // If the "deleteAll" flag is set, remove all metadata from the document
        // information
        if (deleteAll) {
            for (String key : info.getMetadataKeys()) {
                info.setCustomMetadataValue(key, null);
            }
            // Remove metadata from the PDF history
            document.getDocumentCatalog().getCOSObject().removeItem(COSName.getPDFName("Metadata"));
            document.getDocumentCatalog().getCOSObject().removeItem(COSName.getPDFName("PieceInfo"));
            author = null;
            creationDate = null;
            creator = null;
            keywords = null;
            modificationDate = null;
            producer = null;
            subject = null;
            title = null;
            trapped = null;
        } else {
            // Iterate through the request parameters and set the metadata values
            for (Entry<String, String> entry : allRequestParams.entrySet()) {
                String key = entry.getKey();
                // Check if the key is a standard metadata key
                if (!key.equalsIgnoreCase("Author") && !key.equalsIgnoreCase("CreationDate") && !key.equalsIgnoreCase("Creator") && !key.equalsIgnoreCase("Keywords")
                        && !key.equalsIgnoreCase("modificationDate") && !key.equalsIgnoreCase("Producer") && !key.equalsIgnoreCase("Subject") && !key.equalsIgnoreCase("Title")
                        && !key.equalsIgnoreCase("Trapped") && !key.contains("customKey") && !key.contains("customValue")) {
                    info.setCustomMetadataValue(key, entry.getValue());
                } else if (key.contains("customKey")) {
                    int number = Integer.parseInt(key.replaceAll("\\D", ""));
                    String customKey = entry.getValue();
                    String customValue = allRequestParams.get("customValue" + number);
                    info.setCustomMetadataValue(customKey, customValue);
                }
            }
        }
        if (creationDate != null && creationDate.length() > 0) {
            Calendar creationDateCal = Calendar.getInstance();
            try {
                creationDateCal.setTime(new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").parse(creationDate));
            } catch (ParseException e) {
                e.printStackTrace();
            }
            info.setCreationDate(creationDateCal);
        } else {
            info.setCreationDate(null);
        }
        if (modificationDate != null && modificationDate.length() > 0) {
            Calendar modificationDateCal = Calendar.getInstance();
            try {
                modificationDateCal.setTime(new SimpleDateFormat("yyyy/MM/dd HH:mm:ss").parse(modificationDate));
            } catch (ParseException e) {
                e.printStackTrace();
            }
            info.setModificationDate(modificationDateCal);
        } else {
            info.setModificationDate(null);
        }
        info.setCreator(creator);
        info.setKeywords(keywords);
        info.setAuthor(author);
        info.setProducer(producer);
        info.setSubject(subject);
        info.setTitle(title);
        info.setTrapped(trapped);

        document.setDocumentInformation(info);
        return WebResponseUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_metadata.pdf");
    }

}

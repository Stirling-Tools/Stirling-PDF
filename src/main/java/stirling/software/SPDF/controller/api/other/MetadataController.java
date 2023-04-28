package stirling.software.SPDF.controller.api.other;

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
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Hidden;
import stirling.software.SPDF.utils.PdfUtils;

@RestController
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
    public ResponseEntity<byte[]> metadata(@RequestPart(required = true, value = "fileInput") MultipartFile pdfFile,
            @RequestParam(value = "deleteAll", required = false, defaultValue = "false") Boolean deleteAll, @RequestParam(value = "author", required = false) String author,
            @RequestParam(value = "creationDate", required = false) String creationDate, @RequestParam(value = "creator", required = false) String creator,
            @RequestParam(value = "keywords", required = false) String keywords, @RequestParam(value = "modificationDate", required = false) String modificationDate,
            @RequestParam(value = "producer", required = false) String producer, @RequestParam(value = "subject", required = false) String subject,
            @RequestParam(value = "title", required = false) String title, @RequestParam(value = "trapped", required = false) String trapped,
            @RequestParam Map<String, String> allRequestParams) throws IOException {

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
        return PdfUtils.pdfDocToWebResponse(document, pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_metadata.pdf");
    }

}

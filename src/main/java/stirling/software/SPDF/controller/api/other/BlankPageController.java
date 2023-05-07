package stirling.software.SPDF.controller.api.other;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.utils.ImageFinder;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

@RestController
public class BlankPageController {

    @PostMapping(consumes = "multipart/form-data", value = "/remove-blanks")
    public ResponseEntity<byte[]> removeBlankPages(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile, @RequestPart(required = true, value = "processType") int processType) throws IOException, InterruptedException {
        boolean removeNoText = false;
        boolean removeNoTextOrImages = false;
        
        if(processType == 0) {
        	removeNoText = true;
        } else if (processType == 1) {
        	removeNoTextOrImages = true;
        } else if (processType == 2) {
        	//run OCR 
        	OCRController ocr = new OCRController();
            ocr.processPdfWithOCR(inputFile, Arrays.asList("eng"), false, false, true, false, "type", "hocr", false);
            
        	removeNoText = true;
        }

        try {
            PDDocument document = PDDocument.load(inputFile.getInputStream());
            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDFTextStripper textStripper = new PDFTextStripper();

            List<PDPage> pagesToKeep = new ArrayList<>();
            int pageIndex = 0;

            for (PDPage page : pages) {
                pageIndex++;
                textStripper.setStartPage(pageIndex);
                textStripper.setEndPage(pageIndex);
                String pageText = textStripper.getText(document);
                boolean hasText = !pageText.trim().isEmpty();
                boolean hasImages = hasImagesOnPage(page);

                if (removeNoText && removeNoTextOrImages) {
                    if (hasText || hasImages) {
                        pagesToKeep.add(page);
                    }
                } else if (removeNoText) {
                    if (hasText) {
                        pagesToKeep.add(page);
                    }
                } else if (removeNoTextOrImages) {
                    if (hasText && hasImages) {
                        pagesToKeep.add(page);
                    }
                } else {
                    pagesToKeep.add(page);
                }
            }

            PDDocument outputDocument = new PDDocument();
            for (PDPage page : pagesToKeep) {
                outputDocument.addPage(page);
            }

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            outputDocument.save(outputStream);
            outputDocument.close();
            document.close();

            return new ResponseEntity<>(outputStream.toByteArray(), HttpStatus.OK);
        } catch (IOException e) {
            e.printStackTrace();
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    
    private static boolean hasImagesOnPage(PDPage page) throws IOException {
        ImageFinder imageFinder = new ImageFinder(page);
        imageFinder.processPage(page);
        return imageFinder.hasImages();
    }
    
    

    // ... rest of the code (ImageFinder class and hasImagesOnPage method)
}

package stirling.software.SPDF.controller.api.other;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageTree;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.utils.ImageFinder;
import stirling.software.SPDF.utils.PdfUtils;
import stirling.software.SPDF.utils.ProcessExecutor;

@RestController
public class BlankPageController {

    @PostMapping(consumes = "multipart/form-data", value = "/remove-blanks")
    public ResponseEntity<byte[]> removeBlankPages(@RequestPart(required = true, value = "fileInput") MultipartFile inputFile) throws IOException, InterruptedException {
        try {
            PDDocument document = PDDocument.load(inputFile.getInputStream());
            PDPageTree pages = document.getDocumentCatalog().getPages();
            PDFTextStripper textStripper = new PDFTextStripper();

            List<Integer> pagesToKeepIndex = new ArrayList<>();
            int pageIndex = 0;

            for (PDPage page : pages) {
                pageIndex++;
                textStripper.setStartPage(pageIndex);
                textStripper.setEndPage(pageIndex);
                String pageText = textStripper.getText(document);
                boolean hasText = !pageText.trim().isEmpty();
                if (hasText) {
                	pagesToKeepIndex.add(pageIndex);
                	System.out.println("page " + pageIndex + " has text");
                	continue;
                }
                boolean hasImages = hasImagesOnPage(page);
                if (hasImages) {
                	pagesToKeepIndex.add(pageIndex);
                	System.out.println("page " + pageIndex + " has image");
                    continue;
                }
            }
            System.out.print(pagesToKeepIndex.size());
            PDDocument outputDocument = new PDDocument();
            PDFRenderer pdfRenderer = new PDFRenderer(document);
            for (Integer i : pagesToKeepIndex) {
                // Create temp file to save the image
                Path tempFile = Files.createTempFile("image_", ".png");

                // Render image and save as temp file
                BufferedImage image = pdfRenderer.renderImageWithDPI(i - 1, 300);
                ImageIO.write(image, "png", tempFile.toFile());
                
                List<String> command = new ArrayList<>(Arrays.asList("python3", "./scripts/detect-blank-pages.py", tempFile.toString())); 

                // Run CLI command
                int returnCode = ProcessExecutor.getInstance(ProcessExecutor.Processes.PYTHON_OPENCV).runCommandWithOutputHandling(command);

				//does contain data
                if(returnCode ==0) {
                	outputDocument.addPage(document.getPage(i - 1));
                } else {
                	System.out.print("Found blank page skipping, page #" + i);
                }
            }
            

            document.close();
            
            return PdfUtils.pdfDocToWebResponse(outputDocument, inputFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_blanksRemoved.pdf");
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
}

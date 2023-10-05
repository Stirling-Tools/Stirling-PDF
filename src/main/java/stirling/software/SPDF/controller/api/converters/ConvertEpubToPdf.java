package stirling.software.SPDF.controller.api.converters;

import io.github.pixee.security.ZipSecurity;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import stirling.software.SPDF.model.api.GeneralFile;
import stirling.software.SPDF.utils.FileToPdf;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
@RequestMapping("/api/v1/convert")
@Tag(name = "Convert", description = "Convert APIs")
public class ConvertEpubToPdf {
	//TODO
	@PostMapping(consumes = "multipart/form-data", value = "/epub-to-single-pdf")
	@Hidden
	@Operation(
	    summary = "Convert an EPUB file to a single PDF",
	    description = "This endpoint takes an EPUB file input and converts it to a single PDF."
	)
	public ResponseEntity<byte[]> epubToSinglePdf(
			@ModelAttribute GeneralFile request) 
	        throws Exception {
		MultipartFile fileInput = request.getFileInput();
	    if (fileInput == null) {
	        throw new IllegalArgumentException("Please provide an EPUB file for conversion.");
	    }

	    String originalFilename = fileInput.getOriginalFilename();
	    if (originalFilename == null || !originalFilename.endsWith(".epub")) {
	        throw new IllegalArgumentException("File must be in .epub format.");
	    }

	    Map<String, byte[]> epubContents = extractEpubContent(fileInput);
	    List<String> htmlFilesOrder = getHtmlFilesOrderFromOpf(epubContents);

	    List<byte[]> individualPdfs = new ArrayList<>();

	    for (String htmlFile : htmlFilesOrder) {
	        byte[] htmlContent = epubContents.get(htmlFile);
	        byte[] pdfBytes = FileToPdf.convertHtmlToPdf(htmlContent, htmlFile.replace(".html", ".pdf"));
	        individualPdfs.add(pdfBytes);
	    }

	    // Pseudo-code to merge individual PDFs into one.
	    byte[] mergedPdfBytes = mergeMultiplePdfsIntoOne(individualPdfs);

	    return WebResponseUtils.bytesToWebResponse(mergedPdfBytes, originalFilename.replace(".epub", ".pdf"));
	}

	// Assuming a pseudo-code function that merges multiple PDFs into one.
	private byte[] mergeMultiplePdfsIntoOne(List<byte[]> individualPdfs) {
	    // You can use a library such as  PDFBox to perform the merging here.
	    // Return the byte[] of the merged PDF.
		return null;
	}
	
    private Map<String, byte[]> extractEpubContent(MultipartFile fileInput) throws IOException {
        Map<String, byte[]> contentMap = new HashMap<>();

        try (ZipInputStream zis = ZipSecurity.createHardenedInputStream(fileInput.getInputStream())) {
            ZipEntry zipEntry = zis.getNextEntry();
            while (zipEntry != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int read = 0;
                while ((read = zis.read(buffer)) != -1) {
                    baos.write(buffer, 0, read);
                }
                contentMap.put(zipEntry.getName(), baos.toByteArray());
                zipEntry = zis.getNextEntry();
            }
        }

        return contentMap;
    }

    private List<String> getHtmlFilesOrderFromOpf(Map<String, byte[]> epubContents) throws Exception {
        String opfContent = new String(epubContents.get("OEBPS/content.opf"));  // Adjusting for given path
        DocumentBuilderFactory dbFactory = DocumentBuilderFactory.newInstance();
        DocumentBuilder dBuilder = dbFactory.newDocumentBuilder();
        InputSource is = new InputSource(new StringReader(opfContent));
        Document doc = dBuilder.parse(is);

        NodeList itemRefs = doc.getElementsByTagName("itemref");
        List<String> htmlFilesOrder = new ArrayList<>();
        
        for (int i = 0; i < itemRefs.getLength(); i++) {
            Element itemRef = (Element) itemRefs.item(i);
            String idref = itemRef.getAttribute("idref");
            
            NodeList items = doc.getElementsByTagName("item");
            for (int j = 0; j < items.getLength(); j++) {
                Element item = (Element) items.item(j);
                if (idref.equals(item.getAttribute("id"))) {
                    htmlFilesOrder.add(item.getAttribute("href"));  // Fetching the actual href
                    break;
                }
            }
        }

        return htmlFilesOrder;
    }


}

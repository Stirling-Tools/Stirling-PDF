package stirling.software.SPDF.controller;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class RearrangePagesPDFController {

	private static final Logger logger = LoggerFactory.getLogger(RearrangePagesPDFController.class);

	@GetMapping("/pdf-organizer")
	public String pageOrganizer(Model model) {
		return "pdf-organizer";
	}

	@PostMapping("/rearrange-pages")
	public ResponseEntity<byte[]> rearrangePages(@RequestParam("fileInput") MultipartFile pdfFile,
			@RequestParam("pageOrder") String pageOrder) {
		try {
			// Load the input PDF
			PDDocument document = PDDocument.load(pdfFile.getInputStream());

			// Split the page order string into an array of page numbers or range of numbers
			String[] pageOrderArr = pageOrder.split(",");
			List<Integer> newPageOrder = new ArrayList<Integer>();
			//int[] newPageOrder = new int[pageOrderArr.length];
			int totalPages = document.getNumberOfPages();

			// loop through the page order array
			for (String element : pageOrderArr) {
				// check if the element contains a range of pages
				if (element.contains("-")) {
					// split the range into start and end page
					String[] range = element.split("-");
					int start = Integer.parseInt(range[0]);
					int end = Integer.parseInt(range[1]);
					// check if the end page is greater than total pages
					if (end > totalPages) {
						end = totalPages;
					}
					// loop through the range of pages
					for (int j = start; j <= end; j++) {
						// print the current index
						newPageOrder.add( j - 1);
					}
				} else {
					// if the element is a single page
					newPageOrder.add( Integer.parseInt(element) - 1);
				}
			}

			// Create a new list to hold the pages in the new order
			List<PDPage> newPages = new ArrayList<>();
			for (int i = 0; i < newPageOrder.size(); i++) {
				newPages.add(document.getPage(newPageOrder.get(i)));
			}

			// Remove all the pages from the original document
			for (int i = document.getNumberOfPages() - 1; i >= 0; i--) {
				document.removePage(i);
			}

			// Add the pages in the new order
			for (PDPage page : newPages) {
				document.addPage(page);
			}

			// Save the rearranged PDF to a ByteArrayOutputStream
			ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
			document.save(outputStream);

			// Close the original document
			document.close();

			// Prepare the response headers
			HttpHeaders headers = new HttpHeaders();
			headers.setContentType(MediaType.APPLICATION_PDF);
			headers.setContentDispositionFormData("attachment", "rearranged.pdf");
			headers.setContentLength(outputStream.size());

			// Return the response with the PDF data and headers
			return new ResponseEntity<>(outputStream.toByteArray(), headers, HttpStatus.OK);
		} catch (IOException e) {

			logger.error("Failed rearranging documents", e);
			return null;
		}
	}

}

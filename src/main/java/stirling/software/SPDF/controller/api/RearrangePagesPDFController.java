package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import stirling.software.SPDF.utils.GeneralUtils;
import stirling.software.SPDF.utils.WebResponseUtils;

@RestController
public class RearrangePagesPDFController {

	private static final Logger logger = LoggerFactory.getLogger(RearrangePagesPDFController.class);

	@PostMapping(consumes = "multipart/form-data", value = "/remove-pages")
	@Operation(summary = "Remove pages from a PDF file", description = "This endpoint removes specified pages from a given PDF file. Users can provide a comma-separated list of page numbers or ranges to delete. Input:PDF Output:PDF Type:SISO")
	public ResponseEntity<byte[]> deletePages(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file from which pages will be removed") MultipartFile pdfFile,
			@RequestParam("pagesToDelete") @Parameter(description = "Comma-separated list of pages or page ranges to delete, e.g., '1,3,5-8'") String pagesToDelete)
			throws IOException {

		PDDocument document = PDDocument.load(pdfFile.getBytes());

		// Split the page order string into an array of page numbers or range of numbers
		String[] pageOrderArr = pagesToDelete.split(",");

		List<Integer> pagesToRemove = GeneralUtils.parsePageList(pageOrderArr, document.getNumberOfPages());

		for (int i = pagesToRemove.size() - 1; i >= 0; i--) {
			int pageIndex = pagesToRemove.get(i);
			document.removePage(pageIndex);
		}
		return WebResponseUtils.pdfDocToWebResponse(document,
				pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_removed_pages.pdf");

	}

	private enum CustomMode {
		REVERSE_ORDER, DUPLEX_SORT, BOOKLET_SORT, ODD_EVEN_SPLIT, REMOVE_FIRST, REMOVE_LAST, REMOVE_FIRST_AND_LAST,
	}

	private List<Integer> removeFirst(int totalPages) {
		if (totalPages <= 1)
			return new ArrayList<>();
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = 2; i <= totalPages; i++) {
			newPageOrder.add(i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> removeLast(int totalPages) {
		if (totalPages <= 1)
			return new ArrayList<>();
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = 1; i < totalPages; i++) {
			newPageOrder.add(i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> removeFirstAndLast(int totalPages) {
		if (totalPages <= 2)
			return new ArrayList<>();
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = 2; i < totalPages; i++) {
			newPageOrder.add(i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> reverseOrder(int totalPages) {
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = totalPages; i >= 1; i--) {
			newPageOrder.add(i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> duplexSort(int totalPages) {
		List<Integer> newPageOrder = new ArrayList<>();
		int half = (totalPages + 1) / 2; // This ensures proper behavior with odd numbers of pages
		for (int i = 1; i <= half; i++) {
			newPageOrder.add(i - 1);
			if (i <= totalPages - half) { // Avoid going out of bounds
				newPageOrder.add(totalPages - i);
			}
		}
		return newPageOrder;
	}

	private List<Integer> bookletSort(int totalPages) {
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = 0; i < totalPages / 2; i++) {
			newPageOrder.add(i);
			newPageOrder.add(totalPages - i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> oddEvenSplit(int totalPages) {
		List<Integer> newPageOrder = new ArrayList<>();
		for (int i = 1; i <= totalPages; i += 2) {
			newPageOrder.add(i - 1);
		}
		for (int i = 2; i <= totalPages; i += 2) {
			newPageOrder.add(i - 1);
		}
		return newPageOrder;
	}

	private List<Integer> processCustomMode(String customMode, int totalPages) {
		try {
			CustomMode mode = CustomMode.valueOf(customMode.toUpperCase());
			switch (mode) {
			case REVERSE_ORDER:
				return reverseOrder(totalPages);
			case DUPLEX_SORT:
				return duplexSort(totalPages);
			case BOOKLET_SORT:
				return bookletSort(totalPages);
			case ODD_EVEN_SPLIT:
				return oddEvenSplit(totalPages);
			case REMOVE_FIRST:
				return removeFirst(totalPages);
			case REMOVE_LAST:
				return removeLast(totalPages);
			case REMOVE_FIRST_AND_LAST:
				return removeFirstAndLast(totalPages);
			default:
				throw new IllegalArgumentException("Unsupported custom mode");
			}
		} catch (IllegalArgumentException e) {
			logger.error("Unsupported custom mode", e);
			return null;
		}
	}

	@PostMapping(consumes = "multipart/form-data", value = "/rearrange-pages")
	@Operation(summary = "Rearrange pages in a PDF file", description = "This endpoint rearranges pages in a given PDF file based on the specified page order or custom mode. Users can provide a page order as a comma-separated list of page numbers or page ranges, or a custom mode. Input:PDF Output:PDF")
	public ResponseEntity<byte[]> rearrangePages(
			@RequestPart(required = true, value = "fileInput") @Parameter(description = "The input PDF file to rearrange pages") MultipartFile pdfFile,
			@RequestParam(required = false, value = "pageOrder") @Parameter(description = "The new page order as a comma-separated list of page numbers, page ranges (e.g., '1,3,5-7'), or functions in the format 'an+b' where 'a' is the multiplier of the page number 'n', and 'b' is a constant (e.g., '2n+1', '3n', '6n-5')") String pageOrder,
			@RequestParam(required = false, value = "customMode") @Parameter(schema = @Schema(implementation = CustomMode.class, description = "The custom mode for page rearrangement. "
					+ "Valid values are:\n" + "REVERSE_ORDER: Reverses the order of all pages.\n"
					+ "DUPLEX_SORT: Sorts pages as if all fronts were scanned then all backs in reverse (1, n, 2, n-1, ...). "
					+ "BOOKLET_SORT: Arranges pages for booklet printing (last, first, second, second last, ...).\n"
					+ "ODD_EVEN_SPLIT: Splits and arranges pages into odd and even numbered pages.\n"
					+ "REMOVE_FIRST: Removes the first page.\n" + "REMOVE_LAST: Removes the last page.\n"
					+ "REMOVE_FIRST_AND_LAST: Removes both the first and the last pages.\n")) String customMode) {
		try {
			// Load the input PDF
			PDDocument document = PDDocument.load(pdfFile.getInputStream());

			// Split the page order string into an array of page numbers or range of numbers
			String[] pageOrderArr = pageOrder != null ? pageOrder.split(",") : new String[0];
			int totalPages = document.getNumberOfPages();
			System.out.println("pageOrder=" + pageOrder);
			System.out.println("customMode length =" + customMode.length());
			List<Integer> newPageOrder;
			if (customMode != null && customMode.length() > 0) {
				newPageOrder = processCustomMode(customMode, totalPages);
			} else {
				newPageOrder = GeneralUtils.parsePageList(pageOrderArr, totalPages);
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

			return WebResponseUtils.pdfDocToWebResponse(document,
					pdfFile.getOriginalFilename().replaceFirst("[.][^.]+$", "") + "_rearranged.pdf");
		} catch (IOException e) {
			logger.error("Failed rearranging documents", e);
			return null;
		}
	}

	

}

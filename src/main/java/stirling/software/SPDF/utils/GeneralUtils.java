package stirling.software.SPDF.utils;

import java.util.ArrayList;
import java.util.List;

public class GeneralUtils {

	public static Long convertSizeToBytes(String sizeStr) {
	    if (sizeStr == null) {
	        return null;
	    }
	
	    sizeStr = sizeStr.trim().toUpperCase();
	    try {
	        if (sizeStr.endsWith("KB")) {
	            return (long) (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024);
	        } else if (sizeStr.endsWith("MB")) {
	            return (long) (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024 * 1024);
	        } else if (sizeStr.endsWith("GB")) {
	            return (long) (Double.parseDouble(sizeStr.substring(0, sizeStr.length() - 2)) * 1024 * 1024 * 1024);
	        } else if (sizeStr.endsWith("B")) {
	            return Long.parseLong(sizeStr.substring(0, sizeStr.length() - 1));
	        } else {
	            // Input string does not have a valid format, handle this case
	        }
	    } catch (NumberFormatException e) {
	        // The numeric part of the input string cannot be parsed, handle this case
	    }
	    
	    return null;
	}

	public static List<Integer> parsePageList(String[] pageOrderArr, int totalPages) {
	    List<Integer> newPageOrder = new ArrayList<>();

	    // loop through the page order array
	    for (String element : pageOrderArr) {
	        // check if the element contains a range of pages
	        if (element.matches("\\d*n\\+?-?\\d*|\\d*\\+?n")) {
	            // Handle page order as a function
	            int coefficient = 0;
	            int constant = 0;
	            boolean coefficientExists = false;
	            boolean constantExists = false;

	            if (element.contains("n")) {
	                String[] parts = element.split("n");
	                if (!parts[0].equals("") && parts[0] != null) {
	                    coefficient = Integer.parseInt(parts[0]);
	                    coefficientExists = true;
	                }
	                if (parts.length > 1 && !parts[1].equals("") && parts[1] != null) {
	                    constant = Integer.parseInt(parts[1]);
	                    constantExists = true;
	                }
	            } else if (element.contains("+")) {
	                constant = Integer.parseInt(element.replace("+", ""));
	                constantExists = true;
	            }

	            for (int i = 1; i <= totalPages; i++) {
	                int pageNum = coefficientExists ? coefficient * i : i;
	                pageNum += constantExists ? constant : 0;

	                if (pageNum <= totalPages && pageNum > 0) {
	                    newPageOrder.add(pageNum - 1);
	                }
	            }
	        } else if (element.contains("-")) {
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
	                newPageOrder.add(j - 1);
	            }
	        } else {
	            // if the element is a single page
	            newPageOrder.add(Integer.parseInt(element) - 1);
	        }
	    }

	    return newPageOrder;
	}
}

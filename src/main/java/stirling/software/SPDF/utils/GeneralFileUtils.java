package stirling.software.SPDF.utils;

public class GeneralFileUtils {

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

}

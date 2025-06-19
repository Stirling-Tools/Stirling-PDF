/**
 * Description: Enter description
 * Author: Your Name
 * Date: 2025-06-19
 * Time: 17:06:51
 */


package stirling.software.proprietary.security.model.exception;

public class NoProviderFoundException extends Exception {
    public NoProviderFoundException(String message) {
        super(message);
    }

    public NoProviderFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}

package stirling.software.common.model.exception;

public class InvalidUsernameException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InvalidUsernameException(String message) {
        super(message);
    }

    public InvalidUsernameException(String message, Throwable cause) {
        super(message, cause);
    }

    public InvalidUsernameException() {
        super("Username does not meet requirements");
    }
}

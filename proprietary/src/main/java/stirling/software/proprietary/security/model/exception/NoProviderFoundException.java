<<<<<<<< HEAD:proprietary/src/main/java/stirling/software/proprietary/security/model/exception/NoProviderFoundException.java
package stirling.software.proprietary.security.model.exception;
========
package stirling.software.common.model.exception;
>>>>>>>> f833293d (renaming module):common/src/main/java/stirling/software/common/model/exception/NoProviderFoundException.java

public class NoProviderFoundException extends Exception {
    public NoProviderFoundException(String message) {
        super(message);
    }

    public NoProviderFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}

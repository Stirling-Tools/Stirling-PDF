package stirling.software.proprietary.policy.input;

/**
 * Marks an input {@link org.springframework.core.io.Resource} as backed by a row in app storage, so
 * an output sink writing back to storage (a new version of the input) can find the origin file.
 */
public interface StoredFileBacked {

    Long storedFileId();
}

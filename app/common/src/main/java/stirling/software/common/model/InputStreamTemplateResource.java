package stirling.software.common.model;

/* Commented out entire InputStreamTemplateResource class - Thymeleaf dependency removed
 * This class will be removed when frontend migration to React is complete



@RequiredArgsConstructor
@Getter
public class InputStreamTemplateResource implements ITemplateResource {
    private final InputStream inputStream;
    private final String characterEncoding;

    @Override
    public Reader reader() throws IOException {
        return new InputStreamReader(inputStream, characterEncoding);
    }

    @Override
    public ITemplateResource relative(String relativeLocation) {
        // Implement logic for relative resources, if needed
        throw new UnsupportedOperationException("Relative resources not supported");
    }

    @Override
    public String getDescription() {
        return "InputStream resource [Stream]";
    }

    @Override
    public String getBaseName() {
        return "streamResource";
    }

    @Override
    public boolean exists() {
        return inputStream != null;
    }
}
*/

package stirling.software.proprietary.service;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.LineArtConversionService;
import stirling.software.officeconvert.lineart.LineArt;

@Slf4j
@Service
public class OfficeConvertLineArtConversionService implements LineArtConversionService {

    @Override
    public void convertToLineArt(Path input, Path output, double threshold, int edgeLevel)
            throws IOException {
        LineArt.Options options = LineArt.Options.imageMagickEdges(edgeLevel).threshold(threshold);
        LineArt.Result result = LineArt.convert(input, output, options);
        log.info(
                "Line art converted {} of {} images ({} -> {} bytes)",
                result.converted(),
                result.images(),
                result.bytesBefore(),
                result.bytesAfter());
        result.warnings().forEach(warning -> log.warn("Line art: {}", warning));
    }
}

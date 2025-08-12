package stirling.software.proprietary.model.converter;

import java.time.YearMonth;
import java.time.format.DateTimeFormatter;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter(autoApply = true)
public class YearMonthStringConverter implements AttributeConverter<YearMonth, String> {
    
    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM");

    @Override
    public String convertToDatabaseColumn(YearMonth yearMonth) {
        return yearMonth != null ? yearMonth.format(FORMATTER) : null;
    }

    @Override
    public YearMonth convertToEntityAttribute(String dbData) {
        return dbData != null ? YearMonth.parse(dbData, FORMATTER) : null;
    }
}
package stirling.software.SPDF.utils;

import java.io.IOException;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.pdfbox.contentstream.PDFStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSString;

public class WatermarkRemover extends PDFStreamEngine {

    private final Pattern pattern;
    private final String watermarkText;

    public WatermarkRemover(String watermarkText) {
        this.watermarkText = watermarkText;
        this.pattern = Pattern.compile(Pattern.quote(watermarkText));
    }

    @Override
    protected void processOperator(Operator operator, List<COSBase> operands) throws IOException {
        String operation = operator.getName();

        boolean processText = false;
        if ("Tj".equals(operation) || "TJ".equals(operation) || "'".equals(operation) || "\"".equals(operation)) {
            processText = true;
        }

        if (processText) {
            for (int j = 0; j < operands.size(); ++j) {
                COSBase operand = operands.get(j);
                if (operand instanceof COSString) {
                    COSString cosString = (COSString) operand;
                    String string = cosString.getString();
                    Matcher matcher = pattern.matcher(string);
                    if (matcher.find()) {
                        string = matcher.replaceAll("");
                        cosString.setValue(string.getBytes());
                    }
                } else if (operand instanceof COSArray) {
                    COSArray array = (COSArray) operand;
                    for (int i = 0; i < array.size(); i++) {
                        COSBase item = array.get(i);
                        if (item instanceof COSString) {
                            COSString cosString = (COSString) item;
                            String string = cosString.getString();
                            Matcher matcher = pattern.matcher(string);
                            if (matcher.find()) {
                                System.out.println("operation =" + operation);
                                System.out.println("1 =" + string);
                                string = matcher.replaceAll("");
                                cosString.setValue(string.getBytes());
                                array.set(i, cosString);
                                operands.set(j, array);
                            }

                        }
                    }
                }

            }
        }
        super.processOperator(operator, operands);
    }
}

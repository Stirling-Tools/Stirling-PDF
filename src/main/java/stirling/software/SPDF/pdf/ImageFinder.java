package stirling.software.SPDF.pdf;

import java.awt.geom.Point2D;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.contentstream.operator.OperatorName;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;

public class ImageFinder extends org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine {
    private boolean hasImages = false;

    public ImageFinder(PDPage page) {
        super(page);
    }

    public boolean hasImages() {
        return hasImages;
    }

    @Override
    protected void processOperator(Operator operator, List<COSBase> operands) throws IOException {
        String operation = operator.getName();
        if (operation.equals(OperatorName.DRAW_OBJECT)) {
            COSBase base = operands.get(0);
            if (base instanceof COSName) {
                COSName objectName = (COSName) base;
                PDXObject xobject = getResources().getXObject(objectName);
                if (xobject instanceof PDImageXObject) {
                    hasImages = true;
                } else if (xobject instanceof PDFormXObject) {
                    PDFormXObject form = (PDFormXObject) xobject;
                    ImageFinder innerFinder = new ImageFinder(getPage());
                    innerFinder.processPage(getPage());
                    if (innerFinder.hasImages()) {
                        hasImages = true;
                    }
                }
            }
        }
        super.processOperator(operator, operands);
    }

	@Override
	public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void drawImage(PDImage pdImage) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void clip(int windingRule) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void moveTo(float x, float y) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void lineTo(float x, float y) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public Point2D getCurrentPoint() throws IOException {
		// TODO Auto-generated method stub
		return null;
	}

	@Override
	public void closePath() throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void endPath() throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void strokePath() throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void fillPath(int windingRule) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void fillAndStrokePath(int windingRule) throws IOException {
		// TODO Auto-generated method stub
		
	}

	@Override
	public void shadingFill(COSName shadingName) throws IOException {
		// TODO Auto-generated method stub
		
	}

    // ... rest of the overridden methods
}

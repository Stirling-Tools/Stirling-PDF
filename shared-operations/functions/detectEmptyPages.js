import { getImagesOnPage } from "./getImagesOnPage.js";
import PDFJS from 'pdfjs-dist';

export async function detectEmptyPages(snapshot, whiteThreashold, OpenCV) {
    const pdfDoc = await PDFJS.getDocument(snapshot).promise;

    const emptyPages = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        console.log("Checking page " + i);

        if(!await hasText(page)) {
            console.log(`Found text on Page ${i}, page is not empty`);
            continue;
        }

        if(!await areImagesBlank(page, whiteThreashold)) {
            console.log(`Found non white image on Page ${i}, page is not empty`);
            continue;
        }

        console.log(`Page ${i} is empty.`);
        emptyPages.push(i - 1);
    }
    return emptyPages;

    async function hasText(page) {
        const textContent = await page.getTextContent();
        return textContent.items.length === 0;
    }

    async function areImagesBlank(page, threshold) {
        const images = await getImagesOnPage(page);
        for (const image of images) {
            if(!isImageBlank(image, threshold))
                return false;
        }
        return true;
    }
    
    function isImageBlank(image, threshold) {
        const src = new OpenCV.cv.Mat(image.width, image.height, OpenCV.cv.CV_8UC4);
        src.data.set(image.data);
        // Convert the image to grayscale
        const gray = new OpenCV.cv.Mat();
        OpenCV.cv.cvtColor(src, gray, OpenCV.cv.COLOR_RGBA2GRAY);
    
        // Calculate the mean value of the grayscale image
        const meanValue = OpenCV.cv.mean(gray);
    
        // Free memory
        src.delete();
        gray.delete();
    
        // Check if the mean value is below the threshold
        if (meanValue[0] <= threshold) {
            return true;
        } else {
            return false;
        }
    }
}
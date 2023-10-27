export async function getImagesOnPage(page, PDFJS) {
    const ops = await page.getOperatorList();
    const images = [];
    for (var j=0; j < ops.fnArray.length; j++) {
        if (ops.fnArray[j] == PDFJS.OPS.paintJpegXObject || ops.fnArray[j] == PDFJS.OPS.paintImageXObject) {
            const image = page.objs.get(ops.argsArray[j][0]);
            images.push(image);
        }
    }
    return images;
}
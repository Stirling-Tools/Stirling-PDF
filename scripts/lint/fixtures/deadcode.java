package fixtures;

class DeadCode {

    // private void oldPath(PDDocument document) {
    //     PDPage page = document.getPage(0);
    //     page.setRotation(90);
    //     document.save(target);
    // }

    void currentPath(PDDocument document) {
        document.save(target);
    }
}

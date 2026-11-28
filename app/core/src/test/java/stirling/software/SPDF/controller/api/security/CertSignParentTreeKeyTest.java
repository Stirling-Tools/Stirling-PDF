package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.pdmodel.common.COSObjectable;
import org.apache.pdfbox.pdmodel.common.PDNumberTreeNode;
import org.apache.pdfbox.pdmodel.documentinterchange.logicalstructure.PDStructureTreeRoot;
import org.junit.jupiter.api.Test;

class CertSignParentTreeKeyTest {

    private static PDStructureTreeRoot root(int nextKey, Integer existingKey) {
        PDStructureTreeRoot root = new PDStructureTreeRoot();
        root.setParentTreeNextKey(nextKey);
        if (existingKey != null) {
            PDNumberTreeNode tree = new PDNumberTreeNode(COSBase.class);
            tree.setNumbers(Map.<Integer, COSObjectable>of(existingKey, new COSDictionary()));
            root.setParentTree(tree);
        }
        return root;
    }

    @Test
    void theKeyFollowsEveryKeyInUse() throws Exception {
        assertEquals(1, CertSignController.parentTreeKey(root(0, 0)));
        assertEquals(7, CertSignController.parentTreeKey(root(7, 2)));
        assertEquals(0, CertSignController.parentTreeKey(new PDStructureTreeRoot()));
    }

    @Test
    void aNextKeyAtTheIntegerLimitIsRefused() {
        assertThrows(
                IllegalArgumentException.class,
                () -> CertSignController.parentTreeKey(root(Integer.MAX_VALUE, null)));
    }

    @Test
    void anExistingKeyAtTheIntegerLimitIsRefused() {
        assertThrows(
                IllegalArgumentException.class,
                () -> CertSignController.parentTreeKey(root(0, Integer.MAX_VALUE)));
    }
}

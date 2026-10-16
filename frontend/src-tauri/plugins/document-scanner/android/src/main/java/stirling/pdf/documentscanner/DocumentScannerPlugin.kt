package stirling.pdf.documentscanner

import android.app.Activity
import androidx.activity.result.ActivityResult
import androidx.activity.result.IntentSenderRequest
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult

/**
 * Runs the ML Kit document scanner, which borrows Google Play services' camera
 * permission and UI, so the app itself needs no CAMERA permission.
 */
@TauriPlugin
class DocumentScannerPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun scan(invoke: Invoke) {
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(activity)
            .addOnSuccessListener { intentSender ->
                startIntentSenderForResult(
                    invoke,
                    IntentSenderRequest.Builder(intentSender).build(),
                    "scanResult",
                )
            }
            .addOnFailureListener { error ->
                invoke.reject(error.message ?: "The scanner could not be started.")
            }
    }

    @ActivityCallback
    fun scanResult(invoke: Invoke, result: ActivityResult) {
        val ret = JSObject()
        if (result.resultCode != Activity.RESULT_OK) {
            ret.put("path", null)
            invoke.resolve(ret)
            return
        }

        val pdfUri = GmsDocumentScanningResult.fromActivityResultIntent(result.data)?.pdf?.uri
        if (pdfUri == null) {
            invoke.reject("The scanned pages could not be saved.")
            return
        }
        // ML Kit writes the PDF into the app's cache as a file:// URI.
        ret.put("path", if (pdfUri.scheme == "file") pdfUri.path else pdfUri.toString())
        invoke.resolve(ret)
    }
}

import PDFKit
import Tauri
import UIKit
import VisionKit

class DocumentScannerPlugin: Plugin, VNDocumentCameraViewControllerDelegate {
  // One scan at a time: the camera is modal, so a second call while it is up
  // is rejected rather than queued.
  private var pendingInvoke: Invoke?

  @objc public func scan(_ invoke: Invoke) {
    DispatchQueue.main.async {
      guard VNDocumentCameraViewController.isSupported else {
        invoke.reject("Document scanning is not available on this device.")
        return
      }
      guard self.pendingInvoke == nil else {
        invoke.reject("A scan is already in progress.")
        return
      }
      guard let presenter = self.manager.viewController else {
        invoke.reject("The scanner could not be shown.")
        return
      }
      self.pendingInvoke = invoke
      let camera = VNDocumentCameraViewController()
      camera.delegate = self
      presenter.present(camera, animated: true)
    }
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    controller.dismiss(animated: true)
    guard let invoke = takePendingInvoke() else { return }

    // Page images are full camera resolution; building the PDF off the main
    // thread keeps the dismiss animation smooth.
    let images = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
    DispatchQueue.global(qos: .userInitiated).async {
      let document = PDFDocument()
      for image in images {
        if let page = PDFPage(image: image) {
          document.insert(page, at: document.pageCount)
        }
      }
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("scan-\(UUID().uuidString).pdf")
      if document.pageCount > 0, document.write(to: url) {
        invoke.resolve(["path": url.path])
      } else {
        invoke.reject("The scanned pages could not be saved.")
      }
    }
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true)
    takePendingInvoke()?.resolve(["path": nil])
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    controller.dismiss(animated: true)
    takePendingInvoke()?.reject(error.localizedDescription)
  }

  private func takePendingInvoke() -> Invoke? {
    let invoke = pendingInvoke
    pendingInvoke = nil
    return invoke
  }
}

@_cdecl("init_plugin_document_scanner")
func initPlugin() -> Plugin {
  return DocumentScannerPlugin()
}

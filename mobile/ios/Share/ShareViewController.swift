import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    openSharedLink()
  }

  private func openSharedLink() {
    guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
          let providers = item.attachments else {
      finish()
      return
    }

    let urlType = UTType.url.identifier
    let textType = UTType.plainText.identifier
    for provider in providers {
      if provider.hasItemConformingToTypeIdentifier(urlType) {
        provider.loadItem(forTypeIdentifier: urlType, options: nil) { item, _ in
          let raw = (item as? URL)?.absoluteString ?? (item as? String)
          self.handOff(raw)
        }
        return
      }
      if provider.hasItemConformingToTypeIdentifier(textType) {
        provider.loadItem(forTypeIdentifier: textType, options: nil) { item, _ in
          self.handOff(item as? String)
        }
        return
      }
    }
    finish()
  }

  private func handOff(_ raw: String?) {
    let link = raw.flatMap(Self.httpLink)
    DispatchQueue.main.async {
      var allowed = CharacterSet.urlQueryAllowed
      allowed.remove(charactersIn: "?&=+#")
      if let link, let encoded = link.addingPercentEncoding(withAllowedCharacters: allowed),
         let url = URL(string: "pktunez://add?url=\(encoded)") {
        self.openHost(url)
      }
      self.finish()
    }
  }

  private static func httpLink(_ text: String) -> String? {
    guard let match = text.range(of: "https?://\\S+", options: .regularExpression) else { return nil }
    return String(text[match]).trimmingCharacters(in: CharacterSet(charactersIn: ").,"))
  }

  private func openHost(_ url: URL) {
    var responder: UIResponder? = self
    let selector = sel_registerName("openURL:")
    while let current = responder {
      if current.responds(to: selector) {
        _ = current.perform(selector, with: url)
        return
      }
      responder = current.next
    }
  }

  private func finish() {
    extensionContext?.completeRequest(returningItems: nil)
  }
}

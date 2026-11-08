import Foundation
import React

@objc(PkDownload)
class PkDownload: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private func musicDirectory() throws -> URL {
    let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let dir = base.appendingPathComponent("PK-Tunez", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  private func stateFile(_ name: String) -> URL {
    let safe = name.filter { $0.isLetter || $0.isNumber || "._-".contains($0) }
    let file = safe.isEmpty ? "library.json" : safe
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(file)
  }

  @objc func musicDir(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      resolve(try musicDirectory().path)
    } catch {
      reject("dir_failed", error.localizedDescription, error)
    }
  }

  @objc func consumeShare(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(nil)
  }

  @objc func readText(
    _ name: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = stateFile(name)
    resolve((try? String(contentsOf: url, encoding: .utf8)) ?? "")
  }

  @objc func writeText(
    _ name: String,
    text: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      try text.write(to: stateFile(name), atomically: true, encoding: .utf8)
      resolve(true)
    } catch {
      reject("write_failed", error.localizedDescription, error)
    }
  }

  @objc func downloadToFile(
    _ urlString: String,
    headers: NSDictionary,
    dest: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = URL(string: urlString) else {
      reject("download_failed", "Bad URL.", nil)
      return
    }
    var request = URLRequest(url: url)
    headers.forEach { key, value in
      if let name = key as? String, let header = value as? String {
        request.setValue(header, forHTTPHeaderField: name)
      }
    }
    let task = URLSession.shared.downloadTask(with: request) { temp, response, error in
      if let error {
        reject("download_failed", error.localizedDescription, error)
        return
      }
      guard let temp, let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        reject("download_failed", "Download failed (\(code)).", nil)
        return
      }
      do {
        let destURL = URL(fileURLWithPath: dest)
        try FileManager.default.createDirectory(at: destURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if FileManager.default.fileExists(atPath: dest) {
          try FileManager.default.removeItem(at: destURL)
        }
        try FileManager.default.moveItem(at: temp, to: destURL)
        resolve(dest)
      } catch {
        reject("download_failed", error.localizedDescription, error)
      }
    }
    task.resume()
  }

  @objc func uploadFile(
    _ urlString: String,
    headers: NSDictionary,
    filePath: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let url = URL(string: urlString) else {
      reject("upload_failed", "Bad URL.", nil)
      return
    }
    guard FileManager.default.fileExists(atPath: filePath) else {
      reject("upload_failed", "File not found.", nil)
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    headers.forEach { key, value in
      if let name = key as? String, let header = value as? String {
        request.setValue(header, forHTTPHeaderField: name)
      }
    }
    let task = URLSession.shared.uploadTask(with: request, fromFile: URL(fileURLWithPath: filePath)) { data, response, error in
      if let error {
        reject("upload_failed", error.localizedDescription, error)
        return
      }
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      resolve(["status": code, "body": body])
    }
    task.resume()
  }
}

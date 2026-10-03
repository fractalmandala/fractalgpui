// Draws the app mark (the shell's .wb-brand: a black "f" on greenpop1) as a 1024px PNG.
// Used by build/dmg.ts: `swift build/icon.swift <out.png>`.
import AppKit

let size: CGFloat = 1024
let out = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()
let inset: CGFloat = 100 // macOS icon grid: the tile sits inside the canvas
let rect = NSRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)
NSColor(srgbRed: 0x00 / 255, green: 0xE6 / 255, blue: 0x76 / 255, alpha: 1).setFill()
NSBezierPath(roundedRect: rect, xRadius: 185, yRadius: 185).fill()
let font = NSFont(name: "General Sans Variable", size: 560) ?? NSFont.systemFont(ofSize: 560, weight: .bold)
let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor(srgbRed: 0x17 / 255, green: 0x17 / 255, blue: 0x17 / 255, alpha: 1)]
let text = NSAttributedString(string: "f", attributes: attrs)
let t = text.size()
text.draw(at: NSPoint(x: (size - t.width) / 2, y: (size - t.height) / 2))
image.unlockFocus()
let rep = NSBitmapImageRep(data: image.tiffRepresentation!)!
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))

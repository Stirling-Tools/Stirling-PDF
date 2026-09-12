import AppKit

let width = 660
let height = 400
let scale = 2
let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: width * scale, pixelsHigh: height * scale,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
    isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
)!
bitmap.size = NSSize(width: width, height: height)
let context = NSGraphicsContext(bitmapImageRep: bitmap)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = context

let bounds = NSRect(x: 0, y: 0, width: width, height: height)
NSGradient(starting: NSColor(srgbRed: 0.993, green: 0.982, blue: 0.961, alpha: 1),
           ending: NSColor(srgbRed: 1, green: 0.996, blue: 0.985, alpha: 1))!
    .draw(in: bounds, angle: 90)

let burgundy = NSColor(srgbRed: 0.49, green: 0.07, blue: 0.08, alpha: 1)
let title = NSAttributedString(string: "Stirling PDF", attributes: [
    .font: NSFont.systemFont(ofSize: 40, weight: .semibold),
    .foregroundColor: burgundy,
])
title.draw(at: NSPoint(x: (CGFloat(width) - title.size().width) / 2, y: 284))

burgundy.setStroke()
burgundy.setFill()
let arrow = NSBezierPath()
arrow.move(to: NSPoint(x: 290, y: 187))
arrow.curve(to: NSPoint(x: 361, y: 195),
            controlPoint1: NSPoint(x: 317, y: 207),
            controlPoint2: NSPoint(x: 336, y: 207))
arrow.lineWidth = 2.5
arrow.lineCapStyle = .round
arrow.stroke()
let head = NSBezierPath()
head.move(to: NSPoint(x: 357, y: 210))
head.line(to: NSPoint(x: 373, y: 193))
head.line(to: NSPoint(x: 351, y: 188))
head.close()
head.fill()

NSGraphicsContext.restoreGraphicsState()
let output = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    .appendingPathComponent("background.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: output)

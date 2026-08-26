import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Stack,
  Text,
  Group,
  Alert,
  Progress,
  Switch,
  Card,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Button as DSButton } from "@app/ui/Button";
import { useTranslation } from "react-i18next";
import { LogoIcon } from "@app/components/shared/LogoIcon";
import { Wordmark } from "@app/components/shared/Wordmark";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import {
  loadJscanify,
  type JscanifyCornerPoints,
  type JscanifyScanner,
} from "@app/utils/loadJscanify";
import apiClient from "@app/services/apiClient";

// Use the configured API base (e.g. api.stirling.com), not the page origin.
const API_BASE = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "");

// Everything on this page must fit one screen with no scrolling, so sizes are
// fluid: they shrink with the viewport height and cap out on roomy screens.
const FLUID = {
  logo: "clamp(20px, 3.4dvh, 28px)",
  wordmark: "clamp(14px, 2.4dvh, 20px)",
  icon: "clamp(1.5rem, 5.5dvh, 2.75rem)",
  title: "clamp(0.95rem, 2.4dvh, 1.15rem)",
  body: "clamp(0.7rem, 1.7dvh, 0.85rem)",
  gap: "clamp(0.35rem, 1.4dvh, 1rem)",
  pad: "clamp(0.5rem, 1.8dvh, 1.25rem)",
} as const;

// Cap the thumbnail strip: past this the extras collapse into a "+N" tile
// rather than scrolling sideways.
const MAX_VISIBLE_THUMBS = 5;
const THUMB_SIZE = "clamp(28px, 7dvh, 56px)";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// Experimental camera controls (W3C Image Capture / MediaStream extensions) that
// are not yet part of the standard DOM lib typings but are widely shipped on
// mobile browsers and required for document scanning.
declare global {
  interface MediaTrackCapabilities {
    focusMode?: string[];
    exposureMode?: string[];
    torch?: boolean;
  }
  interface MediaTrackConstraintSet {
    focusMode?: ConstrainDOMString;
    exposureMode?: ConstrainDOMString;
    torch?: ConstrainBoolean;
  }
}

/**
 * MobileScannerPage
 *
 * Mobile-friendly page for capturing photos and uploading them to the backend server.
 * Accessed by scanning QR code from desktop.
 */
export default function MobileScannerPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  // Short screens (landscape phones, mostly) drop the branding and the
  // explanatory copy and lay actions out in a single row so nothing overflows.
  const compact = useMediaQuery("(max-height: 34rem)") ?? false;

  const [mode, setMode] = useState<"choice" | "camera" | "file" | null>(
    "choice",
  );
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [openCvReady, setOpenCvReady] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null); // null = checking, true = valid, false = invalid
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<JscanifyScanner | null>(null);
  const highlightIntervalRef = useRef<number | null>(null);

  // Detection resolution - extremely low for mobile performance
  const DETECTION_WIDTH = 160; // Ultra-low for real-time mobile detection

  // Validate session on page load
  useEffect(() => {
    const validateSession = async () => {
      if (!sessionId) {
        setSessionValid(false);
        setSessionError(
          t(
            "mobileScanner.noSessionMessage",
            "Session not found. Please try again.",
          ),
        );
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE}/api/v1/mobile-scanner/validate-session/${sessionId}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            setSessionValid(true);
            setSessionError(null);
          } else {
            setSessionValid(false);
            setSessionError(
              t(
                "mobileScanner.sessionExpired",
                "This session has expired. Please refresh and try again.",
              ),
            );
          }
        } else {
          setSessionValid(false);
          setSessionError(
            t(
              "mobileScanner.sessionNotFound",
              "Session not found. Please refresh and try again.",
            ),
          );
        }
      } catch (err) {
        console.error("Failed to validate session:", err);
        setSessionValid(false);
        setSessionError(
          t(
            "mobileScanner.sessionValidationError",
            "Unable to verify session. Please try again.",
          ),
        );
      }
    };

    validateSession();
  }, [sessionId, t]);

  useEffect(() => {
    let cancelled = false;

    loadJscanify({
      onStatus: (status) => console.log("[Mobile Scanner] jscanify:", status),
    })
      .then(() => {
        if (cancelled) return;
        try {
          scannerRef.current = new window.jscanify!();
          setOpenCvReady(true);
        } catch (err) {
          console.error("Failed to initialize jscanify:", err);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load jscanify:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize camera
  useEffect(() => {
    console.log(
      `[Mobile Scanner] Camera effect triggered: mode=${mode}, cameraError=${cameraError}, currentPreview=${currentPreview}`,
    );

    if (mode === "camera" && !cameraError && !currentPreview) {
      console.log(
        "[Mobile Scanner] Camera effect: Starting camera initialization",
      );

      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error =
          "MediaDevices API not available - requires HTTPS or localhost";
        console.error(error);
        setCameraError(
          t(
            "mobileScanner.httpsRequired",
            "Camera access requires HTTPS or localhost. Please use HTTPS or access via localhost.",
          ),
        );
        setMode("file");
        return;
      }

      console.log("[Mobile Scanner] Requesting camera permission...");
      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: "environment",
            // Request 1080p - good quality without going overboard
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
          },
          audio: false,
        })
        .then(async (stream) => {
          console.log(
            "[Mobile Scanner] Camera permission granted, stream received",
          );
          streamRef.current = stream;
          if (videoRef.current) {
            const video = videoRef.current;
            video.srcObject = stream;

            // Wait for video metadata to load before marking camera as ready
            const handleLoadedMetadata = () => {
              console.log(
                "[Mobile Scanner] Video metadata loaded, dimensions:",
                video.videoWidth,
                "x",
                video.videoHeight,
              );

              // Signal that camera is ready - this will trigger detection effect
              console.log("[Mobile Scanner] Setting cameraReady = true");
              setCameraReady(true);
            };

            // Check if metadata is already loaded
            if (video.readyState >= 1) {
              // HAVE_METADATA or greater
              handleLoadedMetadata();
            } else {
              // Wait for loadedmetadata event
              video.addEventListener("loadedmetadata", handleLoadedMetadata, {
                once: true,
              });
            }

            // Log actual resolution we got from stream settings
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            console.log(
              "[Mobile Scanner] Camera stream settings:",
              settings.width,
              "x",
              settings.height,
            );

            // Configure camera capabilities for document scanning
            try {
              const capabilities = videoTrack.getCapabilities();
              const advanced: MediaTrackConstraintSet[] = [];

              // 1. Enable continuous autofocus
              if (
                capabilities.focusMode &&
                capabilities.focusMode.includes("continuous")
              ) {
                advanced.push({ focusMode: "continuous" });
                console.log("✓ Continuous autofocus enabled");
              }

              // 2. Enable continuous auto-exposure for varying lighting
              if (
                capabilities.exposureMode &&
                capabilities.exposureMode.includes("continuous")
              ) {
                advanced.push({ exposureMode: "continuous" });
                console.log("✓ Auto-exposure enabled");
              }

              // 3. Check if torch/flashlight is supported
              if (capabilities.torch) {
                setTorchSupported(true);
                console.log("✓ Torch/flashlight available");
              }

              // Apply all constraints
              if (advanced.length > 0) {
                await videoTrack.applyConstraints({ advanced });
              }
            } catch (err) {
              console.log("Could not configure camera features:", err);
            }
          }
        })
        .catch((err) => {
          console.error("Camera error:", err);
          setCameraError(
            t(
              "mobileScanner.cameraAccessDenied",
              "Camera access denied. Please enable camera access.",
            ),
          );
          // Auto-switch to file upload if camera fails
          setMode("file");
        });
    }

    return () => {
      // Clean up stream when switching away from camera or showing preview
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // Stop highlighting when camera is stopped
      if (highlightIntervalRef.current) {
        clearInterval(highlightIntervalRef.current);
        highlightIntervalRef.current = null;
      }
      // Reset camera ready state
      setCameraReady(false);
    };
  }, [mode, cameraError, currentPreview, t]);

  // Real-time document highlighting on camera feed
  useEffect(() => {
    console.log(
      `[Mobile Scanner] Effect triggered: mode=${mode}, autoEnhance=${autoEnhance}, openCvReady=${openCvReady}, cameraReady=${cameraReady}, currentPreview=${currentPreview}`,
    );

    if (
      mode === "camera" &&
      autoEnhance &&
      openCvReady &&
      cameraReady &&
      scannerRef.current &&
      !currentPreview
    ) {
      const startHighlighting = () => {
        console.log("[Mobile Scanner] startHighlighting() called");

        if (!videoRef.current || !highlightCanvasRef.current) {
          console.error(
            "[Mobile Scanner] Missing refs: video=" +
              !!videoRef.current +
              ", canvas=" +
              !!highlightCanvasRef.current,
          );
          return;
        }
        if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
          console.error(
            "[Mobile Scanner] Missing video dimensions: " +
              videoRef.current.videoWidth +
              "x" +
              videoRef.current.videoHeight,
          );
          return;
        }

        const video = videoRef.current;
        const highlightCanvas = highlightCanvasRef.current;
        console.log(
          "[Mobile Scanner] Starting highlighting loop for " +
            video.videoWidth +
            "x" +
            video.videoHeight +
            " video",
        );

        // Create low-res detection canvas with optimized context for frequent pixel reading
        const detectionCanvas = document.createElement("canvas");
        const detectionCtx = detectionCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!detectionCtx) return;

        // Calculate scaled dimensions for detection (160px wide max)
        const scale = DETECTION_WIDTH / video.videoWidth;
        detectionCanvas.width = DETECTION_WIDTH;
        detectionCanvas.height = Math.round(video.videoHeight * scale);

        // CRITICAL FIX: Make highlight canvas ALSO low-res (CSS will scale it visually)
        // Drawing to a 4K canvas is what was causing the lag!
        highlightCanvas.width = DETECTION_WIDTH;
        highlightCanvas.height = Math.round(video.videoHeight * scale);

        console.log(
          `[Mobile Scanner] Video: ${video.videoWidth}x${video.videoHeight}`,
        );
        console.log(
          `[Mobile Scanner] Detection: ${detectionCanvas.width}x${detectionCanvas.height} (${Math.round(scale * 100)}%)`,
        );
        console.log(
          `[Mobile Scanner] Highlight canvas: ${highlightCanvas.width}x${highlightCanvas.height}`,
        );
        console.log(`[Mobile Scanner] Starting interval at 1 FPS`);

        // Set highlight canvas to match video for vector drawing
        highlightCanvas.width = video.videoWidth;
        highlightCanvas.height = video.videoHeight;
        const highlightCtx = highlightCanvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!highlightCtx) return;

        // Use requestAnimationFrame with adaptive throttle based on device performance
        let frameCount = 0;
        const frameTimes: number[] = [];
        let lastDetectionTime = 0;
        let detectionInterval = 333; // Start at 3 FPS (333ms)
        const detectionTimings: number[] = []; // Track last 10 detection times
        const MAX_TIMINGS = 10;

        const runDetection = () => {
          const now = performance.now();

          // Only run detection every second
          if (now - lastDetectionTime >= detectionInterval) {
            lastDetectionTime = now;
            const startTime = performance.now();

            try {
              // Step 1: Copy video to low-res detection canvas
              const copyStart = performance.now();
              detectionCtx.drawImage(
                video,
                0,
                0,
                detectionCanvas.width,
                detectionCanvas.height,
              );
              const copyTime = performance.now() - copyStart;

              // Step 2: Simple jscanify detection
              const detectionStart = performance.now();
              let corners: JscanifyCornerPoints | null = null;

              // Run jscanify detection directly - convert canvas to Mat first
              const cv = window.cv;
              const scanner = scannerRef.current;
              if (cv && scanner) {
                const mat = cv.imread(detectionCanvas);
                const contour = scanner.findPaperContour(mat);
                mat.delete();

                if (contour) {
                  corners = scanner.getCornerPoints(contour);
                }
              }

              const detectionTime = performance.now() - detectionStart;

              // Step 3: Draw corner lines on full-res canvas
              const drawStart = performance.now();
              highlightCtx.clearRect(
                0,
                0,
                highlightCanvas.width,
                highlightCanvas.height,
              );

              // Draw lines if corners detected
              if (
                corners &&
                corners.topLeftCorner &&
                corners.topRightCorner &&
                corners.bottomLeftCorner &&
                corners.bottomRightCorner
              ) {
                // Scale corner points from low-res to full-res
                const scaleFactor = video.videoWidth / detectionCanvas.width;
                const tl = {
                  x: corners.topLeftCorner.x * scaleFactor,
                  y: corners.topLeftCorner.y * scaleFactor,
                };
                const tr = {
                  x: corners.topRightCorner.x * scaleFactor,
                  y: corners.topRightCorner.y * scaleFactor,
                };
                const br = {
                  x: corners.bottomRightCorner.x * scaleFactor,
                  y: corners.bottomRightCorner.y * scaleFactor,
                };
                const bl = {
                  x: corners.bottomLeftCorner.x * scaleFactor,
                  y: corners.bottomLeftCorner.y * scaleFactor,
                };

                // Draw green lines connecting corners
                highlightCtx.strokeStyle = "#00FF00";
                highlightCtx.lineWidth = 4;
                highlightCtx.beginPath();
                highlightCtx.moveTo(tl.x, tl.y);
                highlightCtx.lineTo(tr.x, tr.y);
                highlightCtx.lineTo(br.x, br.y);
                highlightCtx.lineTo(bl.x, bl.y);
                highlightCtx.lineTo(tl.x, tl.y);
                highlightCtx.stroke();
              }

              const drawTime = performance.now() - drawStart;

              const totalTime = performance.now() - startTime;
              frameCount++;
              frameTimes.push(totalTime);

              // Track detection timings for adaptive performance
              detectionTimings.push(totalTime);
              if (detectionTimings.length > MAX_TIMINGS) {
                detectionTimings.shift(); // Keep only last 10
              }

              // Adaptive performance adjustment (after warmup period)
              if (frameCount > 5 && detectionTimings.length >= 5) {
                const avgTime =
                  detectionTimings.reduce((a, b) => a + b, 0) /
                  detectionTimings.length;

                // Adjust detection interval based on average performance
                if (avgTime < 20) {
                  // Very fast device: 5 FPS (200ms)
                  detectionInterval = 200;
                } else if (avgTime < 40) {
                  // Fast device: 3 FPS (333ms)
                  detectionInterval = 333;
                } else if (avgTime < 80) {
                  // Medium device: 2 FPS (500ms)
                  detectionInterval = 500;
                } else {
                  // Slower device: 1 FPS (1000ms)
                  detectionInterval = 1000;
                }
              }

              if (frameCount <= 10) {
                console.log(
                  `[Mobile Scanner] Frame ${frameCount}: ${Math.round(totalTime)}ms total (copy: ${Math.round(copyTime)}ms, detect: ${Math.round(detectionTime)}ms, draw: ${Math.round(drawTime)}ms) - interval: ${detectionInterval}ms`,
                );
              }

              if (frameCount === 10) {
                const avg =
                  frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
                console.log(
                  `[Mobile Scanner] Average of first 10 frames: ${Math.round(avg)}ms - Adaptive rate: ${Math.round(1000 / detectionInterval)} FPS`,
                );
              }
            } catch (err) {
              console.error("[Mobile Scanner] Detection error:", err);
            }
          }

          // Continue animation loop
          highlightIntervalRef.current = requestAnimationFrame(runDetection);
        };

        // Start the animation loop
        highlightIntervalRef.current = requestAnimationFrame(runDetection);
      };

      // Wait for video to be ready with retry logic
      let retryCount = 0;
      let retryTimeout: number | null = null;

      const startWhenReady = () => {
        const video = videoRef.current;

        if (!video) {
          console.log("[Mobile Scanner] No video element");
          return;
        }

        console.log(
          `[Mobile Scanner] Video check: readyState=${video.readyState}, width=${video.videoWidth}, height=${video.videoHeight}`,
        );

        if (
          video.readyState >= 2 &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          console.log("[Mobile Scanner] ✓ Video ready, starting detection now");
          startHighlighting();
        } else if (retryCount < 50) {
          // Retry up to 50 times (5 seconds)
          retryCount++;
          console.log(
            `[Mobile Scanner] Video not ready yet, retry ${retryCount}/50...`,
          );
          retryTimeout = window.setTimeout(startWhenReady, 100);
        } else {
          console.error(
            "[Mobile Scanner] ✗ Video failed to become ready after 5 seconds",
          );
        }
      };

      // Add event listener as fallback
      const videoElement = videoRef.current;
      if (videoElement) {
        console.log("[Mobile Scanner] Adding loadedmetadata listener");
        videoElement.addEventListener("loadedmetadata", startWhenReady);
        // Also try immediately
        startWhenReady();
      } else {
        console.error("[Mobile Scanner] No video element available");
      }

      return () => {
        console.log("[Mobile Scanner] Cleanup: Stopping detection");

        // Clean up animation frame
        if (highlightIntervalRef.current) {
          cancelAnimationFrame(highlightIntervalRef.current);
          highlightIntervalRef.current = null;
        }

        // Clean up retry timeout
        if (retryTimeout !== null) {
          clearTimeout(retryTimeout);
          retryTimeout = null;
        }

        // Clean up event listener
        if (videoElement) {
          videoElement.removeEventListener("loadedmetadata", startWhenReady);
        }
      };
    }
  }, [mode, autoEnhance, openCvReady, cameraReady, currentPreview]);

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (!context) return;

      // Capture raw image from video at full resolution
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let finalDataUrl: string;

      // Apply jscanify processing if enabled and available
      const cv = window.cv;
      const scanner = scannerRef.current;
      if (autoEnhance && scanner && openCvReady && cv) {
        try {
          // Create low-res canvas for detection (faster processing)
          const detectionCanvas = document.createElement("canvas");
          const detectionCtx = detectionCanvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (!detectionCtx) throw new Error("Cannot create detection context");

          const scale = DETECTION_WIDTH / video.videoWidth;
          detectionCanvas.width = DETECTION_WIDTH;
          detectionCanvas.height = Math.round(video.videoHeight * scale);

          // Draw downscaled image for detection
          detectionCtx.drawImage(
            video,
            0,
            0,
            detectionCanvas.width,
            detectionCanvas.height,
          );

          // Run detection on low-res image
          const mat = cv.imread(detectionCanvas);
          const contour = scanner.findPaperContour(mat);

          if (contour) {
            const cornerPoints = scanner.getCornerPoints(contour);

            // Scale corner points back to full resolution
            if (cornerPoints) {
              const scaleFactor = 1 / scale;
              const scaledCorners = {
                topLeftCorner: {
                  x: cornerPoints.topLeftCorner.x * scaleFactor,
                  y: cornerPoints.topLeftCorner.y * scaleFactor,
                },
                topRightCorner: {
                  x: cornerPoints.topRightCorner.x * scaleFactor,
                  y: cornerPoints.topRightCorner.y * scaleFactor,
                },
                bottomLeftCorner: {
                  x: cornerPoints.bottomLeftCorner.x * scaleFactor,
                  y: cornerPoints.bottomLeftCorner.y * scaleFactor,
                },
                bottomRightCorner: {
                  x: cornerPoints.bottomRightCorner.x * scaleFactor,
                  y: cornerPoints.bottomRightCorner.y * scaleFactor,
                },
              };

              // Use scaled corners for extraction
              const {
                topLeftCorner,
                topRightCorner,
                bottomLeftCorner,
                bottomRightCorner,
              } = scaledCorners;

              console.log("Document detected at full resolution:", {
                corners: scaledCorners,
              });

              // Calculate width and height of the document
              const topWidth = Math.hypot(
                topRightCorner.x - topLeftCorner.x,
                topRightCorner.y - topLeftCorner.y,
              );
              const bottomWidth = Math.hypot(
                bottomRightCorner.x - bottomLeftCorner.x,
                bottomRightCorner.y - bottomLeftCorner.y,
              );
              const leftHeight = Math.hypot(
                bottomLeftCorner.x - topLeftCorner.x,
                bottomLeftCorner.y - topLeftCorner.y,
              );
              const rightHeight = Math.hypot(
                bottomRightCorner.x - topRightCorner.x,
                bottomRightCorner.y - topRightCorner.y,
              );

              // Use average dimensions to maintain proper aspect ratio
              const docWidth = Math.round((topWidth + bottomWidth) / 2);
              const docHeight = Math.round((leftHeight + rightHeight) / 2);

              // Extract paper from full-resolution canvas with scaled corner points
              const resultCanvas = scanner.extractPaper(
                canvas,
                docWidth,
                docHeight,
                scaledCorners,
              );

              // Clean up Mat
              mat.delete();

              // Use high quality JPEG compression to preserve image quality
              finalDataUrl = resultCanvas.toDataURL("image/jpeg", 0.95);
            } else {
              console.log("No corners detected, using original");
              mat.delete();
              finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);
            }
          } else {
            console.log("No contour detected, using original");
            mat.delete();
            finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);
          }
        } catch (err) {
          console.warn(
            "jscanify processing failed, using original image:",
            err,
          );
          finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);
        }
      } else {
        // Auto-enhance disabled or jscanify not available - use original at high quality
        finalDataUrl = canvas.toDataURL("image/jpeg", 0.95);
      }

      setCurrentPreview(finalDataUrl);
    } finally {
      setIsProcessing(false);
    }
  }, [autoEnhance, openCvReady]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const images = Array.from(input.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );

      if (images.length === 0) {
        input.value = "";
        setUploadError(
          t("mobileScanner.invalidFileType", "Please choose an image file."),
        );
        return;
      }

      setUploadError(null);

      let dataUrls: string[];
      try {
        dataUrls = await Promise.all(images.map(readFileAsDataUrl));
      } catch (err) {
        console.error("Failed to read selected files:", err);
        setUploadError(
          t("mobileScanner.fileReadFailed", "Could not read that file."),
        );
        return;
      } finally {
        // Reset so re-picking the same file still fires onChange.
        input.value = "";
      }

      // Keep selection order: everything but the last joins the batch, the
      // last stays on screen for review.
      const queued = dataUrls.slice(0, -1);
      const preview = dataUrls[dataUrls.length - 1];
      setCapturedImages((prev) =>
        currentPreview
          ? [...prev, currentPreview, ...queued]
          : [...prev, ...queued],
      );
      setCurrentPreview(preview);
    },
    [currentPreview, t],
  );

  const addToBatch = useCallback(() => {
    if (currentPreview) {
      setCapturedImages((prev) => [...prev, currentPreview]);
      setCurrentPreview(null);
    }
  }, [currentPreview]);

  const uploadImages = useCallback(async () => {
    const imagesToUpload = currentPreview
      ? [...capturedImages, currentPreview]
      : capturedImages;

    if (imagesToUpload.length === 0) return;
    if (!sessionId) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      // Convert data URLs to File objects
      const files: File[] = [];
      for (let i = 0; i < imagesToUpload.length; i++) {
        const dataUrl = imagesToUpload[i];
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `scan-${Date.now()}-${i}.jpg`, {
          type: "image/jpeg",
        });
        files.push(file);
        setUploadProgress(((i + 1) / (imagesToUpload.length + 1)) * 50); // 0-50% for conversion
      }

      // Upload to backend
      const formData = new FormData();
      files.forEach((file) => {
        formData.append("files", file);
      });

      const uploadResponse = await fetch(
        `${API_BASE}/api/v1/mobile-scanner/upload/${sessionId}`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      setUploadProgress(100);
      setCurrentPreview(null);
      setCapturedImages([]);
      setUploadSuccess(true);

      // Only tabs this app opened can be closed by script; everywhere else the
      // success screen stays put. Navigating instead would land a signed-out
      // phone on the login page.
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadError(
        t("mobileScanner.uploadFailed", "Upload failed. Please try again."),
      );
    } finally {
      setIsUploading(false);
    }
  }, [currentPreview, capturedImages, sessionId, t]);

  const retake = useCallback(() => {
    setCurrentPreview(null);
  }, []);

  const clearBatch = useCallback(() => {
    setCapturedImages([]);
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const startOver = useCallback(() => {
    setUploadSuccess(false);
    setUploadProgress(0);
    setUploadError(null);
    setMode("choice");
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      await videoTrack.applyConstraints({
        advanced: [{ torch: !torchEnabled }],
      });
      setTorchEnabled(!torchEnabled);
      console.log("Torch:", !torchEnabled ? "ON" : "OFF");
    } catch (err) {
      console.error("Failed to toggle torch:", err);
    }
  }, [torchEnabled]);

  // Show loading while validating
  if (sessionValid === null) {
    return (
      <Box
        p="xl"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <Text size="lg">
          {t("mobileScanner.validating", "Validating session...")}
        </Text>
      </Box>
    );
  }

  // Show error if session is invalid
  if (!sessionValid || !sessionId) {
    return (
      <Box p="xl">
        <Alert
          color="red"
          title={t("mobileScanner.sessionInvalid", "Session Error")}
        >
          {sessionError ||
            t(
              "mobileScanner.noSessionMessage",
              "Session not found. Please try again.",
            )}
        </Alert>
      </Box>
    );
  }

  if (uploadSuccess) {
    return (
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.25rem",
          height: "100dvh",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <CheckCircleRoundedIcon
          style={{ fontSize: "4rem", color: "var(--mantine-color-green-6)" }}
        />
        <Text size="xl" fw="bold" mt="md">
          {t("mobileScanner.uploadSuccess", "Upload Successful!")}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "mobileScanner.uploadSuccessMessage",
            "Your images have been transferred.",
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t("mobileScanner.closeTabHint", "You can close this tab now.")}
        </Text>
        <DSButton
          variant="secondary"
          size="md"
          style={{ marginTop: "1.5rem" }}
          onClick={startOver}
        >
          {t("mobileScanner.scanAnother", "Scan another")}
        </DSButton>
      </Box>
    );
  }

  const cameraStarting =
    mode === "camera" && !currentPreview && !cameraReady && !cameraError;
  const batchCount = capturedImages.length + (currentPreview ? 1 : 0);
  const canUpload = batchCount > 0;
  // Choice screen with nothing captured has no action of its own; anywhere
  // else the bar carries the primary action.
  const showActionBar =
    Boolean(currentPreview) ||
    mode === "camera" ||
    mode === "file" ||
    canUpload;
  const buttonSize = compact ? "sm" : "md";
  const visibleThumbs = capturedImages.slice(0, MAX_VISIBLE_THUMBS);
  const hiddenThumbs = capturedImages.length - visibleThumbs.length;

  const uploadButton = canUpload ? (
    <DSButton
      fullWidth
      variant="primary"
      size={buttonSize}
      onClick={uploadImages}
      loading={isUploading}
    >
      {t("mobileScanner.uploadWithCount", "Upload ({{total}})", {
        total: batchCount,
      })}
    </DSButton>
  ) : null;

  // One fixed-height column that never scrolls: header and notices on top, a
  // content region that shrinks to whatever is left, actions pinned to the
  // bottom. Every level clips, so nothing can render off screen.
  return (
    <Box
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        background: "var(--c-bg)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {!compact && (
        <Box
          style={{
            flex: "0 0 auto",
            padding: FLUID.pad,
            background: "var(--c-bg-raised)",
            borderBottom: "1px solid var(--c-border-subtle)",
          }}
        >
          <Group gap="sm" align="center" wrap="nowrap">
            <LogoIcon
              alt={t("home.mobile.brandAlt", "Stirling PDF logo")}
              style={{ height: FLUID.logo, width: FLUID.logo }}
            />
            <Wordmark alt="Stirling PDF" style={{ height: FLUID.wordmark }} />
          </Group>
        </Box>
      )}

      {/* Notices - compact, and capped so they can never squeeze the content
          region away on a short screen */}
      <Box style={{ flex: "0 0 auto", maxHeight: "30dvh", overflow: "hidden" }}>
        {cameraStarting && (
          <Box
            px="xs"
            py={4}
            style={{
              background: "var(--mantine-color-blue-1)",
              borderBottom: "1px solid var(--c-border-subtle)",
              fontSize: FLUID.body,
              textAlign: "center",
            }}
          >
            {t("mobileScanner.startingCamera", "Starting camera…")}
          </Box>
        )}

        {uploadError && (
          <Alert
            color="red"
            radius={0}
            py={4}
            icon={<ErrorRoundedIcon style={{ fontSize: "1.1rem" }} />}
            onClose={() => setUploadError(null)}
            withCloseButton
            closeButtonLabel={t("mobileScanner.dismiss", "Dismiss")}
          >
            <Text style={{ fontSize: FLUID.body }}>{uploadError}</Text>
          </Alert>
        )}

        {/* Camera/HTTPS warning: dismissible, and hidden while a preview is
            waiting on the user so it never crowds the upload decision. */}
        {cameraError && !currentPreview && (
          <Alert
            color="orange"
            radius={0}
            py={4}
            icon={<InfoRoundedIcon style={{ fontSize: "1.1rem" }} />}
            onClose={() => setCameraError(null)}
            withCloseButton
            closeButtonLabel={t("mobileScanner.dismiss", "Dismiss")}
          >
            <Text style={{ fontSize: FLUID.body }}>{cameraError}</Text>
          </Alert>
        )}

        {isUploading && (
          <Box px="md" py={4}>
            <Text style={{ fontSize: FLUID.body }} mb={2}>
              {t("mobileScanner.uploading", "Uploading...")}
            </Text>
            <Progress value={uploadProgress} animated size="sm" />
          </Box>
        )}
      </Box>

      {/* Content region - takes whatever is left and clips, never scrolls */}
      <Box
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {currentPreview ? (
          /* Preview takes over whichever mode produced it */
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              background: "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <img
              src={currentPreview}
              alt={t("mobileScanner.previewAlt", "Selected image")}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                display: "block",
                objectFit: "contain",
              }}
            />
          </Box>
        ) : mode === "choice" ? (
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: FLUID.gap,
              padding: FLUID.pad,
              width: "100%",
              maxWidth: "500px",
              margin: "0 auto",
              overflow: "hidden",
            }}
          >
            {!compact && (
              <Stack gap={2} align="center" style={{ flex: "0 0 auto" }}>
                <Text fw={700} ta="center" style={{ fontSize: FLUID.title }}>
                  {t("mobileScanner.chooseMethod", "Choose Upload Method")}
                </Text>
                <Text
                  c="dimmed"
                  ta="center"
                  style={{ fontSize: FLUID.body }}
                  lineClamp={2}
                >
                  {t(
                    "mobileScanner.chooseMethodDescription",
                    "Select how you want to scan and upload documents",
                  )}
                </Text>
              </Stack>
            )}

            {/* Cards share the leftover height rather than overflowing it */}
            <Box
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                display: "flex",
                flexDirection: compact ? "row" : "column",
                justifyContent: "center",
                gap: FLUID.gap,
              }}
            >
              {[
                {
                  key: "camera",
                  icon: (
                    <PhotoCameraRoundedIcon
                      style={{
                        fontSize: FLUID.icon,
                        color: "var(--c-accent-text)",
                      }}
                    />
                  ),
                  title: t("mobileScanner.camera", "Camera"),
                  description: t(
                    "mobileScanner.cameraDescription",
                    "Scan documents using your device camera with automatic edge detection",
                  ),
                  onClick: () => {
                    setCameraError(null);
                    setMode("camera" as const);
                  },
                },
                {
                  key: "file",
                  icon: (
                    <UploadRoundedIcon
                      style={{
                        fontSize: FLUID.icon,
                        color: "var(--mantine-color-green-6)",
                      }}
                    />
                  ),
                  title: t("mobileScanner.fileUpload", "File Upload"),
                  description: t(
                    "mobileScanner.fileDescription",
                    "Upload existing photos or documents from your device",
                  ),
                  onClick: () => setMode("file" as const),
                },
              ].map((choice) => (
                <Card
                  key={choice.key}
                  shadow="sm"
                  radius="md"
                  withBorder
                  p={FLUID.pad}
                  onClick={choice.onClick}
                  style={{
                    flex: "1 1 0",
                    minHeight: 0,
                    minWidth: 0,
                    // Cap the height so roomy portrait screens do not stretch
                    // the cards into mostly-empty slabs. Side by side on a
                    // short screen they fill what is there instead.
                    maxHeight: compact
                      ? undefined
                      : "clamp(110px, 26dvh, 220px)",
                    cursor: "pointer",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Stack
                    align="center"
                    gap={FLUID.gap}
                    style={{ minHeight: 0 }}
                  >
                    {choice.icon}
                    <Text
                      fw={600}
                      ta="center"
                      style={{ fontSize: FLUID.title }}
                    >
                      {choice.title}
                    </Text>
                    {!compact && (
                      <Text
                        c="dimmed"
                        ta="center"
                        lineClamp={3}
                        style={{ fontSize: FLUID.body }}
                      >
                        {choice.description}
                      </Text>
                    )}
                  </Stack>
                </Card>
              ))}
            </Box>
          </Box>
        ) : mode === "camera" ? (
          <Box
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              background: "#000",
              overflow: "hidden",
            }}
          >
            <DSButton
              onClick={() => setMode("choice")}
              variant="primary"
              size="sm"
              style={{
                position: "absolute",
                top: "0.75rem",
                left: "0.75rem",
                zIndex: 10,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                backdropFilter: "blur(8px)",
                border: "none",
              }}
            >
              ← {t("mobileScanner.back", "Back")}
            </DSButton>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: "contain",
              }}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {/* Highlight overlay canvas - real-time document edge detection */}
            <canvas
              ref={highlightCanvasRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                opacity: autoEnhance ? 1 : 0,
                transition: "opacity 0.2s",
                objectFit: "contain",
                imageRendering: "auto",
              }}
            />
          </Box>
        ) : (
          <Box
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: FLUID.gap,
              padding: FLUID.pad,
              width: "100%",
              maxWidth: "500px",
              margin: "0 auto",
              overflow: "hidden",
            }}
          >
            <DSButton
              onClick={() => setMode("choice")}
              variant="tertiary"
              size="sm"
              style={{ alignSelf: "flex-start", flex: "0 0 auto" }}
            >
              ← {t("mobileScanner.back", "Back")}
            </DSButton>
            <Card
              shadow="sm"
              radius="md"
              withBorder
              p={FLUID.pad}
              onClick={openFilePicker}
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                maxHeight: compact ? undefined : "clamp(140px, 34dvh, 300px)",
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Stack align="center" gap={FLUID.gap} style={{ minHeight: 0 }}>
                <UploadRoundedIcon
                  style={{
                    fontSize: FLUID.icon,
                    color: "var(--mantine-color-gray-5)",
                  }}
                />
                <Text fw={600} ta="center" style={{ fontSize: FLUID.title }}>
                  {t(
                    "mobileScanner.selectFilesPrompt",
                    "Select files to upload",
                  )}
                </Text>
              </Stack>
            </Card>
          </Box>
        )}
      </Box>

      {/* Outside the mode branches so the pinned bar can reach it from the
          preview screen too. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Batch strip - sits directly above the actions, always in view */}
      {capturedImages.length > 0 && (
        <Box
          px="sm"
          py={4}
          style={{
            flex: "0 0 auto",
            borderTop: "1px solid var(--c-border-subtle)",
            background: "var(--c-bg-raised)",
            overflow: "hidden",
          }}
        >
          <Group justify="space-between" mb={4} wrap="nowrap">
            <Text fw={600} style={{ fontSize: FLUID.body }}>
              {t("mobileScanner.batchImages", "Batch")} ({capturedImages.length}
              )
            </Text>
            <DSButton
              size="sm"
              variant="quiet"
              accent="danger"
              onClick={clearBatch}
            >
              {t("mobileScanner.clearBatch", "Clear")}
            </DSButton>
          </Group>
          <Box
            style={{
              display: "flex",
              gap: "var(--space-xs)",
              overflow: "hidden",
            }}
          >
            {visibleThumbs.map((img, idx) => (
              <Box
                key={idx}
                style={{
                  // Shrink to share the row on narrow screens; capped so a
                  // short batch does not stretch into giant tiles.
                  flex: "1 1 0",
                  minWidth: 0,
                  maxWidth: THUMB_SIZE,
                  height: THUMB_SIZE,
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  border: "2px solid var(--c-border-subtle)",
                }}
              >
                <img
                  src={img}
                  alt={`${t("mobileScanner.batchImages", "Batch")} ${idx + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "block",
                    objectFit: "cover",
                  }}
                />
              </Box>
            ))}
            {hiddenThumbs > 0 && (
              <Box
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  maxWidth: THUMB_SIZE,
                  height: THUMB_SIZE,
                  borderRadius: "var(--radius-sm)",
                  border: "2px solid var(--c-border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text fw={600} style={{ fontSize: FLUID.body }}>
                  +{hiddenThumbs}
                </Text>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Action bar - pinned to the bottom of the viewport on every screen */}
      {showActionBar && (
        <Box
          style={{
            flex: "0 0 auto",
            backgroundColor: "var(--c-bg-raised)",
            borderTop: "1px solid var(--c-border-subtle)",
            padding: `${FLUID.gap} 1rem`,
            paddingBottom: `calc(${FLUID.gap} + env(safe-area-inset-bottom, 0px))`,
          }}
        >
          <Stack gap={FLUID.gap}>
            {mode === "camera" && !currentPreview && (
              <Group justify="space-around" style={{ width: "100%" }}>
                <Group gap="xs">
                  <Switch
                    size="sm"
                    checked={autoEnhance}
                    onChange={(e) => setAutoEnhance(e.currentTarget.checked)}
                    disabled={!openCvReady}
                  />
                  <Text style={{ fontSize: FLUID.body }}>
                    {t("mobileScanner.edgeDetection", "Edge Detection")}
                  </Text>
                </Group>
                {torchSupported && (
                  <Group gap="xs">
                    <Switch
                      size="sm"
                      checked={torchEnabled}
                      onChange={toggleTorch}
                    />
                    <Text style={{ fontSize: FLUID.body }}>
                      {t("mobileScanner.flashlight", "Flash")}
                    </Text>
                  </Group>
                )}
              </Group>
            )}

            {/* On short screens every action shares one row so the bar stays
                a single line tall. */}
            <Group grow wrap="nowrap">
              {currentPreview && (
                <DSButton
                  variant="secondary"
                  size={buttonSize}
                  onClick={retake}
                >
                  {mode === "camera"
                    ? t("mobileScanner.retake", "Retake")
                    : t("mobileScanner.remove", "Remove")}
                </DSButton>
              )}
              {currentPreview && (
                <DSButton
                  variant="secondary"
                  size={buttonSize}
                  onClick={mode === "camera" ? addToBatch : openFilePicker}
                >
                  {mode === "camera"
                    ? t("mobileScanner.addToBatch", "Add to Batch")
                    : t("mobileScanner.addMore", "Add More")}
                </DSButton>
              )}
              {mode === "camera" && !currentPreview && (
                <DSButton
                  size={buttonSize}
                  onClick={captureImage}
                  loading={isProcessing}
                  variant="primary"
                >
                  {isProcessing
                    ? t("mobileScanner.processing", "Processing...")
                    : t("mobileScanner.capture", "Capture")}
                </DSButton>
              )}
              {mode === "file" && !currentPreview && (
                <DSButton
                  size={buttonSize}
                  variant={canUpload ? "secondary" : "primary"}
                  onClick={openFilePicker}
                  leftSection={<AddPhotoAlternateRoundedIcon />}
                >
                  {t("mobileScanner.selectImage", "Select Image")}
                </DSButton>
              )}
              {compact && uploadButton}
            </Group>

            {!compact && uploadButton}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

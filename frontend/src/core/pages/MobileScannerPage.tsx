import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Text, Group, Alert, Tabs, Progress, Switch, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLogoPath } from '@app/hooks/useLogoPath';
import { useLogoAssets } from '@app/hooks/useLogoAssets';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
// @ts-ignore - jscanify doesn't have TypeScript definitions
import jscanify from 'jscanify/src/jscanify.js';

/**
 * MobileScannerPage
 *
 * Mobile-friendly page for capturing photos and uploading them to the backend server.
 * Accessed by scanning QR code from desktop.
 */
export default function MobileScannerPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');
  const { colorScheme } = useMantineColorScheme();
  const brandIconSrc = useLogoPath();
  const { wordmark } = useLogoAssets();
  const brandTextSrc = colorScheme === 'dark' ? wordmark.white : wordmark.black;

  const [activeTab, setActiveTab] = useState<string | null>('camera');
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [showLiveDetection, setShowLiveDetection] = useState(true); // On by default with adaptive performance
  const [isProcessing, setIsProcessing] = useState(false);
  const [openCvReady, setOpenCvReady] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null); // Low-res canvas for detection only
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<any>(null);
  const highlightIntervalRef = useRef<number | null>(null);

  // Detection resolution - extremely low for mobile performance
  const DETECTION_WIDTH = 160; // Ultra-low for real-time mobile detection

  // Initialize jscanify scanner and wait for OpenCV
  useEffect(() => {
    let script: HTMLScriptElement | null = null;

    const loadOpenCV = () => {
      // Check if OpenCV is already loaded
      if ((window as any).cv && (window as any).cv.Mat) {
        initScanner();
        return;
      }

      // Check if script already exists
      const existingScript = document.querySelector('script[src*="opencv.js"]');
      if (existingScript) {
        // Script exists, wait for it to load
        (window as any).onOpenCvReady = initScanner;
        return;
      }

      // Load OpenCV.js from CDN
      script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.7.0/opencv.js';
      script.async = true;
      script.onload = () => {
        console.log('OpenCV.js loaded');
        // OpenCV needs a moment to initialize after script loads
        setTimeout(initScanner, 100);
      };
      script.onerror = () => {
        console.error('Failed to load OpenCV.js');
      };
      document.head.appendChild(script);
    };

    const initScanner = () => {
      // Verify OpenCV is actually ready
      if (!(window as any).cv || !(window as any).cv.Mat) {
        console.warn('OpenCV not ready yet, retrying...');
        setTimeout(initScanner, 100);
        return;
      }

      try {
        scannerRef.current = new jscanify();
        setOpenCvReady(true);
        console.log('jscanify initialized with OpenCV');
      } catch (err) {
        console.error('Failed to initialize jscanify:', err);
      }
    };

    // Start loading process
    if (document.readyState === 'complete') {
      loadOpenCV();
    } else {
      window.addEventListener('load', loadOpenCV);
    }

    return () => {
      window.removeEventListener('load', loadOpenCV);
      // Don't remove script on unmount as other components might use it
    };
  }, []);

  // Initialize camera
  useEffect(() => {
    if (activeTab === 'camera' && !cameraError && !currentPreview) {
      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('MediaDevices API not available - requires HTTPS or localhost');
        setCameraError(
          t(
            'mobileScanner.httpsRequired',
            'Camera access requires HTTPS or localhost. Please use HTTPS or access via localhost.'
          )
        );
        setActiveTab('file');
        return;
      }

      navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: 'environment',
            // Request 1080p - good quality without going overboard
            width: { ideal: 1920, max: 1920 },
            height: { ideal: 1080, max: 1080 },
          },
          audio: false,
        })
        .then(async (stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;

            // Log actual resolution we got
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            console.log('Camera resolution:', settings.width, 'x', settings.height);

            // Configure camera capabilities for document scanning
            try {
              const capabilities = videoTrack.getCapabilities();
              const constraints: any = { advanced: [] };

              // 1. Enable continuous autofocus
              if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                constraints.advanced.push({ focusMode: 'continuous' });
                console.log('✓ Continuous autofocus enabled');
              }

              // 2. Enable continuous auto-exposure for varying lighting
              if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
                constraints.advanced.push({ exposureMode: 'continuous' });
                console.log('✓ Auto-exposure enabled');
              }

              // 3. Check if torch/flashlight is supported
              if (capabilities.torch) {
                setTorchSupported(true);
                console.log('✓ Torch/flashlight available');
              }

              // Apply all constraints
              if (constraints.advanced.length > 0) {
                await videoTrack.applyConstraints(constraints);
              }
            } catch (err) {
              console.log('Could not configure camera features:', err);
            }
          }
        })
        .catch((err) => {
          console.error('Camera error:', err);
          setCameraError(t('mobileScanner.cameraAccessDenied', 'Camera access denied. Please enable camera access.'));
          // Auto-switch to file upload if camera fails
          setActiveTab('file');
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
    };
  }, [activeTab, cameraError, currentPreview, t]);

  // Real-time document highlighting on camera feed
  useEffect(() => {
    console.log(`[Mobile Scanner] Effect triggered: activeTab=${activeTab}, showLiveDetection=${showLiveDetection}, openCvReady=${openCvReady}, currentPreview=${currentPreview}`);

    if (activeTab === 'camera' && showLiveDetection && openCvReady && scannerRef.current && !currentPreview) {
      const startHighlighting = () => {
        if (!videoRef.current || !highlightCanvasRef.current) return;
        if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) return;

        const video = videoRef.current;
        const highlightCanvas = highlightCanvasRef.current;

        // Create low-res detection canvas with optimized context for frequent pixel reading
        const detectionCanvas = document.createElement('canvas');
        const detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });
        if (!detectionCtx) return;

        // Calculate scaled dimensions for detection (160px wide max)
        const scale = DETECTION_WIDTH / video.videoWidth;
        detectionCanvas.width = DETECTION_WIDTH;
        detectionCanvas.height = Math.round(video.videoHeight * scale);

        // CRITICAL FIX: Make highlight canvas ALSO low-res (CSS will scale it visually)
        // Drawing to a 4K canvas is what was causing the lag!
        highlightCanvas.width = DETECTION_WIDTH;
        highlightCanvas.height = Math.round(video.videoHeight * scale);

        console.log(`[Mobile Scanner] Video: ${video.videoWidth}x${video.videoHeight}`);
        console.log(`[Mobile Scanner] Detection: ${detectionCanvas.width}x${detectionCanvas.height} (${Math.round(scale * 100)}%)`);
        console.log(`[Mobile Scanner] Highlight canvas: ${highlightCanvas.width}x${highlightCanvas.height}`);
        console.log(`[Mobile Scanner] Starting interval at 1 FPS`);

        // Set highlight canvas to match video for vector drawing
        highlightCanvas.width = video.videoWidth;
        highlightCanvas.height = video.videoHeight;
        const highlightCtx = highlightCanvas.getContext('2d', { willReadFrequently: true });
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
              detectionCtx.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);
              const copyTime = performance.now() - copyStart;

              // Step 2: Run detection on low-res to get corner points
              const detectionStart = performance.now();
              const mat = (window as any).cv.imread(detectionCanvas);
              const contour = scannerRef.current.findPaperContour(mat);
              let corners = null;

              if (contour) {
                // Validate contour area (reject if too small or too large)
                const contourArea = (window as any).cv.contourArea(contour);
                const frameArea = detectionCanvas.width * detectionCanvas.height;
                const areaPercent = (contourArea / frameArea) * 100;

                // Only accept if contour is 15-85% of frame (filters out noise and frame edges)
                if (areaPercent >= 15 && areaPercent <= 85) {
                  corners = scannerRef.current.getCornerPoints(contour);
                }
              }
              mat.delete();
              const detectionTime = performance.now() - detectionStart;

              // Step 3: Draw ONLY the corner lines on full-res canvas (super fast!)
              const drawStart = performance.now();
              highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

              // Validate we have all 4 corners (no triangles!)
              if (
                corners &&
                corners.topLeftCorner &&
                corners.topRightCorner &&
                corners.bottomLeftCorner &&
                corners.bottomRightCorner
              ) {
                // Scale corner points from low-res to full-res
                const scaleFactor = video.videoWidth / detectionCanvas.width;
                const tl = { x: corners.topLeftCorner.x * scaleFactor, y: corners.topLeftCorner.y * scaleFactor };
                const tr = { x: corners.topRightCorner.x * scaleFactor, y: corners.topRightCorner.y * scaleFactor };
                const br = { x: corners.bottomRightCorner.x * scaleFactor, y: corners.bottomRightCorner.y * scaleFactor };
                const bl = { x: corners.bottomLeftCorner.x * scaleFactor, y: corners.bottomLeftCorner.y * scaleFactor };

                // Validation 1: Minimum distance between corners
                const minDistance = 50;
                const distances = [
                  Math.hypot(tr.x - tl.x, tr.y - tl.y),
                  Math.hypot(br.x - tr.x, br.y - tr.y),
                  Math.hypot(bl.x - br.x, bl.y - br.y),
                  Math.hypot(tl.x - bl.x, tl.y - bl.y),
                ];

                const allCornersSpaced = distances.every((d) => d > minDistance);

                // Validation 2: Aspect ratio (documents are ~1.0 to 1.5 ratio)
                const width1 = Math.hypot(tr.x - tl.x, tr.y - tl.y);
                const width2 = Math.hypot(br.x - bl.x, br.y - bl.y);
                const height1 = Math.hypot(bl.x - tl.x, bl.y - tl.y);
                const height2 = Math.hypot(br.x - tr.x, br.y - tr.y);

                const avgWidth = (width1 + width2) / 2;
                const avgHeight = (height1 + height2) / 2;
                const aspectRatio = Math.max(avgWidth, avgHeight) / Math.min(avgWidth, avgHeight);

                // Accept aspect ratios from 1:1 (square) to 1:2 (elongated document)
                const goodAspectRatio = aspectRatio >= 1.0 && aspectRatio <= 2.0;

                if (allCornersSpaced && goodAspectRatio) {
                  // Draw lines connecting corners (vector graphics - super lightweight!)
                  highlightCtx.strokeStyle = '#00FF00';
                  highlightCtx.lineWidth = 4;
                  highlightCtx.beginPath();
                  highlightCtx.moveTo(tl.x, tl.y);
                  highlightCtx.lineTo(tr.x, tr.y);
                  highlightCtx.lineTo(br.x, br.y);
                  highlightCtx.lineTo(bl.x, bl.y);
                  highlightCtx.lineTo(tl.x, tl.y);
                  highlightCtx.stroke();
                }
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
                const avgTime = detectionTimings.reduce((a, b) => a + b, 0) / detectionTimings.length;

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
                console.log(`[Mobile Scanner] Frame ${frameCount}: ${Math.round(totalTime)}ms total (copy: ${Math.round(copyTime)}ms, detect: ${Math.round(detectionTime)}ms, draw: ${Math.round(drawTime)}ms) - interval: ${detectionInterval}ms`);
              }

              if (frameCount === 10) {
                const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
                console.log(`[Mobile Scanner] Average of first 10 frames: ${Math.round(avg)}ms - Adaptive rate: ${Math.round(1000/detectionInterval)} FPS`);
              }
            } catch (err) {
              console.error('[Mobile Scanner] Detection error:', err);
            }
          }

          // Continue animation loop
          highlightIntervalRef.current = requestAnimationFrame(runDetection);
        };

        // Start the animation loop
        highlightIntervalRef.current = requestAnimationFrame(runDetection);
      };

      // Wait for video to be ready
      if (videoRef.current && videoRef.current.readyState >= 2) {
        startHighlighting();
      } else if (videoRef.current) {
        videoRef.current.addEventListener('loadedmetadata', startHighlighting);
      }

      return () => {
        if (highlightIntervalRef.current) {
          console.log('[Mobile Scanner] Stopping detection');
          cancelAnimationFrame(highlightIntervalRef.current);
          highlightIntervalRef.current = null;
        }
      };
    }
  }, [activeTab, showLiveDetection, openCvReady, currentPreview]);

  const captureImage = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      // Capture raw image from video at full resolution
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      let finalDataUrl: string;

      // Apply jscanify processing if enabled and available
      if (autoEnhance && scannerRef.current && openCvReady) {
        try {
          // Create low-res canvas for detection (faster processing)
          const detectionCanvas = document.createElement('canvas');
          const detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });
          if (!detectionCtx) throw new Error('Cannot create detection context');

          const scale = DETECTION_WIDTH / video.videoWidth;
          detectionCanvas.width = DETECTION_WIDTH;
          detectionCanvas.height = Math.round(video.videoHeight * scale);

          // Draw downscaled image for detection
          detectionCtx.drawImage(video, 0, 0, detectionCanvas.width, detectionCanvas.height);

          // Run detection on low-res image
          const mat = (window as any).cv.imread(detectionCanvas);
          const contour = scannerRef.current.findPaperContour(mat);

          if (contour) {
            const cornerPoints = scannerRef.current.getCornerPoints(contour);

            // Scale corner points back to full resolution
            if (cornerPoints) {
              const scaleFactor = 1 / scale;
              const scaledCorners = {
                topLeftCorner: { x: cornerPoints.topLeftCorner.x * scaleFactor, y: cornerPoints.topLeftCorner.y * scaleFactor },
                topRightCorner: { x: cornerPoints.topRightCorner.x * scaleFactor, y: cornerPoints.topRightCorner.y * scaleFactor },
                bottomLeftCorner: { x: cornerPoints.bottomLeftCorner.x * scaleFactor, y: cornerPoints.bottomLeftCorner.y * scaleFactor },
                bottomRightCorner: { x: cornerPoints.bottomRightCorner.x * scaleFactor, y: cornerPoints.bottomRightCorner.y * scaleFactor },
              };

              // Use scaled corners for validation and extraction
              const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = scaledCorners;

              // Validate corner points are reasonable (minimum distance in full-res)
              const minDistance = 100; // Minimum pixels between corners at full resolution
              const distances = [
                Math.hypot(topRightCorner.x - topLeftCorner.x, topRightCorner.y - topLeftCorner.y),
                Math.hypot(bottomRightCorner.x - topRightCorner.x, bottomRightCorner.y - topRightCorner.y),
                Math.hypot(bottomLeftCorner.x - bottomRightCorner.x, bottomLeftCorner.y - bottomRightCorner.y),
                Math.hypot(topLeftCorner.x - bottomLeftCorner.x, topLeftCorner.y - bottomLeftCorner.y),
              ];

              const isValidDetection = distances.every((d) => d > minDistance);

              if (!isValidDetection) {
                console.warn('Detected corners are too close together, using original image');
                finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                return;
              }

              console.log('Valid document detected at full resolution:', {
                corners: scaledCorners,
                distances: distances.map((d) => Math.round(d)),
              });

              // Calculate width and height of the document
              const topWidth = Math.hypot(topRightCorner.x - topLeftCorner.x, topRightCorner.y - topLeftCorner.y);
              const bottomWidth = Math.hypot(bottomRightCorner.x - bottomLeftCorner.x, bottomRightCorner.y - bottomLeftCorner.y);
              const leftHeight = Math.hypot(bottomLeftCorner.x - topLeftCorner.x, bottomLeftCorner.y - topLeftCorner.y);
              const rightHeight = Math.hypot(bottomRightCorner.x - topRightCorner.x, bottomRightCorner.y - topRightCorner.y);

              // Use average dimensions to maintain proper aspect ratio
              const docWidth = Math.round((topWidth + bottomWidth) / 2);
              const docHeight = Math.round((leftHeight + rightHeight) / 2);

              // Extract paper from full-resolution canvas with scaled corner points
              const resultCanvas = scannerRef.current.extractPaper(canvas, docWidth, docHeight, scaledCorners);

              // Use high quality JPEG compression to preserve image quality
              finalDataUrl = resultCanvas.toDataURL('image/jpeg', 0.95);
            } else {
              console.log('No corners detected, using original');
              mat.delete();
              finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            }
          } else {
            console.log('No contour detected, using original');
            mat.delete();
            finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
          }
        } catch (err) {
          console.warn('jscanify processing failed, using original image:', err);
          finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
        }
      } else {
        // Auto-enhance disabled or jscanify not available - use original at high quality
        finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      }

      setCurrentPreview(finalDataUrl);
    } finally {
      setIsProcessing(false);
    }
  }, [autoEnhance, openCvReady]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      if (event.target?.result) {
        setCurrentPreview(event.target.result as string);
      }
    };

    reader.readAsDataURL(file);
  }, []);

  const addToBatch = useCallback(() => {
    if (currentPreview) {
      setCapturedImages((prev) => [...prev, currentPreview]);
      setCurrentPreview(null);
    }
  }, [currentPreview]);

  const uploadImages = useCallback(async () => {
    const imagesToUpload = currentPreview ? [currentPreview, ...capturedImages] : capturedImages;

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
        const file = new File([blob], `scan-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' });
        files.push(file);
        setUploadProgress(((i + 1) / (imagesToUpload.length + 1)) * 50); // 0-50% for conversion
      }

      // Upload to backend
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const uploadResponse = await fetch(`/api/v1/mobile-scanner/upload/${sessionId}`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      setUploadProgress(100);
      setUploadSuccess(true);

      // Close the mobile tab after successful upload
      setTimeout(() => {
        window.close();
        // Fallback if window.close() doesn't work (some browsers block it)
        if (!window.closed) {
          navigate('/');
        }
      }, 1500);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(t('mobileScanner.uploadFailed', 'Upload failed. Please try again.'));
    } finally {
      setIsUploading(false);
    }
  }, [currentPreview, capturedImages, sessionId, navigate, t]);

  const retake = useCallback(() => {
    setCurrentPreview(null);
  }, []);

  const clearBatch = useCallback(() => {
    setCapturedImages([]);
  }, []);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      await videoTrack.applyConstraints({
        advanced: [{ torch: !torchEnabled }],
      });
      setTorchEnabled(!torchEnabled);
      console.log('Torch:', !torchEnabled ? 'ON' : 'OFF');
    } catch (err) {
      console.error('Failed to toggle torch:', err);
    }
  }, [torchEnabled]);

  if (!sessionId) {
    return (
      <Box p="xl">
        <Alert color="red" title={t('mobileScanner.noSession', 'Invalid Session')}>
          {t('mobileScanner.noSessionMessage', 'Please scan a valid QR code to access this page.')}
        </Alert>
      </Box>
    );
  }

  if (uploadSuccess) {
    return (
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '2rem',
        }}
      >
        <CheckCircleRoundedIcon style={{ fontSize: '4rem', color: 'var(--mantine-color-green-6)' }} />
        <Text size="xl" fw="bold" mt="md">
          {t('mobileScanner.uploadSuccess', 'Upload Successful!')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('mobileScanner.uploadSuccessMessage', 'Your images have been transferred.')}
        </Text>
      </Box>
    );
  }

  return (
    <Box
      style={{
        minHeight: '100vh',
        background: 'var(--bg-background)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        p="md"
        style={{
          background: 'var(--bg-toolbar)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <Group gap="sm" align="center">
          <img
            src={brandIconSrc}
            alt={t('home.mobile.brandAlt', 'Stirling PDF logo')}
            style={{ height: '32px', width: '32px' }}
          />
          <img
            src={brandTextSrc}
            alt="Stirling PDF"
            style={{ height: '24px' }}
          />
        </Group>
      </Box>

      {uploadError && (
        <Box p="md">
          <Alert color="red" icon={<ErrorRoundedIcon />} onClose={() => setUploadError(null)} withCloseButton>
            {uploadError}
          </Alert>
        </Box>
      )}

      {isUploading && (
        <Box p="sm">
          <Text size="sm" mb="xs">
            {t('mobileScanner.uploading', 'Uploading...')}
          </Text>
          <Progress value={uploadProgress} animated />
        </Box>
      )}

      {cameraError && (
        <Box p="md">
          <Alert color="orange" icon={<InfoRoundedIcon />}>
            {cameraError}
          </Alert>
        </Box>
      )}

      {!currentPreview && (
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List grow>
            <Tabs.Tab value="camera" leftSection={<PhotoCameraRoundedIcon />}>
              {t('mobileScanner.camera', 'Camera')}
            </Tabs.Tab>
            <Tabs.Tab value="file" leftSection={<UploadRoundedIcon />}>
              {t('mobileScanner.fileUpload', 'File Upload')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="camera" pt="md">
            <Box style={{ position: 'relative', width: '100%', maxWidth: '100vw', background: '#000', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  maxHeight: '60vh',
                  display: 'block',
                  objectFit: 'contain',
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {/* Highlight overlay canvas - shows real-time document edge detection */}
              <canvas
                ref={highlightCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  opacity: showLiveDetection ? 1 : 0,
                  transition: 'opacity 0.2s',
                  objectFit: 'contain', // Maintain aspect ratio
                  imageRendering: 'auto', // Smooth scaling
                }}
              />
            </Box>
            <Stack gap="sm" p="sm">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    {t('mobileScanner.liveDetection', 'Live Detection')}
                  </Text>
                  <Switch
                    checked={showLiveDetection}
                    onChange={(e) => setShowLiveDetection(e.currentTarget.checked)}
                    disabled={!openCvReady}
                  />
                </Group>
                <Group justify="space-between">
                  <Text size="sm" fw={600}>
                    {t('mobileScanner.autoEnhance', 'Auto-enhance')}
                  </Text>
                  <Switch
                    checked={autoEnhance}
                    onChange={(e) => setAutoEnhance(e.currentTarget.checked)}
                    disabled={!openCvReady}
                  />
                </Group>
                {torchSupported && (
                  <Group justify="space-between">
                    <Text size="sm" fw={600}>
                      {t('mobileScanner.flashlight', 'Flashlight')}
                    </Text>
                    <Switch checked={torchEnabled} onChange={toggleTorch} />
                  </Group>
                )}
              </Stack>
              <Button
                fullWidth
                size="lg"
                onClick={captureImage}
                loading={isProcessing}
              >
                {isProcessing
                  ? t('mobileScanner.processing', 'Processing...')
                  : t('mobileScanner.capture', 'Capture Photo')}
              </Button>
              {autoEnhance && openCvReady && (
                <Text size="xs" c="dimmed" ta="center">
                  {t(
                    'mobileScanner.autoEnhanceInfo',
                    'Document edges will be automatically detected and perspective corrected'
                  )}
                </Text>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="file">
            <Stack gap="sm" p="sm" align="center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <Button
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                leftSection={<AddPhotoAlternateRoundedIcon />}
              >
                {t('mobileScanner.selectImage', 'Select Image')}
              </Button>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}

      {currentPreview && (
        <Stack gap="sm" p="sm">
          <Text size="lg" fw={600}>
            {t('mobileScanner.preview', 'Preview')}
          </Text>
          <Box
            style={{
              width: '100%',
              background: '#000',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img src={currentPreview} alt="Preview" style={{ width: '100%', display: 'block' }} />
          </Box>
          <Group grow>
            <Button variant="outline" onClick={retake}>
              {t('mobileScanner.retake', 'Retake')}
            </Button>
            <Button variant="light" onClick={addToBatch} color="green">
              {t('mobileScanner.addToBatch', 'Add to Batch')}
            </Button>
          </Group>
          <Button fullWidth onClick={uploadImages} loading={isUploading}>
            {t('mobileScanner.upload', 'Upload')}
          </Button>
        </Stack>
      )}

      {capturedImages.length > 0 && (
        <Box p="sm" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={600}>
              {t('mobileScanner.batchImages', 'Batch')} ({capturedImages.length})
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="outline" onClick={clearBatch} color="red">
                {t('mobileScanner.clearBatch', 'Clear')}
              </Button>
              <Button size="xs" onClick={uploadImages} loading={isUploading}>
                {t('mobileScanner.uploadAll', 'Upload All')}
              </Button>
            </Group>
          </Group>
          <Box style={{ display: 'flex', gap: 'var(--space-sm)', overflowX: 'auto', paddingBottom: 'var(--space-sm)' }}>
            {capturedImages.map((img, idx) => (
              <Box
                key={idx}
                style={{
                  minWidth: '80px',
                  height: '80px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: '2px solid var(--border-subtle)',
                }}
              >
                <img src={img} alt={`Capture ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

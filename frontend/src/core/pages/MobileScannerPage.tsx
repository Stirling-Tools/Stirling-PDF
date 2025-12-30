import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Text, Group, Alert, Progress, Switch, Card, useMantineColorScheme } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useLogoPath } from '@app/hooks/useLogoPath';
import { useLogoAssets } from '@app/hooks/useLogoAssets';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

// jscanify is loaded via script tag in index.html as a global
declare global {
  interface Window {
    jscanify: any;
    cv: any;
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
  const navigate = useNavigate();
  const sessionId = searchParams.get('session');
  const { colorScheme } = useMantineColorScheme();
  const brandIconSrc = useLogoPath();
  const { wordmark } = useLogoAssets();
  const brandTextSrc = colorScheme === 'dark' ? wordmark.white : wordmark.black;

  const [mode, setMode] = useState<'choice' | 'camera' | 'file' | null>('choice');
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
  const [loadingStatus, setLoadingStatus] = useState<string>('Initializing...');
  const [cameraReady, setCameraReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<any>(null);
  const highlightIntervalRef = useRef<number | null>(null);

  // Detection resolution - extremely low for mobile performance
  const DETECTION_WIDTH = 160; // Ultra-low for real-time mobile detection

  // Validate session on page load
  useEffect(() => {
    const validateSession = async () => {
      setLoadingStatus('Validating session...');
      if (!sessionId) {
        setSessionValid(false);
        setSessionError(t('mobileScanner.noSessionMessage', 'Session not found. Please try again.'));
        setLoadingStatus('Session validation failed');
        return;
      }

      try {
        const response = await fetch(`/api/v1/mobile-scanner/validate-session/${sessionId}`);

        if (response.ok) {
          const data = await response.json();
          if (data.valid) {
            setSessionValid(true);
            setSessionError(null);
            // Don't set status here - let camera/detection effects control status from now on
            console.log('Session validated successfully:', data);
          } else {
            setSessionValid(false);
            setSessionError(t('mobileScanner.sessionExpired', 'This session has expired. Please refresh and try again.'));
            setLoadingStatus('Session expired ✗');
          }
        } else {
          setSessionValid(false);
          setSessionError(t('mobileScanner.sessionNotFound', 'Session not found. Please refresh and try again.'));
          setLoadingStatus('Session not found ✗');
        }
      } catch (err) {
        console.error('Failed to validate session:', err);
        setSessionValid(false);
        setSessionError(t('mobileScanner.sessionValidationError', 'Unable to verify session. Please try again.'));
        setLoadingStatus('Session validation error: ' + (err as Error).message);
      }
    };

    validateSession();
  }, [sessionId, t]);

  // Initialize jscanify scanner and wait for OpenCV (loaded via script tags in index.html)
  useEffect(() => {
    let retryCount = 0;
    const MAX_RETRIES = 50; // 5 seconds max wait

    const initScanner = () => {
      // Check if both OpenCV and jscanify are loaded
      if (!(window as any).cv || !(window as any).cv.Mat) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          if (retryCount % 10 === 1) {
            setLoadingStatus(`Loading OpenCV... (${retryCount}/${MAX_RETRIES})`);
            console.log(`[${retryCount}/${MAX_RETRIES}] Waiting for OpenCV to load...`);
          }
          setTimeout(initScanner, 100);
        } else {
          const error = 'OpenCV failed to load after 5 seconds. Check that /vendor/jscanify/opencv.js is accessible.';
          setLoadingStatus('OpenCV load failed ✗');
          console.error(error);
        }
        return;
      }

      if (!window.jscanify) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          if (retryCount % 10 === 1) {
            setLoadingStatus(`Loading jscanify... (${retryCount}/${MAX_RETRIES})`);
            console.log(`[${retryCount}/${MAX_RETRIES}] Waiting for jscanify to load...`);
          }
          setTimeout(initScanner, 100);
        } else {
          const error = 'jscanify failed to load after 5 seconds. Check that /vendor/jscanify/jscanify.js is accessible.';
          setLoadingStatus('jscanify load failed ✗');
          console.error(error);
        }
        return;
      }

      try {
        scannerRef.current = new window.jscanify();
        setOpenCvReady(true);
        // Don't set status here - let camera/detection effects control status from now on
        console.log('✓ jscanify initialized with OpenCV');
      } catch (err) {
        setLoadingStatus('jscanify init failed ✗');
        console.error('Failed to initialize jscanify:', err);
      }
    };

    // Start initialization
    setLoadingStatus('Loading OpenCV...');
    initScanner();
  }, []);

  // Initialize camera
  useEffect(() => {
    console.log(`[Mobile Scanner] Camera effect triggered: mode=${mode}, cameraError=${cameraError}, currentPreview=${currentPreview}`);

    if (mode === 'camera' && !cameraError && !currentPreview) {
      console.log('[Mobile Scanner] Camera effect: Starting camera initialization');

      // Check if mediaDevices API is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = 'MediaDevices API not available - requires HTTPS or localhost';
        console.error(error);
        setLoadingStatus('Camera API not available ✗');
        setCameraError(
          t(
            'mobileScanner.httpsRequired',
            'Camera access requires HTTPS or localhost. Please use HTTPS or access via localhost.'
          )
        );
        setMode('file');
        return;
      }

      setLoadingStatus('Initializing camera...');

      console.log('[Mobile Scanner] Requesting camera permission...');
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
          console.log('[Mobile Scanner] Camera permission granted, stream received');
          streamRef.current = stream;
          if (videoRef.current) {
            const video = videoRef.current;
            video.srcObject = stream;

            // Wait for video metadata to load before marking camera as ready
            const handleLoadedMetadata = () => {
              console.log('[Mobile Scanner] Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
              setLoadingStatus(`Camera ready: ${video.videoWidth}x${video.videoHeight} ✓`);

              // Signal that camera is ready - this will trigger detection effect
              console.log('[Mobile Scanner] Setting cameraReady = true');
              setCameraReady(true);
            };

            // Check if metadata is already loaded
            if (video.readyState >= 1) { // HAVE_METADATA or greater
              handleLoadedMetadata();
            } else {
              // Wait for loadedmetadata event
              video.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
            }

            // Log actual resolution we got from stream settings
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack.getSettings();
            console.log('[Mobile Scanner] Camera stream settings:', settings.width, 'x', settings.height);

            // Configure camera capabilities for document scanning
            try {
              const capabilities = videoTrack.getCapabilities() as any; // Cast to any for experimental camera APIs
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
          setLoadingStatus('Camera access denied ✗');
          setCameraError(t('mobileScanner.cameraAccessDenied', 'Camera access denied. Please enable camera access.'));
          // Auto-switch to file upload if camera fails
          setMode('file');
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
    console.log(`[Mobile Scanner] Effect triggered: mode=${mode}, autoEnhance=${autoEnhance}, openCvReady=${openCvReady}, cameraReady=${cameraReady}, currentPreview=${currentPreview}`);

    // Show helpful status if detection is enabled but waiting for dependencies
    if (mode === 'camera' && autoEnhance && !currentPreview) {
      if (!openCvReady) {
        setLoadingStatus('Waiting for OpenCV...');
      } else if (!cameraReady) {
        setLoadingStatus('Waiting for camera...');
      }
    }

    if (mode === 'camera' && autoEnhance && openCvReady && cameraReady && scannerRef.current && !currentPreview) {
      const startHighlighting = () => {
        console.log('[Mobile Scanner] startHighlighting() called');

        if (!videoRef.current || !highlightCanvasRef.current) {
          setLoadingStatus('Missing video/canvas refs ✗');
          console.error('[Mobile Scanner] Missing refs: video=' + !!videoRef.current + ', canvas=' + !!highlightCanvasRef.current);
          return;
        }
        if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
          setLoadingStatus('Video has no dimensions ✗');
          console.error('[Mobile Scanner] Missing video dimensions: ' + videoRef.current.videoWidth + 'x' + videoRef.current.videoHeight);
          return;
        }

        const video = videoRef.current;
        const highlightCanvas = highlightCanvasRef.current;
        setLoadingStatus('Detection active ✓');
        console.log('[Mobile Scanner] Starting highlighting loop for ' + video.videoWidth + 'x' + video.videoHeight + ' video');

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

              // Step 2: Simple jscanify detection
              const detectionStart = performance.now();
              let corners = null;

              // Run jscanify detection directly - convert canvas to Mat first
              const mat = (window as any).cv.imread(detectionCanvas);
              const contour = scannerRef.current.findPaperContour(mat);
              mat.delete();

              if (contour) {
                corners = scannerRef.current.getCornerPoints(contour);
              }

              const detectionTime = performance.now() - detectionStart;

              // Step 3: Draw corner lines on full-res canvas
              const drawStart = performance.now();
              highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

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
                const tl = { x: corners.topLeftCorner.x * scaleFactor, y: corners.topLeftCorner.y * scaleFactor };
                const tr = { x: corners.topRightCorner.x * scaleFactor, y: corners.topRightCorner.y * scaleFactor };
                const br = { x: corners.bottomRightCorner.x * scaleFactor, y: corners.bottomRightCorner.y * scaleFactor };
                const bl = { x: corners.bottomLeftCorner.x * scaleFactor, y: corners.bottomLeftCorner.y * scaleFactor };

                // Draw green lines connecting corners
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

      // Wait for video to be ready with retry logic
      let retryCount = 0;
      let retryTimeout: number | null = null;

      const startWhenReady = () => {
        const video = videoRef.current;

        if (!video) {
          setLoadingStatus('No video element ✗');
          console.log('[Mobile Scanner] No video element');
          return;
        }

        console.log(`[Mobile Scanner] Video check: readyState=${video.readyState}, width=${video.videoWidth}, height=${video.videoHeight}`);

        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          setLoadingStatus('Detection starting... ✓');
          console.log('[Mobile Scanner] ✓ Video ready, starting detection now');
          startHighlighting();
        } else if (retryCount < 50) {
          // Retry up to 50 times (5 seconds)
          retryCount++;
          setLoadingStatus(`Waiting for video... (${retryCount}/50)`);
          console.log(`[Mobile Scanner] Video not ready yet, retry ${retryCount}/50...`);
          retryTimeout = window.setTimeout(startWhenReady, 100);
        } else {
          setLoadingStatus('Video failed to load ✗');
          console.error('[Mobile Scanner] ✗ Video failed to become ready after 5 seconds');
        }
      };

      // Add event listener as fallback
      const videoElement = videoRef.current;
      if (videoElement) {
        console.log('[Mobile Scanner] Adding loadedmetadata listener');
        videoElement.addEventListener('loadedmetadata', startWhenReady);
        // Also try immediately
        startWhenReady();
      } else {
        console.error('[Mobile Scanner] No video element available');
      }

      return () => {
        console.log('[Mobile Scanner] Cleanup: Stopping detection');

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
          videoElement.removeEventListener('loadedmetadata', startWhenReady);
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

              // Use scaled corners for extraction
              const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = scaledCorners;

              console.log('Document detected at full resolution:', {
                corners: scaledCorners,
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

              // Clean up Mat
              mat.delete();

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
        advanced: [{ torch: !torchEnabled } as any], // Cast to any for experimental torch API
      } as any);
      setTorchEnabled(!torchEnabled);
      console.log('Torch:', !torchEnabled ? 'ON' : 'OFF');
    } catch (err) {
      console.error('Failed to toggle torch:', err);
    }
  }, [torchEnabled]);

  // Show loading while validating
  if (sessionValid === null) {
    return (
      <Box p="xl" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <Text size="lg">{t('mobileScanner.validating', 'Validating session...')}</Text>
      </Box>
    );
  }

  // Show error if session is invalid
  if (!sessionValid || !sessionId) {
    return (
      <Box p="xl">
        <Alert color="red" title={t('mobileScanner.sessionInvalid', 'Session Error')}>
          {sessionError || t('mobileScanner.noSessionMessage', 'Session not found. Please try again.')}
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
          height: '100dvh',
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
        minHeight: '100dvh',
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

      {/* Status Banner - only show during camera loading or errors */}
      {loadingStatus && mode === 'camera' && !loadingStatus.includes('✓') && (
        <Box
          p="xs"
          style={{
            background: loadingStatus.includes('✗') ? 'var(--mantine-color-red-1)' :
                       'var(--mantine-color-blue-1)',
            borderBottom: '1px solid var(--border-subtle)',
            fontSize: '0.85rem',
            fontFamily: 'monospace',
            textAlign: 'center',
          }}
        >
          {loadingStatus}
        </Box>
      )}

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

      {/* Choice screen */}
      {mode === 'choice' && !currentPreview && (
        <Stack gap="lg" p="xl" align="center" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <Stack gap="xs" align="center">
            <Text size="xl" fw={700} ta="center">
              {t('mobileScanner.chooseMethod', 'Choose Upload Method')}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {t('mobileScanner.chooseMethodDescription', 'Select how you want to scan and upload documents')}
            </Text>
          </Stack>

          <Stack gap="md" style={{ width: '100%' }}>
            <Card
              shadow="sm"
              padding="xl"
              radius="md"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => setMode('camera')}
              styles={{
                root: {
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'scale(1.02)',
                    boxShadow: 'var(--mantine-shadow-md)',
                  },
                },
              }}
            >
              <Stack align="center" gap="md">
                <PhotoCameraRoundedIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-blue-6)' }} />
                <Text size="lg" fw={600}>
                  {t('mobileScanner.camera', 'Camera')}
                </Text>
                <Text size="sm" c="dimmed" ta="center">
                  {t('mobileScanner.cameraDescription', 'Scan documents using your device camera with automatic edge detection')}
                </Text>
              </Stack>
            </Card>

            <Card
              shadow="sm"
              padding="xl"
              radius="md"
              withBorder
              style={{ cursor: 'pointer' }}
              onClick={() => setMode('file')}
              styles={{
                root: {
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  '&:hover': {
                    transform: 'scale(1.02)',
                    boxShadow: 'var(--mantine-shadow-md)',
                  },
                },
              }}
            >
              <Stack align="center" gap="md">
                <UploadRoundedIcon style={{ fontSize: '3rem', color: 'var(--mantine-color-green-6)' }} />
                <Text size="lg" fw={600}>
                  {t('mobileScanner.fileUpload', 'File Upload')}
                </Text>
                <Text size="sm" c="dimmed" ta="center">
                  {t('mobileScanner.fileDescription', 'Upload existing photos or documents from your device')}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Stack>
      )}

      {/* Camera interface */}
      {mode === 'camera' && !currentPreview && (
        <Box style={{ position: 'relative', height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column' }}>
          {/* Back button - floating top left */}
          <Button
            onClick={() => setMode('choice')}
            variant="filled"
            size="sm"
            style={{
              position: 'absolute',
              top: '1rem',
              left: '1rem',
              zIndex: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(8px)',
              border: 'none',
            }}
          >
            ← {t('mobileScanner.back', 'Back')}
          </Button>

          {/* Video feed - fills available space */}
          <Box style={{ position: 'relative', flex: 1, background: '#000', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
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
                opacity: autoEnhance ? 1 : 0,
                transition: 'opacity 0.2s',
                objectFit: 'contain',
                imageRendering: 'auto',
              }}
            />
          </Box>

          {/* Controls bar - fixed at bottom */}
          <Box
            style={{
              backgroundColor: 'var(--bg-toolbar)',
              borderTop: '1px solid var(--border-subtle)',
              padding: '0.75rem 1rem',
            }}
          >
            <Stack gap="sm">
              {/* Settings toggles */}
              <Group justify="space-around" style={{ width: '100%' }}>
                <Group gap="xs">
                  <Switch
                    size="sm"
                    checked={autoEnhance}
                    onChange={(e) => setAutoEnhance(e.currentTarget.checked)}
                    disabled={!openCvReady}
                  />
                  <Text size="xs">{t('mobileScanner.edgeDetection', 'Edge Detection')}</Text>
                </Group>
                {torchSupported && (
                  <Group gap="xs">
                    <Switch size="sm" checked={torchEnabled} onChange={toggleTorch} />
                    <Text size="xs">{t('mobileScanner.flashlight', 'Flash')}</Text>
                  </Group>
                )}
              </Group>

              {/* Capture button */}
              <Button
                fullWidth
                size="lg"
                onClick={captureImage}
                loading={isProcessing}
                variant="filled"
                radius="xl"
              >
                {isProcessing
                  ? t('mobileScanner.processing', 'Processing...')
                  : t('mobileScanner.capture', 'Capture')}
              </Button>
            </Stack>
          </Box>
        </Box>
      )}

      {/* File upload interface */}
      {mode === 'file' && !currentPreview && (
        <Stack gap="lg" p="xl" align="center" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <Button
            onClick={() => setMode('choice')}
            variant="subtle"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
          >
            ← {t('mobileScanner.back', 'Back')}
          </Button>

          <Card shadow="sm" padding="xl" radius="md" withBorder style={{ width: '100%' }}>
            <Stack align="center" gap="lg">
              <UploadRoundedIcon style={{ fontSize: '4rem', color: 'var(--mantine-color-gray-5)' }} />
              <Text size="lg" fw={600} ta="center">
                {t('mobileScanner.selectFilesPrompt', 'Select files to upload')}
              </Text>
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
                variant="filled"
                fullWidth
                onClick={() => fileInputRef.current?.click()}
                leftSection={<AddPhotoAlternateRoundedIcon />}
              >
                {t('mobileScanner.selectImage', 'Select Image')}
              </Button>
            </Stack>
          </Card>
        </Stack>
      )}

      {/* Preview interface */}
      {currentPreview && (
        <Box style={{ position: 'relative', height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column' }}>
          {/* Preview image - fills available space */}
          <Box style={{ position: 'relative', flex: 1, background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={currentPreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', objectFit: 'contain' }} />
          </Box>

          {/* Controls bar - fixed at bottom */}
          <Box
            style={{
              backgroundColor: 'var(--bg-toolbar)',
              borderTop: '1px solid var(--border-subtle)',
              padding: '0.75rem 1rem',
            }}
          >
            <Stack gap="sm">
              <Group grow>
                <Button variant="default" onClick={retake} size="lg">
                  {t('mobileScanner.retake', 'Retake')}
                </Button>
                <Button variant="filled" onClick={addToBatch} size="lg">
                  {t('mobileScanner.addToBatch', 'Add to Batch')}
                </Button>
              </Group>
              <Button fullWidth variant="filled" size="lg" onClick={uploadImages} loading={isUploading} radius="xl">
                {t('mobileScanner.upload', 'Upload')}
              </Button>
            </Stack>
          </Box>
        </Box>
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

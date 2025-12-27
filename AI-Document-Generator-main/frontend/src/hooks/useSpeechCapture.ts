import { useCallback, useEffect, useRef, useState } from 'react'

interface UseSpeechCaptureOptions {
  appendPrompt: (text: string) => void
}

// Diagnostic logging
const log = (category: string, message: string, data?: any) => {
  const timestamp = new Date().toISOString().split('T')[1]
  console.log(`[${timestamp}] [${category}]`, message, data !== undefined ? data : '')
}

export function useSpeechCapture({ appendPrompt }: UseSpeechCaptureOptions) {
  const [isRecording, setIsRecording] = useState(false)
  const [whisperStatus, setWhisperStatus] = useState<string | null>(null)
  const [waveformHistory, setWaveformHistory] = useState<number[][]>([])
  
  // Refs for audio visualization
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)
  const lastUpdateTimeRef = useRef(0)
  
  // Refs for speech recognition
  const speechRecRef = useRef<any>(null)
  const allTranscriptsRef = useRef<string[]>([])
  const shouldTranscribeOnStopRef = useRef(false)
  const appendPromptRef = useRef(appendPrompt)
  
  // Keep appendPrompt ref updated
  useEffect(() => {
    appendPromptRef.current = appendPrompt
  }, [appendPrompt])
  
  // Animation loop function - defined outside to avoid recreation
  const runVisualization = useCallback(() => {
    const animate = () => {
      // Check if we should continue
      if (!isRunningRef.current) {
        log('ANIM', 'Animation stopped - isRunningRef is false')
        return
      }
      
      // Schedule next frame immediately
      animationFrameRef.current = requestAnimationFrame(animate)
      
      // Check if analyser exists
      if (!analyserRef.current) {
        log('ANIM', 'No analyser available')
        return
      }
      
      // Throttle to ~15fps
      const now = Date.now()
      if (now - lastUpdateTimeRef.current < 66) {
        return
      }
      lastUpdateTimeRef.current = now
      
      // Get frequency data
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyserRef.current.getByteFrequencyData(dataArray)
      
      // Sample frequency data
      const levels: number[] = []
      const numSamples = 40
      const step = Math.floor(bufferLength / numSamples)
      for (let i = 0; i < numSamples; i++) {
        const index = i * step
        const value = dataArray[index] / 255
        levels.push(value)
      }
      
      // Update waveform history - keep max 200 columns (enough for any reasonable width)
      setWaveformHistory((prev) => {
        const newHistory = [...prev, levels]
        return newHistory.slice(-200)
      })
    }
    
    log('ANIM', 'Starting animation loop')
    isRunningRef.current = true
    lastUpdateTimeRef.current = 0
    animate()
  }, [])
  
  // Stop visualization
  const stopVisualization = useCallback(() => {
    log('STOP_VIS', 'Stopping visualization')
    isRunningRef.current = false
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
      log('STOP_VIS', 'Cancelled animation frame')
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
      log('STOP_VIS', 'Closed audio context')
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      log('STOP_VIS', 'Stopped stream tracks')
    }
    
    analyserRef.current = null
    setWaveformHistory([])
  }, [])
  
  // Start recording
  const startRecording = useCallback(async () => {
    log('START', 'startRecording called, isRecording:', isRecording)
    if (isRecording) {
      log('START', 'Already recording, returning')
      return
    }
    
    // Set recording state immediately
    setIsRecording(true)
    setWhisperStatus('Listening...')
    
    // Initialize with placeholder
    setWaveformHistory([Array(40).fill(0.1)])
    log('START', 'Set initial placeholder waveform')
    
    // Set up audio visualization
    try {
      log('AUDIO', 'Requesting microphone access')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      log('AUDIO', 'Got microphone stream')
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()
      log('AUDIO', 'Created audio context, state:', audioContext.state)
      
      if (audioContext.state === 'suspended') {
        log('AUDIO', 'Resuming suspended audio context')
        await audioContext.resume()
        log('AUDIO', 'Audio context resumed, state:', audioContext.state)
      }
      
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8
      
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      log('AUDIO', 'Connected analyser to stream')
      
      audioContextRef.current = audioContext
      analyserRef.current = analyser
      
      // Start visualization
      runVisualization()
      log('AUDIO', 'Started visualization')
      
    } catch (err) {
      log('AUDIO', 'Failed to set up audio:', err)
      // Continue with placeholder even if audio fails
      isRunningRef.current = true
    }
    
    // Set up speech recognition
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRec) {
      log('SPEECH', 'Setting up speech recognition')
      allTranscriptsRef.current = []
      
      const rec = new SpeechRec()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-US'
      
      rec.onstart = () => {
        log('SPEECH', 'Speech recognition started')
      }
      
      rec.onresult = (event: any) => {
        log('SPEECH', `Got result, resultIndex: ${event.resultIndex}, results count: ${event.results.length}`)
        
        // Only process new results starting from resultIndex
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0]?.transcript
          
          // Only store final segments to avoid duplicates from interim results
          if (result.isFinal && transcript) {
            allTranscriptsRef.current = [...allTranscriptsRef.current, transcript]
            log('SPEECH', 'Added final transcript:', transcript)
          }
        }
        
        log('SPEECH', 'Accumulated transcripts:', allTranscriptsRef.current.join(' | '))
      }
      
      rec.onerror = (event: any) => {
        log('SPEECH', 'Speech recognition error:', event.error)
        // Don't stop on common errors
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return
        }
      }
      
      rec.onend = () => {
        log('SPEECH', `Speech recognition ended, isRunningRef: ${isRunningRef.current}, shouldTranscribe: ${shouldTranscribeOnStopRef.current}`)
        
        // If we're intentionally stopping and should transcribe, do it now
        if (shouldTranscribeOnStopRef.current) {
          shouldTranscribeOnStopRef.current = false
          if (allTranscriptsRef.current.length > 0) {
            const transcript = allTranscriptsRef.current.join(' ').replace(/\s+/g, ' ').trim()
            log('SPEECH', 'Final transcript from onend:', transcript)
            if (transcript) {
              appendPromptRef.current(transcript)
              setWhisperStatus('Transcription ready')
              setTimeout(() => setWhisperStatus(null), 1500)
            }
          }
          allTranscriptsRef.current = []
          return // Don't restart
        }
        
        // Restart if still recording
        if (isRunningRef.current) {
          log('SPEECH', 'Restarting speech recognition')
          setTimeout(() => {
            if (isRunningRef.current && speechRecRef.current) {
              try {
                // Create new instance
                const newRec = new SpeechRec()
                newRec.continuous = true
                newRec.interimResults = true
                newRec.lang = 'en-US'
                newRec.onstart = rec.onstart
                newRec.onresult = rec.onresult
                newRec.onerror = rec.onerror
                newRec.onend = rec.onend
                speechRecRef.current = newRec
                newRec.start()
                log('SPEECH', 'Speech recognition restarted')
              } catch (err) {
                log('SPEECH', 'Failed to restart speech recognition:', err)
              }
            }
          }, 100)
        }
      }
      
      speechRecRef.current = rec
      try {
        rec.start()
        log('SPEECH', 'Speech recognition start() called')
      } catch (err) {
        log('SPEECH', 'Failed to start speech recognition:', err)
      }
    } else {
      log('SPEECH', 'Speech recognition not available')
    }
    
    log('START', 'startRecording completed')
  }, [isRecording, runVisualization])
  
  // Stop recording
  const stopRecording = useCallback((shouldTranscribe = true) => {
    log('STOP', 'stopRecording called, shouldTranscribe:', shouldTranscribe)
    
    // Set flag for onend handler to know whether to transcribe
    shouldTranscribeOnStopRef.current = shouldTranscribe
    
    // Stop visualization first
    stopVisualization()
    
    // Stop speech recognition - onend will handle transcription
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop()
        log('STOP', 'Stopped speech recognition, waiting for onend')
      } catch (err) {
        log('STOP', 'Error stopping speech recognition:', err)
        // If stop fails, handle transcription here
        if (shouldTranscribe && allTranscriptsRef.current.length > 0) {
          const transcript = allTranscriptsRef.current.join(' ').replace(/\s+/g, ' ').trim()
          if (transcript) {
            appendPrompt(transcript)
            setWhisperStatus('Transcription ready')
          }
        }
        allTranscriptsRef.current = []
      }
      speechRecRef.current = null
    } else {
      // No speech recognition active, clear state
      allTranscriptsRef.current = []
    }
    
    setIsRecording(false)
    
    log('STOP', 'stopRecording completed')
  }, [appendPrompt, stopVisualization])
  
  // Toggle recording
  const toggleRecording = useCallback(() => {
    log('TOGGLE', 'toggleRecording called, isRecording:', isRecording)
    if (isRecording) {
      stopRecording(true)
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])
  
  // Cancel recording
  const cancelRecording = useCallback(() => {
    log('CANCEL', 'cancelRecording called')
    if (isRecording) {
      stopRecording(false)
    }
  }, [isRecording, stopRecording])
  
  // Accept recording
  const acceptRecording = useCallback(() => {
    log('ACCEPT', 'acceptRecording called')
    if (isRecording) {
      stopRecording(true)
    }
  }, [isRecording, stopRecording])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      log('CLEANUP', 'Component unmounting')
      isRunningRef.current = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop()
        } catch {}
      }
    }
  }, [])
  
  return {
    isRecording,
    whisperLoading: false, // Not used in speech recognition mode
    whisperStatus,
    toggleRecording,
    cancelRecording,
    acceptRecording,
    audioLevels: [], // Not used anymore
    waveformHistory,
  }
}

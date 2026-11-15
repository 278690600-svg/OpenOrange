"use client"

import { useState, useRef, useEffect } from "react"
import { Mic, MicOff, Loader2, Play, Pause, SkipForward, SkipBack, Volume2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function VoiceRecorder({ onTranscript }: { onTranscript?: (text: string) => void }) {
  const { t } = useI18n()
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [processing, setProcessing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        transcribeAudio(blob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    setIsRecording(false)
    setIsPaused(false)
  }

  const togglePause = () => {
    if (isPaused) {
      mediaRecorderRef.current?.resume()
      setIsPaused(false)
    } else {
      mediaRecorderRef.current?.pause()
      setIsPaused(true)
    }
  }

  const transcribeAudio = async (blob: Blob) => {
    setProcessing(true)
    try {
      const formData = new FormData()
      formData.append('audio', blob, 'recording.webm')

      const res = await fetch('/api/voice?action=transcribe', {
        method: 'POST',
        body: formData
      })

      const data = await res.json()
      if (data.transcript) {
        setTranscript(data.transcript)
        onTranscript?.(data.transcript)
      }
    } catch (err) {
      console.error('Transcription failed:', err)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <div className={`size-20 rounded-full flex items-center justify-center ${isRecording ? 'bg-red-100 dark:bg-red-500/20' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`size-12 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'}`}
        >
          {isRecording ? <MicOff className="size-5" /> : <Mic className="size-5" />}
        </button>
      </div>

      {isRecording && (
        <button
          onClick={togglePause}
          className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
        >
          {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      )}

      {(transcript || processing) && (
        <div className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3">
          <div className="flex items-center gap-2 mb-2">
            {processing ? <Loader2 className="size-3 animate-spin text-zinc-500" /> : <Volume2 className="size-3 text-zinc-500" />}
            <span className="text-xs text-zinc-500">{processing ? t("Transcribing...") : t("Transcript")}</span>
          </div>
          <p className="text-sm text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">{transcript}</p>
        </div>
      )}
    </div>
  )
}

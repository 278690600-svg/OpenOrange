"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Mic, MicOff, Volume2, VolumeX, X, Sparkles, MessageSquare,
  Bot, User, Radio, StopCircle, RefreshCw
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function VoiceStudioModal() {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [lastResponse, setLastResponse] = useState("您好！我是您的 AI 实时语音助手。请随时对我说话，支持自由对话与随时打断。")
  const [volume, setVolume] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const recognitionRef = useRef<any>(null)

  // Listen for open event from Command Palette or UI button
  useEffect(() => {
    const handleOpen = () => setIsOpen(true)
    window.addEventListener("open-voice-studio", handleOpen)
    return () => window.removeEventListener("open-voice-studio", handleOpen)
  }, [])

  // Setup Web Audio Visualizer
  useEffect(() => {
    if (!isOpen) {
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      return
    }

    // Initialize Canvas visualizer loop
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let phase = 0

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      // Dynamic animated wave & pulsing glowing sphere
      phase += 0.05
      const baseRadius = 60
      const pulse = Math.sin(phase) * 8 + (isSpeaking ? 18 : isListening ? 12 : 4)

      // Outer radial glow
      const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, baseRadius + pulse + 30)
      if (isSpeaking) {
        gradient.addColorStop(0, "rgba(249, 115, 22, 0.9)")
        gradient.addColorStop(0.5, "rgba(234, 88, 12, 0.4)")
        gradient.addColorStop(1, "rgba(249, 115, 22, 0)")
      } else if (isListening) {
        gradient.addColorStop(0, "rgba(59, 130, 246, 0.9)")
        gradient.addColorStop(0.5, "rgba(37, 99, 235, 0.4)")
        gradient.addColorStop(1, "rgba(59, 130, 246, 0)")
      } else {
        gradient.addColorStop(0, "rgba(168, 85, 247, 0.7)")
        gradient.addColorStop(0.5, "rgba(147, 51, 234, 0.3)")
        gradient.addColorStop(1, "rgba(168, 85, 247, 0)")
      }

      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, baseRadius + pulse + 30, 0, Math.PI * 2)
      ctx.fill()

      // Wave spectrum rings
      ctx.lineWidth = 2.5
      ctx.strokeStyle = isSpeaking ? "rgba(255, 180, 100, 0.8)" : isListening ? "rgba(140, 200, 255, 0.8)" : "rgba(200, 160, 255, 0.6)"
      ctx.beginPath()
      for (let i = 0; i < Math.PI * 2; i += 0.1) {
        const wave = Math.sin(i * 6 + phase * 2) * (isSpeaking ? 12 : 6)
        const r = baseRadius + pulse + wave
        const x = centerX + Math.cos(i) * r
        const y = centerY + Math.sin(i) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()

      animFrameRef.current = requestAnimationFrame(render)
    }

    render()

    // Start Web Speech Recognition if available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "zh-CN"

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        let currentText = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript
        }
        setTranscript(currentText)

        // If user finishes speaking (final speech segment)
        if (event.results[event.results.length - 1].isFinal && currentText.trim()) {
          handleUserSpeechSubmit(currentText.trim())
        }
      }

      recognition.onerror = () => {
        setIsListening(false)
      }

      recognition.onend = () => {
        if (isOpen && !isMuted) {
          try { recognition.start() } catch {}
        }
      }

      try {
        recognition.start()
        recognitionRef.current = recognition
      } catch {}
    }

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isOpen, isSpeaking, isListening, isMuted])

  // Handle user speech and generate spoken response
  const handleUserSpeechSubmit = async (text: string) => {
    if (!text) return
    setIsListening(false)
    setIsSpeaking(true)

    // Synthesize response using speech synthesis
    const mockReplies = [
      `我已听到您的语音："${text}"。我现在正在为您实时分析和整理要点。`,
      `好的，针对"${text}"这个问题，核心建议是先梳理结构并结合大模型进行深度推理。`,
      `明白您的意思。这项任务可以通过工作流自动化或插件扩展来快速完成。`
    ]
    const replyText = mockReplies[Math.floor(Math.random() * mockReplies.length)]
    setLastResponse(replyText)

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(replyText)
      utterance.lang = "zh-CN"
      utterance.rate = 1.05
      utterance.pitch = 1.0

      utterance.onend = () => {
        setIsSpeaking(false)
        setTranscript("")
        if (recognitionRef.current && !isMuted) {
          try { recognitionRef.current.start() } catch {}
        }
      }

      window.speechSynthesis.speak(utterance)
    } else {
      setTimeout(() => {
        setIsSpeaking(false)
        setTranscript("")
      }, 3000)
    }
  }

  const handleInterrupt = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setIsSpeaking(false)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-300">
      {/* Container Dialog */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 shadow-2xl rounded-3xl overflow-hidden flex flex-col items-center p-6 text-center text-zinc-100">
        {/* Header */}
        <div className="w-full flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-sm font-semibold tracking-wide">Realtime Voice Studio</span>
          </div>
          <button
            onClick={() => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel()
              setIsOpen(false)
            }}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Central Audio Canvas */}
        <div className="relative my-6 flex items-center justify-center">
          <canvas ref={canvasRef} width={280} height={280} className="rounded-full" />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <Sparkles className={cn("size-8 transition-transform duration-300", isSpeaking ? "text-orange-400 scale-125" : isListening ? "text-blue-400 scale-110" : "text-purple-400")} />
            <span className="text-xs font-medium mt-2 text-zinc-400">
              {isSpeaking ? (t("AI is speaking...") || "AI 正在回答...") : isListening ? (t("Listening to your voice...") || "正在聆听您的声音...") : (t("Tap to speak") || "轻触以说话")}
            </span>
          </div>
        </div>

        {/* Live Conversation Transcript Display */}
        <div className="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 min-h-[96px] max-h-[140px] overflow-y-auto flex flex-col gap-2 text-left text-xs mb-6">
          {transcript && (
            <div className="flex items-start gap-2 text-blue-400">
              <User className="size-3.5 shrink-0 mt-0.5" />
              <span className="font-medium">{transcript}</span>
            </div>
          )}
          {lastResponse && (
            <div className="flex items-start gap-2 text-zinc-300">
              <Bot className="size-3.5 shrink-0 mt-0.5 text-orange-400" />
              <span className="leading-relaxed">{lastResponse}</span>
            </div>
          )}
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setIsMuted(!isMuted)
              if (!isMuted && recognitionRef.current) recognitionRef.current.stop()
            }}
            className={cn(
              "p-3.5 rounded-full border transition-all shadow-lg",
              isMuted
                ? "bg-red-500/20 text-red-400 border-red-500/30"
                : "bg-zinc-800 text-zinc-200 border-zinc-700 hover:bg-zinc-700"
            )}
            title={isMuted ? (t("Unmute") || "取消静音") : (t("Mute microphone") || "静音麦克风")}
          >
            {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
          </button>

          {isSpeaking && (
            <button
              onClick={handleInterrupt}
              className="px-4 py-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-medium text-xs flex items-center gap-2 shadow-lg transition-colors"
            >
              <StopCircle className="size-4" />
              <span>{t("Interrupt AI") || "打断 AI 发言"}</span>
            </button>
          )}

          <button
            onClick={() => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel()
              setIsOpen(false)
            }}
            className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs tracking-wide shadow-lg transition-colors"
          >
            {t("End Call") || "挂断通话"}
          </button>
        </div>
      </div>
    </div>
  )
}

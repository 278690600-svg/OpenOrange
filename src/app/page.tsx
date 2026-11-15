"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace(`/chat/new-${Date.now()}`)
  }, [router])

  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-zinc-950">
      <img src="/brand/logo.png" alt="OpenOrangeAI" className="size-10 object-contain animate-[spin_3s_linear_infinite]" />
    </div>
  )
}

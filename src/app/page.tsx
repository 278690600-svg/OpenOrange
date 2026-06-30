"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/chat/new')
  }, [router])

  return (
    <div className="flex h-full items-center justify-center bg-white dark:bg-zinc-950">
      <div className="size-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

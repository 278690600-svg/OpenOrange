import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/theme-provider";
import { ShortcutsProvider, defaultShortcuts } from "@/lib/shortcuts";
import { AppToaster } from "@/lib/notifications";

export const metadata: Metadata = {
  title: "OpenOrangeAI",
  description: "Powerful private intelligence. Local-first search & reasoning.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "OpenOrangeAI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#6366f1",
};

import { ChatProvider } from "@/lib/chat-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { CommandPalette } from "@/components/command-palette";
import { VoiceStudioModal } from "@/components/voice-studio-modal";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ErrorBoundary>
        <I18nProvider>
          <ThemeProvider>
            <ChatProvider>
              <ShortcutsProvider shortcuts={defaultShortcuts}>
              <SidebarProvider>
              <AppSidebar />
              <div className="flex flex-col flex-1 w-full h-screen overflow-hidden relative">
                <header className="absolute top-0 left-0 p-3 md:p-4 z-10">
                  <SidebarTrigger className="size-9" />
                </header>
                <main className="flex-1 overflow-auto">
                  {children}
                </main>
              </div>
              <CommandPalette />
              <VoiceStudioModal />
              </SidebarProvider>
              <AppToaster />
              </ShortcutsProvider>
            </ChatProvider>
          </ThemeProvider>
        </I18nProvider>
        </ErrorBoundary>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').then(reg => {
                    console.log('SW registered:', reg.scope);
                  }).catch(err => {
                    console.log('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

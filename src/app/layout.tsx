import type { Metadata } from "next";
import "./globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "OpenOrangeAI",
  description: "强大的私有智能。本地优先的搜索与推理。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        <I18nProvider>
          <ThemeProvider>
            <SidebarProvider>
            <AppSidebar />
            <div className="flex flex-col flex-1 w-full h-screen overflow-hidden relative">
              <header className="absolute top-0 left-0 p-4 z-10 hidden md:block">
                <SidebarTrigger />
              </header>
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </div>
            </SidebarProvider>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

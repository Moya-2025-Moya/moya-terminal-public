import { Sidebar } from "@/components/Sidebar";
import { WalletButton } from "@/components/WalletButton";
import { StatusBar } from "@/components/StatusBar";
import { Toaster } from "@/components/Toaster";
import { CommandPalette } from "@/components/CommandPalette";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-6 border-b border-hairline px-8">
          <StatusBar />
          <WalletButton />
        </header>
        <main className="flex-1 px-8 pb-16 pt-1">{children}</main>
      </div>
      <Toaster />
      <CommandPalette />
    </div>
  );
}

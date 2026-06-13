import { LoginForm } from "@/components/LoginForm";
import { safeFrom } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-2xl tracking-tight text-foreground">
          moya<span className="text-accent">.</span>terminal
        </div>
        <div className="mt-1 text-sm text-muted">统一策略操作台</div>
      </div>
      <LoginForm from={safeFrom(from)} />
    </main>
  );
}

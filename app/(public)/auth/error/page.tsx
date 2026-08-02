import Link from "next/link";

type AuthErrorPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const errorCopy: Record<string, string> = {
  AccessDenied:
    "Esse email já usa outro tipo de login, ou o provedor recusou o acesso.",
  Configuration:
    "O login não está configurado corretamente no servidor.",
  Verification:
    "O link de verificação expirou ou já foi usado.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams;
  const error = params?.error ?? "Default";
  const message =
    errorCopy[error] ??
    "Não deu para concluir o login. Tente novamente pelo cabeçalho.";

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-16 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl border-y border-[#d0a85c]/25 py-12">
        <p className="text-sm font-black uppercase tracking-[0.32em] text-[#d0a85c]">
          Falha de autenticação
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Acesso não concluído
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
          {message}
        </p>
        <p className="mt-5 max-w-2xl text-sm font-bold uppercase tracking-[0.16em] text-stone-500">
          Código: {error}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm bg-[#d0a85c] px-6 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa]"
            href="/auth/entrar"
          >
            Tentar login
          </Link>
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm border border-[#d0a85c]/45 px-6 text-sm font-bold uppercase tracking-[0.16em] text-[#f5e7bd] transition hover:bg-[#d0a85c]/10"
            href="/"
          >
            Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { createNoIndexMetadata } from "@/lib/site-metadata";

export const metadata = createNoIndexMetadata(
  "Entrada interrompida",
  "Falha de autenticação no Contrapista.",
);

type AuthErrorPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const errorCopy: Record<string, string> = {
  AccessDenied:
    "Use o mesmo método escolhido no primeiro acesso com esse email.",
  Configuration:
    "Essa forma de entrada não abriu agora. Tente outra opção.",
  Verification:
    "Esse link não está mais disponível. Solicite um novo acesso.",
};

export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const params = await searchParams;
  const error = params?.error ?? "Default";
  const message =
    errorCopy[error] ??
    "Não conseguimos concluir a entrada. Tente novamente pelo cabeçalho.";

  return (
    <main className="sy-theme public-red-details min-h-screen bg-[#0e1111] px-4 py-16 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl border-y border-[#d0a85c]/25 py-12">
        <p className="text-sm font-black uppercase tracking-[0.32em] text-[#d0a85c]">
          Entrada interrompida
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Entrada não concluída
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
          {message}
        </p>
        <p className="mt-5 max-w-2xl text-sm font-semibold text-stone-400">
          Escolha outra forma de entrada ou tente novamente em instantes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm bg-[#d0a85c] px-6 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa]"
            href="/auth/entrar"
          >
            Tentar entrar
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

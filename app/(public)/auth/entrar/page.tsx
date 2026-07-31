import Link from "next/link";

type SignInPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params?.callbackUrl ?? "/jogar";

  return (
    <main className="sy-theme min-h-screen bg-[#0e1111] px-4 py-16 text-stone-50 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl border-y border-[#d0a85c]/25 py-12">
        <p className="text-sm font-black uppercase tracking-[0.32em] text-[#d0a85c]">
          Acesso necessário
        </p>
        <h1 className="mt-4 font-serif text-5xl font-bold text-[#f2e6c8] sm:text-7xl">
          Entre para jogar
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-300">
          Criar sala, buscar partida, entrar em uma mesa ou resolver o problema
          diário exige uma conta com nome de usuário definido.
        </p>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-400">
          Use os botões de login ou cadastro no cabeçalho. Depois do acesso, você
          pode voltar diretamente para o destino protegido.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-12 items-center justify-center rounded-sm bg-[#d0a85c] px-6 text-sm font-black uppercase tracking-[0.16em] text-[#17130d] transition hover:bg-[#f3dfaa]"
            href={callbackUrl}
          >
            Tentar novamente
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

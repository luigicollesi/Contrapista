import Image from "next/image";
import Link from "next/link";
import { AuthModalControls } from "@/components/public/auth-modal-controls";

const navItems = [
  { href: "/", label: "Início" },
  { href: "/jogar", label: "Jogar" },
  { href: "/instrucoes", label: "Instruções" },
  { href: "/casos", label: "Casos" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#d0a85c]/20 bg-[#0e1111]/90 text-stone-50 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 px-4 py-3 sm:px-6 lg:min-h-20 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] lg:items-stretch lg:gap-6 lg:px-8 lg:py-0">
        <Link className="flex items-center gap-3 lg:self-center" href="/">
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-sm border border-[#d0a85c]/50 bg-[#171a1a] shadow-lg">
            <Image
              alt="Contrapista"
              className="h-9 w-9 object-contain"
              height={36}
              src="/contrapista-icon.png"
              width={36}
            />
          </span>
          <span>
            <span className="block font-serif text-xl font-bold tracking-wide text-[#f5e7bd]">
              Contrapista
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#b98d47]">
              Investigação online
            </span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center justify-start gap-2 text-sm font-bold uppercase tracking-[0.16em] text-stone-300 sm:justify-center lg:h-full lg:justify-center">
          {navItems.map((item) => (
            <Link
              className="rounded-sm px-3 py-2 transition hover:bg-[#d0a85c]/10 hover:text-[#f5e7bd]"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-start sm:justify-end lg:h-full">
          <AuthModalControls />
        </div>
      </div>
    </header>
  );
}

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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-5 lg:min-h-20 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] lg:items-stretch lg:gap-6 lg:px-8 lg:py-0">
        <Link className="flex min-w-0 items-center gap-2 lg:self-center" href="/">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-[#d0a85c]/50 bg-[#171a1a] shadow-lg sm:h-11 sm:w-11">
            <Image
              alt="Contrapista"
              className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              height={36}
              src="/contrapista-icon.png"
              width={36}
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-serif text-lg font-bold tracking-wide text-[#f5e7bd] sm:text-xl">
              Contrapista
            </span>
            <span className="block truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[#b98d47] sm:text-[10px] sm:tracking-[0.2em]">
              Investigação online
            </span>
          </span>
        </Link>

        <nav className="scrollbar-none order-3 col-span-2 -mx-3 flex overflow-x-auto px-3 pb-0.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-300 sm:-mx-5 sm:px-5 sm:text-sm lg:order-none lg:col-span-1 lg:mx-0 lg:h-full lg:justify-center lg:overflow-visible lg:px-0 lg:tracking-[0.16em]">
          {navItems.map((item) => (
            <Link
              className="shrink-0 rounded-sm px-3 py-2 transition hover:bg-[#d0a85c]/10 hover:text-[#f5e7bd] lg:flex lg:items-center"
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 items-center justify-end lg:h-full">
          <AuthModalControls />
        </div>
      </div>
    </header>
  );
}

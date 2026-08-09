import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CentinelaLockup } from "../components/brand/Logo";
import { AsistenteBar } from "../components/AsistenteBar";
import { WhatsappFab } from "../components/WhatsappFab";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "Dengue Centinela" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Inicio" },
  { to: "/mapa", label: "Mapa" },
  { to: "/reportar", label: "Reportar" },
  { to: "/panel", label: "Panel" },
  { to: "/alertas", label: "Alertas" },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isFullBleed = pathname.startsWith("/mapa");
  const [menuAbierto, setMenuAbierto] = useState(false);

  // Al navegar, el menú se cierra solo.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Escape cierra el menú, como cualquier overlay.
  useEffect(() => {
    if (!menuAbierto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuAbierto]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* dvh en lugar de vh: en los navegadores móviles la barra de direcciones
          se come parte de 100vh y el mapa terminaba cortado abajo. */}
      <div className="flex min-h-dvh flex-col bg-background">
        <header className="sticky top-0 z-[950] border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
            <Link to="/" className="min-w-0 shrink-0">
              <CentinelaLockup showLocation />
            </Link>

            {/* Desde md los links van en línea. */}
            <nav
              aria-label="Navegación principal"
              className="hidden items-center gap-1 text-sm md:flex md:flex-wrap md:justify-end"
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* En celular, hamburguesa: 5 links no entran en una fila. */}
            <button
              type="button"
              onClick={() => setMenuAbierto((valor) => !valor)}
              aria-expanded={menuAbierto}
              aria-controls="menu-movil"
              aria-label={menuAbierto ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
            >
              {menuAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {/* Panel desplegable. Va absolute para superponerse en lugar de
              empujar el contenido: si no, el mapa se redimensionaría al abrirlo. */}
          {menuAbierto && (
            <nav
              id="menu-movil"
              aria-label="Navegación principal"
              className="absolute inset-x-0 top-full border-b border-border bg-background shadow-2xl md:hidden"
            >
              <ul className="flex flex-col gap-1 px-3 pb-3 pt-2">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      activeOptions={{ exact: item.to === "/" }}
                      activeProps={{ className: "bg-secondary text-foreground" }}
                      inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                      onClick={() => setMenuAbierto(false)}
                      className="block rounded-lg px-3 py-2.5 text-sm transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </header>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
        {/* El mapa es a pantalla completa bajo el header: sin footer que le robe alto. */}
        {!isFullBleed && (
          <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
            Dengue Centinela · Vigilancia comunitaria — Salta, Argentina · Demo con datos simulados
          </footer>
        )}
        {/* Barra del asistente: flota sobre todas las pantallas. */}
        <AsistenteBar />
        {/* Acceso directo a WhatsApp: esquina opuesta al asistente, siempre visible. */}
        <WhatsappFab />
      </div>
    </QueryClientProvider>
  );
}

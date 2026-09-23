import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, useRouter, useRouterState, HeadContent, Scripts, ScriptOnce } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AppShell } from "@/components/app-shell";
import {
  BootSplash,
  bootSplashCss,
  bootSplashHideScript,
  bootSplashSkipScript,
} from "@/components/boot-splash";
import { AuthProvider } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";
import { ThemeProvider, themeInitScript } from "@/lib/theme";
import { canonicalOriginScript } from "@/lib/canonical-url";
import { Toaster } from "@/components/ui/sonner";
import { registerSw } from "@/lib/pwa/register-sw";
import { toast } from "sonner";


function NotFoundComponent() {
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold uppercase tracking-[0.02em] text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">That route doesn't exist.</p>
        <a href="/" className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Back to dashboard</a>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-4 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium">Try again</button>
      </div>
    </main>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mentor Hub by RPM | Ops, Comms & Scouting" },
      { name: "description", content: "Mentor Hub by RPM — the internal goalkeeper development, mentor operations and scouting intelligence platform for Refuel Performance Management." },
      { property: "og:site_name", content: "Mentor Hub by RPM" },
      { property: "og:title", content: "Mentor Hub by RPM | Ops, Comms & Scouting" },
      { name: "twitter:title", content: "Mentor Hub by RPM | Ops, Comms & Scouting" },
      { property: "og:description", content: "Mentor Hub by RPM — the internal goalkeeper development, mentor operations and scouting intelligence platform for Refuel Performance Management." },
      { name: "twitter:description", content: "Mentor Hub by RPM — the internal goalkeeper development, mentor operations and scouting intelligence platform for Refuel Performance Management." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5dae430b-3f33-4d9e-aaef-33f3aa601299/id-preview-fabfc36f--09000fc3-6e10-463a-b90f-7b0d3fb20b5a.lovable.app-1784855964983.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Mentor Hub by RPM — Goalkeeper Ops, Comms & Scouting" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5dae430b-3f33-4d9e-aaef-33f3aa601299/id-preview-fabfc36f--09000fc3-6e10-463a-b90f-7b0d3fb20b5a.lovable.app-1784855964983.png" },
      { name: "twitter:image:alt", content: "Mentor Hub by RPM — Goalkeeper Ops, Comms & Scouting" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#0A0A0A" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Mentor Hub" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@500;600;700;800&family=Saira:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" },
      { rel: "stylesheet", href: appCss },
      { rel: "preload", as: "image", href: "/gkhq-mark.png" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // iOS splash screens (apple-touch-startup-image) — media queries per device
      { rel: "apple-touch-startup-image", href: "/splash-iphone-14-pro-max.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-14-pro.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-12-pro-max.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-12.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-xs-max.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-xr.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-x.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-plus.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-8.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-iphone-se.png", media: "(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-ipad-pro-129.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-ipad-pro-11.png", media: "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { rel: "apple-touch-startup-image", href: "/splash-ipad.png", media: "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <ScriptOnce>{canonicalOriginScript}</ScriptOnce>
        <ScriptOnce>{themeInitScript}</ScriptOnce>
        <ScriptOnce>{bootSplashSkipScript}</ScriptOnce>
        <style dangerouslySetInnerHTML={{ __html: bootSplashCss }} />
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <BootSplash />
        {children}
        <ScriptOnce>{bootSplashHideScript}</ScriptOnce>
        <Scripts />
      </body>
    </html>
  );
}


function VercelSpeedInsights() {
  const route = useRouterState({
    select: (s) => s.matches[s.matches.length - 1]?.routeId ?? null,
  });
  return <SpeedInsights route={route} />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    registerSw((reload) => {
      toast("Update available", {
        description: "A new version of Mentor Hub is ready.",
        action: { label: "Reload", onClick: () => reload() },
        duration: Infinity,
      });
    });
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <NotificationsProvider>
            <AppShell />
            <Toaster richColors closeButton position="top-right" />
            <VercelSpeedInsights />
            <Analytics />
          </NotificationsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

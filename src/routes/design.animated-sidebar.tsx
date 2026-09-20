import { createFileRoute } from "@tanstack/react-router";

import { AnimatedSidebarDemo } from "@/components/ui/animated-sidebar-demo";
import { PageHeader } from "@/components/primitives";

export const Route = createFileRoute("/design/animated-sidebar")({
  component: AnimatedSidebarPage,
});

/**
 * Live preview of `@/components/ui/animated-sidebar` — the hover-to-expand
 * rail. Sits alongside /design/gkhq and /design/accent-proposal so the
 * component can be checked in both themes against the real tokens.
 */
function AnimatedSidebarPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-8">
      <PageHeader
        title="Animated sidebar"
        description="Hover the rail to expand it. On mobile it collapses to a menu button with a full-screen overlay."
      />
      <AnimatedSidebarDemo />
    </div>
  );
}

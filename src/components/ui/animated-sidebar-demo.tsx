import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { LayoutDashboard, UserCog, Settings, LogOut } from "lucide-react";

import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  type SidebarLinkItem,
} from "@/components/ui/animated-sidebar";
import { GkhqMark } from "@/components/gkhq-lockup";
import { cn } from "@/lib/utils";

/** Reference usage for `@/components/ui/animated-sidebar`. Rendered at /design/animated-sidebar. */
export function AnimatedSidebarDemo() {
  const links: SidebarLinkItem[] = [
    {
      label: "Dashboard",
      href: "/",
      icon: <LayoutDashboard className="size-5 shrink-0 text-sidebar-foreground" />,
    },
    {
      label: "Profile",
      href: "/account",
      icon: <UserCog className="size-5 shrink-0 text-sidebar-foreground" />,
    },
    {
      label: "Settings",
      href: "/system/permissions",
      icon: <Settings className="size-5 shrink-0 text-sidebar-foreground" />,
    },
    {
      label: "Logout",
      href: "/login",
      icon: <LogOut className="size-5 shrink-0 text-sidebar-foreground" />,
    },
  ];
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-md border border-border bg-sidebar md:flex-row",
        "h-[60vh]", // for a full-page shell, use `h-screen` instead
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col gap-2">
              {links.map((link) => (
                <SidebarLink key={link.label} link={link} />
              ))}
            </div>
          </div>
          <div>
            <SidebarLink
              link={{
                label: "Manu Arora",
                href: "/account",
                icon: (
                  <img
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=100&h=100&q=80"
                    className="size-7 shrink-0 rounded-full object-cover"
                    width={50}
                    height={50}
                    alt=""
                  />
                ),
              }}
            />
          </div>
        </SidebarBody>
      </Sidebar>
      <DemoDashboard />
    </div>
  );
}

export const Logo = () => {
  return (
    <Link
      to="/"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-sidebar-foreground"
    >
      <GkhqMark className="size-6 shrink-0" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="whitespace-pre font-medium text-sidebar-foreground"
      >
        Mentor Hub
      </motion.span>
    </Link>
  );
};

export const LogoIcon = () => {
  return (
    <Link
      to="/"
      aria-label="Mentor Hub"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-sidebar-foreground"
    >
      <GkhqMark className="size-6 shrink-0" />
    </Link>
  );
};

/** Placeholder content so the sidebar has something to sit beside. */
const DemoDashboard = () => {
  return (
    <div className="flex flex-1">
      <div className="flex h-full w-full flex-1 flex-col gap-2 rounded-tl-2xl border border-border bg-background p-2 md:p-10">
        <div className="flex gap-2">
          {[...new Array(4)].map((_, i) => (
            <div
              key={`first-array-${i}`}
              className="h-20 w-full animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
        <div className="flex flex-1 gap-2">
          {[...new Array(2)].map((_, i) => (
            <div
              key={`second-array-${i}`}
              className="h-full w-full animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

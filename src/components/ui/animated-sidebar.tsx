import { Link, type LinkComponentProps } from "@tanstack/react-router";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Animated hover-to-expand sidebar.
 *
 * Ported from the Aceternity/21st.dev component for this codebase:
 *   - `next/link` → TanStack Router `Link` (so `href` is a typed route),
 *   - `framer-motion` → `motion/react` (the same library under its current
 *     name; the repo already ships `motion`, so we don't add a duplicate),
 *   - hardcoded neutral palette → the GKHQ `--sidebar` tokens, so it tracks
 *     the active theme instead of fighting it.
 *
 * Kept separate from `@/components/ui/sidebar.tsx` (shadcn's sidebar): the two
 * export the same names and solve different problems. This one is the
 * icon-rail-that-expands-on-hover; shadcn's is the collapsible app shell.
 */

export interface SidebarLinkItem {
  label: string;
  /** A typed route path, e.g. "/goalkeepers". */
  href: LinkComponentProps["to"];
  icon: React.ReactNode;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        "h-full w-[300px] shrink-0 hidden md:flex md:flex-col px-4 py-4 bg-sidebar text-sidebar-foreground",
        className,
      )}
      animate={{
        width: animate ? (open ? "300px" : "60px") : "300px",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({ className, children, ...props }: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className="h-10 w-full flex flex-row md:hidden items-center justify-between px-4 py-4 bg-sidebar text-sidebar-foreground"
      {...props}
    >
      <div className="flex justify-end z-20 w-full">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <Menu className="size-5 cursor-pointer" />
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{
              duration: 0.3,
              ease: "easeInOut",
            }}
            className={cn(
              "fixed h-full w-full inset-0 z-[100] p-10 flex flex-col justify-between bg-sidebar text-sidebar-foreground",
              className,
            )}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(!open)}
              className="absolute right-10 top-10 z-50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              <X className="size-5 cursor-pointer" />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: SidebarLinkItem;
  className?: string;
} & Omit<LinkComponentProps, "to" | "children" | "className">) => {
  const { open, animate } = useSidebar();
  const collapsed = Boolean(animate && !open);
  return (
    <Link
      to={link.href}
      // display:none on the collapsed label drops it from the a11y tree.
      // Name the link from that same label; drop the attribute once expanded
      // so the visible text stays the name (voice control).
      aria-label={collapsed ? link.label : undefined}
      className={cn(
        "flex items-center justify-start gap-2 group/sidebar py-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        className,
      )}
      activeProps={{ "data-active": "true" }}
      {...props}
    >
      {link.icon}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="text-sidebar-foreground text-sm group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0"
      >
        {link.label}
      </motion.span>
    </Link>
  );
};

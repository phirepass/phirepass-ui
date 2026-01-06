import Link from "next/link";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

interface NavLinkCompatProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  className?: string;
  activeClassName?: string;
  children: React.ReactNode;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, href, ...props }, ref) => {
    const pathname = usePathname();
    const isActive = pathname === href;

    return (
    <Link
        ref={ref}
        href={href}
        className={cn(className, isActive && activeClassName)}
        {...props}
    />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };

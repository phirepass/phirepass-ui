import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
    theme={theme as ToasterProps["theme"]}
    richColors
    className="toaster group"
    toastOptions={{
        classNames: {
        toast:
            "group toast group-[.toaster]:rounded-[12px] group-[.toaster]:border-hairline group-[.toaster]:bg-[image:var(--fill-panel)] group-[.toaster]:text-foreground group-[.toaster]:shadow-panel group-[.toaster]:backdrop-blur-[22px] group-[.toaster]:backdrop-saturate-[1.8]",
        description: "group-[.toast]:text-muted-foreground",
        actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
        cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
    }}
    {...props}
    />
  );
};

export { Toaster, toast };

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-hairline bg-background/80 backdrop-blur-md py-6 pb-12 mt-auto">
    <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <p>© {currentYear} Phirepass. All rights reserved.</p>
        <div className="flex items-center gap-6">
            <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms of Service</a>
        </div>
        </div>
    </div>
    </footer>
  );
}

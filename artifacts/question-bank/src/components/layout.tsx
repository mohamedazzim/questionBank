import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  Library, 
  BookOpen, 
  FileQuestion, 
  Download,
  Tags,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard },
    { name: "Subjects", href: "/subjects", icon: Library },
    { name: "Chapters", href: "/chapters", icon: BookOpen },
    { name: "Questions", href: "/questions", icon: FileQuestion },
    { name: "Preview and Labelling", href: "/preview-labelling", icon: Tags },
    { name: "Export", href: "/export", icon: Download },
  ];

  return (
    <div className="min-h-screen flex w-full bg-muted/30">
      {/* Sidebar */}
      <div
        className={`${isSidebarCollapsed ? "w-[72px]" : "w-64"} border-r bg-sidebar flex-shrink-0 flex flex-col transition-all duration-200`}
      >
        <div
          className={`${isSidebarCollapsed ? "justify-center px-2" : "justify-between px-4"} relative h-16 flex items-center border-b border-sidebar-border/50`}
        >
          <div className="font-serif font-bold text-lg text-sidebar-foreground flex items-center gap-2 overflow-hidden">
            <Library className="h-5 w-5 text-sidebar-ring shrink-0" />
            {!isSidebarCollapsed && <span>Question Bank</span>}
          </div>

          {!isSidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={() => setIsSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}

          {isSidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 left-[52px] h-7 w-7 rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={() => setIsSidebarCollapsed(false)}
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div className={`${isSidebarCollapsed ? "px-2" : "px-3"} flex-1 py-6 flex flex-col gap-1 overflow-y-auto`}>
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            
            return (
              <Link 
                key={item.name} 
                href={item.href}
                title={item.name}
                className={`${isSidebarCollapsed ? "justify-center px-2" : "px-3"} flex items-center gap-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? "text-sidebar-ring" : ""}`} />
                {!isSidebarCollapsed && item.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

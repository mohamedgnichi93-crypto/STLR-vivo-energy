import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Home, Zap, Droplets, Settings, Menu, ChevronLeft, ChevronDown, ChevronRight, LucideIcon, LogOut, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout, getCurrentUser } from "@/lib/auth";
import { useTranslation } from 'react-i18next';

const SIDEBAR_STATE_KEY = "stlr_sidebar_expanded";
const EXPANDED_SECTIONS_KEY = "stlr_expanded_sections";

interface SidebarSectionProps {
  icon: LucideIcon;
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  isSidebarExpanded: boolean;
  children: React.ReactNode;
  isActive?: boolean;
}

function SidebarSection({ icon: Icon, label, isExpanded, onToggle, isSidebarExpanded, children, isActive }: SidebarSectionProps) {
  return (
    <div className="flex flex-col mb-1 group/section">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-3 rounded-md transition-colors w-full relative z-10",
          isSidebarExpanded ? "px-3 py-2.5" : "p-2.5 justify-center",
          isActive && !isExpanded
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
        title={!isSidebarExpanded ? label : undefined}
      >
        <Icon className={cn("h-5 w-5 shrink-0", isActive && isExpanded ? "text-primary" : "")} />
        {isSidebarExpanded && (
          <>
            <span className={cn("flex-1 text-left truncate", isActive && isExpanded ? "text-foreground font-medium" : "")}>{label}</span>
            {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </>
        )}
      </button>
      
      <div 
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out pl-[2.25rem]",
          isExpanded && isSidebarExpanded ? "max-h-[200px] opacity-100 mt-1 mb-2" : "max-h-0 opacity-0 m-0"
        )}
      >
        <div className="flex flex-col gap-1 relative before:absolute before:left-0 before:top-0 before:bottom-2 before:w-[1px] before:bg-border/50">
          {children}
        </div>
      </div>
    </div>
  );
}

interface SidebarSubItemProps {
  label: string;
  to: string;
}

function SidebarSubItem({ label, to }: SidebarSubItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-all relative z-10 before:absolute before:left-[-1.5px] before:top-1/2 before:-translate-y-1/2 before:w-[4px] before:h-[4px] before:rounded-full before:transition-all hover:translate-x-1",
        isActive 
          ? "text-primary font-medium bg-primary/10 before:bg-primary" 
          : "text-muted-foreground hover:text-foreground hover:bg-secondary before:bg-transparent"
      )}
    >
      <span className="truncate">— {label}</span>
    </NavLink>
  );
}

interface SidebarLinkProps {
  icon: LucideIcon;
  label: string;
  to: string;
  isSidebarExpanded: boolean;
}

function SidebarLink({ icon: Icon, label, to, isSidebarExpanded }: SidebarLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(
        "flex items-center gap-3 rounded-md transition-colors mb-1",
        isSidebarExpanded ? "px-3 py-2.5" : "p-2.5 justify-center",
        isActive 
          ? "bg-primary/20 text-primary font-medium" 
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
      title={!isSidebarExpanded ? label : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {isSidebarExpanded && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

interface SidebarProps {
  expanded: boolean;
  toggle: () => void;
}

export default function Sidebar({ expanded, toggle }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(EXPANDED_SECTIONS_KEY);
    // If saved has multiple sections, keep only the first one
    const parsed: string[] = saved ? JSON.parse(saved) : ['electricity'];
    return new Set(parsed.slice(0, 1));
  });

  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  const currentUser = getCurrentUser();
  const role = currentUser?.role ?? 'viewer';
  const isAdmin = role === 'admin';
  const isOperator = role === 'operator';
  const isViewer = role === 'viewer';
  const canDoSaisie = isAdmin || isOperator;
  const canViewDashboards = isAdmin || isViewer;
  const canViewManuel = isAdmin || isOperator || isViewer;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set<string>();
      // If clicking the already-open section → close it (empty set)
      // If clicking a different section → open only that one
      if (!prev.has(section)) {
        next.add(section);
      }
      localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const isRouteActive = (paths: string[]) => {
    return paths.some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));
  };

  return (
    <aside 
      className={cn(
        "bg-card border-r border-border fixed top-0 left-0 h-screen z-50 overflow-y-auto flex flex-col transition-all duration-300",
        expanded ? "w-[240px]" : "w-[68px]"
      )}
    >
      <div className={cn(
        "h-16 flex items-center border-b border-border/50",
        expanded ? "justify-between px-4" : "justify-center"
      )}>
        {expanded && (
          <span 
            onClick={() => navigate("/home")}
            className="font-bold text-xl tracking-tight text-primary cursor-pointer hover:opacity-80 transition-opacity"
          >
            STLR
          </span>
        )}
        <button 
          onClick={toggle} 
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <nav className="flex-1 flex flex-col p-3 mt-4 overflow-y-auto overflow-x-hidden">
        
        {canDoSaisie && (
          <SidebarLink icon={Home} label={t('nav.home')} to="/home/electricity" isSidebarExpanded={expanded} />
        )}

        <SidebarSection
          icon={Zap}
          label={t('nav.electricity')}
          isExpanded={expandedSections.has('electricity')}
          onToggle={() => toggleSection('electricity')}
          isSidebarExpanded={expanded}
          isActive={isRouteActive(['/dashboard', '/electricity', '/comparison/electricity'])}
        >
          {canViewDashboards && <SidebarSubItem label={t('nav.wattnow')} to="/dashboard" />}
          {canViewManuel && <SidebarSubItem label={t('nav.suivi')} to="/electricity/manuel" />}
          {canViewDashboards && <SidebarSubItem label="Comparaison" to="/comparison/electricity" />}
        </SidebarSection>

        <SidebarSection
          icon={Droplets}
          label={t('nav.eau')}
          isExpanded={expandedSections.has('eau')}
          onToggle={() => toggleSection('eau')}
          isSidebarExpanded={expanded}
          isActive={isRouteActive(['/eau', '/comparison/eau'])}
        >
          {canViewDashboards && <SidebarSubItem label={t('nav.wattnow')} to="/eau/wattnow" />}
          {canViewManuel && <SidebarSubItem label={t('nav.suivi')} to="/eau/manuel" />}
          {canViewDashboards && <SidebarSubItem label="Comparaison" to="/comparison/eau" />}
        </SidebarSection>

        <div className="my-2 border-t border-border/50" />

        {canViewDashboards && (
          <SidebarLink icon={Table2} label="Explorateur" to="/explorer" isSidebarExpanded={expanded} />
        )}
        
        <SidebarLink icon={Settings} label={t('nav.parametres')} to="/parametres" isSidebarExpanded={expanded} />

      </nav>
      
      <div className="p-3 border-t border-border/50 flex flex-col items-center">
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 rounded-md transition-all w-full mb-2",
            expanded ? "px-3 py-2.5 hover:bg-red-500/10 hover:text-red-500 text-muted-foreground" : "p-2.5 justify-center hover:bg-red-500/10 hover:text-red-500 text-muted-foreground"
          )}
          title={!expanded ? t('nav.deconnexion') : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {expanded && <span className="font-medium">{t('nav.deconnexion')}</span>}
        </button>

        {expanded && (
          <div className="text-xs text-muted-foreground/50 text-center w-full">
            {t('sidebar.version')}
          </div>
        )}
      </div>
    </aside>
  );
}

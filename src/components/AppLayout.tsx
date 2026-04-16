import { useState, useEffect } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import { isAuthenticated, getCurrentUser, getDefaultRoute } from "@/lib/auth";

// Define access rules per role:
const OPERATOR_ROUTES = [
  '/home',
  '/electricity/manuel',
  '/eau/manuel', 
  '/manual-entry',
  '/manual-list',
  '/parametres',
]

const VIEWER_ROUTES = [
  '/dashboard',
  '/comparison',
  '/explorer',
  '/eau/wattnow',
  '/parametres',
  '/electricity/manuel',
  '/eau/manuel',
]

export default function AppLayout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    const saved = localStorage.getItem("stlr_sidebar_expanded");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const location = useLocation();

  useEffect(() => {
    localStorage.setItem("stlr_sidebar_expanded", JSON.stringify(sidebarExpanded));
  }, [sidebarExpanded]);

  const toggleSidebar = () => setSidebarExpanded(prev => !prev);

  // Synchronous Auth Check
  if (!isAuthenticated()) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  const user = getCurrentUser();
  const currentPath = location.pathname;

  // Check route access based on role:
  function canAccessRoute(path: string, role: string): boolean {
    if (role === 'admin') return true;
    
    const allowedRoutes = role === 'operator' ? OPERATOR_ROUTES : VIEWER_ROUTES;
    return allowedRoutes.some(route => path.startsWith(route));
  }

  if (user && !canAccessRoute(currentPath, user.role)) {
    return <Navigate to={getDefaultRoute(user.role)} replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex w-full">
      <Sidebar expanded={sidebarExpanded} toggle={toggleSidebar} />
      <main 
        className={`flex-1 flex flex-col min-h-screen overflow-x-hidden min-w-0 transition-all duration-300 ${
          sidebarExpanded ? "ml-[240px]" : "ml-[68px]"
        }`}
      >
        <div className="flex-1 w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

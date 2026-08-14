"use client";

import { useState, createContext, useContext, ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { DataStoreProvider } from "@/context/DataStoreContext";

interface AppContextType {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const AppContext = createContext<AppContextType>({
  searchQuery: "",
  setSearchQuery: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <AppContext.Provider value={{ searchQuery, setSearchQuery }}>
      <DataStoreProvider>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <TopBar
              onMenuClick={() => setSidebarOpen(true)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
          </div>
        </div>
      </DataStoreProvider>
    </AppContext.Provider>
  );
}

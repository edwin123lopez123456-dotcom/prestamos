"use client";

import { useState, createContext, useContext, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
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
        <div className="flex min-h-[100dvh] page-gradient">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <div className="flex flex-1 flex-col min-w-0">
            <TopBar
              onMenuClick={() => setSidebarOpen(true)}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
            <main className="flex-1 overflow-y-auto pb-20 lg:pb-8 px-3 pt-4 sm:px-5 lg:px-8 lg:pt-8">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </main>
            <BottomNav />
          </div>
        </div>
      </DataStoreProvider>
    </AppContext.Provider>
  );
}

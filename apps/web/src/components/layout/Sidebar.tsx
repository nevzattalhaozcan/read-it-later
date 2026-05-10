import React from 'react';
import { Layout as LayoutIcon, Inbox, Star, CheckCircle, Tag, Moon, Sun } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [isDark, setIsDark] = React.useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const navItems = [
    { id: 'all', label: 'All Articles', icon: Inbox },
    { id: 'unread', label: 'Unread', icon: LayoutIcon },
    { id: 'favorites', label: 'Favorites', icon: Star },
    { id: 'archive', label: 'Archive', icon: CheckCircle },
  ];

  return (
    <aside className="w-64 glass border-r h-full flex flex-col p-4 z-20">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">R</div>
        <h1 className="text-xl font-bold tracking-tight">ReadIt</h1>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
              activeTab === item.id 
                ? "bg-primary-50 text-primary-600 dark:bg-primary-950/30 dark:text-primary-400" 
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            <item.icon className={cn("w-5 h-5", activeTab === item.id ? "text-primary-600 dark:text-primary-400" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300")} />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all">
          <Tag className="w-5 h-5" />
          <span className="font-medium">Tags</span>
        </button>
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          <span className="font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </aside>
  );
};

import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { motion } from 'motion/react';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className={`
        relative p-2 rounded-xl transition-all cursor-pointer border
        bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200
        dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-amber-300 dark:border-slate-700
        focus:outline-hidden focus:ring-2 focus:ring-blue-500
        ${className}
      `}
    >
      <motion.div
        key={theme}
        initial={{ scale: 0.5, rotate: -90, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="flex items-center justify-center"
      >
        {theme === 'light' ? (
          <Moon className="w-4 h-4 text-slate-700" />
        ) : (
          <Sun className="w-4 h-4 text-amber-400" />
        )}
      </motion.div>
    </button>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bell, Check, CheckCheck, AlertCircle, Info, Sparkles, RefreshCw } from 'lucide-react';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} from '../services/notificationService';
import { NotificationTable } from '../types/database';
import { subscribeToSupabaseRealtime } from '../services/supabaseDataLayer';

export const NotificationCenter: React.FC = () => {
  const { userProfile } = useAuth();
  const userId = userProfile?.user_id;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  const [notifications, setNotifications] = useState<NotificationTable[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = async () => {
    const requestedUserId = userId;
    if (!requestedUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getUserNotifications(requestedUserId);
      if (currentUserId.current === requestedUserId) setNotifications(data);
    } catch (e) {
      if (currentUserId.current === requestedUserId) setLoadError(e instanceof Error ? e.message : 'Could not load notifications.');
    } finally {
      if (currentUserId.current === requestedUserId) setLoading(false);
    }
  };

  useEffect(() => {
    setNotifications([]);
    setLoadError(null);
    setLoading(Boolean(userId));
    fetchNotifications();

    if (userId) {
      const unsubscribe = subscribeToSupabaseRealtime(['notifications'], () => fetchNotifications());
      return () => unsubscribe();
    }
  }, [userId]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await markNotificationAsRead(id);
    if (success) {
      setNotifications((prev) =>
        prev.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n))
      );
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    const success = await markAllNotificationsAsRead(userId);
    if (success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    }
  };

  const getPriorityBadgeStyle = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'High':
        return 'bg-amber-950 text-amber-300 border-amber-800';
      case 'Medium':
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case 'Low':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button with Unread Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-mono font-bold text-[10px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse border border-slate-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-sky-400" />
              <span className="font-bold text-white text-xs">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-rose-950 text-rose-300 border border-rose-800 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold">
                  {unreadCount} Unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="text-slate-400 hover:text-white p-1"
                title="Refresh notifications"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadError && notifications.length > 0 && (
            <p className="border-b border-amber-800 bg-amber-950/40 px-3 py-2 text-[10px] text-amber-200" role="status">
              Refresh failed; showing the last notifications loaded for this account.
            </p>
          )}

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 no-scrollbar">
            {loading && notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400" role="status">Loading your notifications…</div>
            ) : loadError && notifications.length === 0 ? (
              <div className="p-6 text-center space-y-2" role="alert">
                <AlertCircle className="w-5 h-5 text-rose-400 mx-auto" />
                <p className="text-xs text-rose-200">{loadError}</p>
                <button onClick={fetchNotifications} className="text-xs font-bold text-sky-300 underline">Retry</button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <Info className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-300">No Notifications</p>
                <p className="text-[11px] text-slate-500">
                  Trusted updates for prototype requests, transfers, and inventory thresholds will appear here.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.notification_id}
                  className={`p-3 transition-colors ${
                    !n.is_read ? 'bg-slate-900/90' : 'bg-slate-950/40 opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${getPriorityBadgeStyle(n.priority)}`}>
                          {n.priority}
                        </span>
                        <h4 className="font-bold text-white text-xs leading-tight">{n.title}</h4>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">{n.message}</p>
                      {n.entity_type && n.entity_id && (
                        <p className="text-[9px] text-sky-300/80">Related {n.entity_type.replaceAll('_', ' ')} · {n.entity_id.slice(0, 8)}</p>
                      )}
                      <p className="text-[9px] font-mono text-slate-500 pt-0.5">
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    {!n.is_read && (
                      <button
                        onClick={(e) => handleMarkRead(n.notification_id, e)}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md shrink-0 cursor-pointer"
                        title="Mark as read"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

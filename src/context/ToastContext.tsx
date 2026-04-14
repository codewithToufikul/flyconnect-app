import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export interface ToastMessage {
  id: string;
  senderId?: string;
  senderName: string;
  senderImage?: string;
  message: string;
  conversationId: string;
  contentType?: string;
}

interface ToastContextType {
  showToast: (msg: Omit<ToastMessage, 'id'>) => void;
  currentToast: ToastMessage | null;
  dismissToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentToast(null);
  }, []);

  const showToast = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const id = `${Date.now()}-${Math.random()}`;
    setCurrentToast({ ...msg, id });

    // Auto-dismiss after 4 seconds
    timerRef.current = setTimeout(() => {
      setCurrentToast(null);
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, currentToast, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

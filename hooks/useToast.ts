import { useState, useCallback } from 'react';

export function useToast() {
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isShowing, setIsShowing] = useState(false);

  const showToast = useCallback((message: string) => {
    if (isShowing) return;
    setIsShowing(true);
    setToastMessage(message);
    setToastVisible(true);
  }, [isShowing]);

  const hideToast = useCallback(() => {
    setToastVisible(false);
    setTimeout(() => setIsShowing(false), 100);
  }, []);

  return {
    toastVisible,
    toastMessage,
    showToast,
    hideToast,
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';

export const useIdleDetection = (options = {}) => {
  const {
    warningTime = 8 * 60 * 1000,
    idleTime = 10 * 60 * 1000,
    onWarning = () => {},
    onIdle = () => {},
    onActive = () => {},
    enabled = true
  } = options;

  const [isIdle, setIsIdle] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [timeUntilIdle, setTimeUntilIdle] = useState(0);

  const lastActivityTimeRef = useRef(Date.now());
  const intervalRef = useRef(null);

  const handleActivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    if (isIdle || showWarning) {
      setIsIdle(false);
      setShowWarning(false);
      onActive();
    }
  }, [isIdle, showWarning, onActive]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setShowWarning(false);
      setIsIdle(false);
      return;
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const inactiveDuration = now - lastActivityTimeRef.current;
      
      if (inactiveDuration >= idleTime) {
        if (!isIdle) {
          setIsIdle(true);
          setShowWarning(false);
          onIdle();
        }
      } 
      else if (inactiveDuration >= warningTime) {
        if (!showWarning) {
          setShowWarning(true);
          onWarning();
        }
        const remaining = Math.ceil((idleTime - inactiveDuration) / 1000);
        setTimeUntilIdle(remaining > 0 ? remaining : 0);
      } 
      else {
        if (showWarning) {
           setShowWarning(false);
           onActive();
        }
      }
    }, 1000);

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, handleActivity, warningTime, idleTime, onWarning, onIdle, onActive, isIdle, showWarning]);

  const extendSession = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  return {
    isIdle,
    showWarning,
    timeUntilIdle,
    extendSession
  };
};
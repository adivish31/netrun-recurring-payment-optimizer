'use client';
import { useEffect, useRef, useState } from 'react';

export function AnimatedSection({ children, className = '', id }: { children: React.ReactNode, className?: string, id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Only animate once
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} id={id} className={`fade-up-enter ${isVisible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function AnimatedTimelineRow({ children, className = '', delayMs = 0 }: { children: React.ReactNode, className?: string, delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            setIsVisible(true);
          }, delayMs);
          observer.disconnect(); // Only animate once
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, [delayMs]);

  return (
    <div ref={ref} className={`timeline-row ${isVisible ? 'is-visible' : ''} ${className}`}>
      {children}
    </div>
  );
}

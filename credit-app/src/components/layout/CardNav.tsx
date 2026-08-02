import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { gsap } from 'gsap';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '../ui/Icon';
import './CardNav.css';

export interface CardNavLink {
  label: string;
  ariaLabel?: string;
  href?: string;
}

export interface CardNavItem {
  label: string;
  bgColor: string;
  textColor: string;
  links?: CardNavLink[];
}

interface CardNavProps {
  logoNode?: React.ReactNode;
  items: CardNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  menuColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  ctaText?: string;
  onCtaClick?: () => void;
}

const CardNav: React.FC<CardNavProps> = ({
  logoNode,
  items,
  className = '',
  ease = 'power3.out',
  baseColor = '#fff',
  menuColor,
  buttonBgColor = '#111',
  buttonTextColor = '#fff',
  ctaText = 'Get Started',
  onCtaClick,
}) => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const pathname = usePathname();

  const calculateHeight = () => {
    const navEl = navRef.current;
    if (!navEl) return 260;

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      const contentEl = navEl.querySelector('.card-nav-content') as HTMLElement;
      if (contentEl) {
        const wasVisible = contentEl.style.visibility;
        const wasPointerEvents = contentEl.style.pointerEvents;
        const wasPosition = contentEl.style.position;
        const wasHeight = contentEl.style.height;

        contentEl.style.visibility = 'visible';
        contentEl.style.pointerEvents = 'auto';
        contentEl.style.position = 'static';
        contentEl.style.height = 'auto';

        // Force reflow
        void contentEl.offsetHeight;

        const topBar = 60;
        const padding = 16;
        const contentHeight = contentEl.scrollHeight;

        contentEl.style.visibility = wasVisible;
        contentEl.style.pointerEvents = wasPointerEvents;
        contentEl.style.position = wasPosition;
        contentEl.style.height = wasHeight;

        return topBar + contentHeight + padding;
      }
    }
    return 260;
  };

  const createTimeline = () => {
    const navEl = navRef.current;
    if (!navEl) return null;

    gsap.set(navEl, { height: 60, overflow: 'hidden' });
    gsap.set(cardsRef.current, { y: 50, opacity: 0 });

    const tl = gsap.timeline({ paused: true });

    tl.to(navEl, {
      height: calculateHeight,
      duration: 0.4,
      ease
    });

    tl.to(cardsRef.current, { y: 0, opacity: 1, duration: 0.4, ease, stagger: 0.08 }, '-=0.1');

    return tl;
  };

  useLayoutEffect(() => {
    const tl = createTimeline();
    tlRef.current = tl;

    return () => {
      tl?.kill();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ease, items]);

  useLayoutEffect(() => {
    const handleResize = () => {
      if (!tlRef.current) return;

      if (isExpanded) {
        const newHeight = calculateHeight();
        gsap.set(navRef.current, { height: newHeight });

        tlRef.current.kill();
        const newTl = createTimeline();
        if (newTl) {
          newTl.progress(1);
          tlRef.current = newTl;
        }
      } else {
        tlRef.current.kill();
        const newTl = createTimeline();
        if (newTl) {
          tlRef.current = newTl;
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  // FIX: CardNav lives inside Nav, which sits in layout.tsx — so it stays
  // mounted across client-side route changes instead of remounting fresh
  // per page. Previously nothing here ever reacted to navigation, so if a
  // user opened the menu and clicked one of the nav-card-links, the route
  // changed underneath the menu but isExpanded/isHamburgerOpen never reset
  // — the expanded panel stayed open (and stayed sized for the OLD page's
  // content) on top of the new page. This effect collapses the menu
  // automatically whenever the pathname changes, using the same reverse
  // path toggleMenu() already uses so it stays visually consistent.
  const previousPathnameRef = useRef(pathname);
  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;

    if (isExpanded && tlRef.current) {
      setIsHamburgerOpen(false);
      const tl = tlRef.current;
      tl.eventCallback('onReverseComplete', () => setIsExpanded(false));
      tl.reverse();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleMenu = () => {
    const tl = tlRef.current;
    if (!tl) return;
    if (!isExpanded) {
      setIsHamburgerOpen(true);
      setIsExpanded(true);
      tl.play(0);
    } else {
      setIsHamburgerOpen(false);
      tl.eventCallback('onReverseComplete', () => setIsExpanded(false));
      tl.reverse();
    }
  };

  const setCardRef = (i: number) => (el: HTMLDivElement | null) => {
    cardsRef.current[i] = el;
  };

  return (
    <div className={`card-nav-container ${className}`}>
      <nav ref={navRef} className={`card-nav ${isExpanded ? 'open' : ''}`} style={{ backgroundColor: baseColor }}>
        <div className="card-nav-top">
          <div
            className={`hamburger-menu ${isHamburgerOpen ? 'open' : ''}`}
            onClick={toggleMenu}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMenu();
              }
            }}
            role="button"
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
            aria-expanded={isExpanded}
            tabIndex={0}
            style={{ color: menuColor || '#000' }}
          >
            <div className="hamburger-line" />
            <div className="hamburger-line" />
          </div>

          <div className="logo-container">
            {logoNode}
          </div>

          <button
            type="button"
            className="card-nav-cta-button"
            style={{ backgroundColor: buttonBgColor, color: buttonTextColor }}
            onClick={onCtaClick}
          >
            {ctaText}
          </button>
        </div>

        <div className="card-nav-content" aria-hidden={!isExpanded}>
          {(items || []).slice(0, 3).map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              className="nav-card"
              ref={setCardRef(idx)}
              style={{ backgroundColor: item.bgColor, color: item.textColor }}
            >
              <div className="nav-card-label font-mono">{item.label}</div>
              <div className="nav-card-links font-mono">
                {item.links?.map((lnk, i) => (
                  <Link key={`${lnk.label}-${i}`} href={lnk.href || "#"} className="nav-card-link flex items-center gap-1" aria-label={lnk.ariaLabel}>
                    <Icon name="chevron-right" size={12} className="nav-card-link-icon" />
                    {lnk.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Childish hand-drawn arrow hint — outside the nav bar */}
      {!isExpanded && (
        <div className="absolute left-[20px] top-[64px] pointer-events-none select-none" style={{ opacity: 0.55 }}>
          <span 
            className="font-mono text-[9px] text-text-primary block whitespace-nowrap"
            style={{ transform: 'rotate(-3deg)', transformOrigin: 'left' }}
          >
            click the navigation
          </span>
          <svg width="50" height="36" viewBox="0 0 50 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="overflow-visible mt-[-2px] ml-[4px]">
            {/* Smooth organic curve sweeping up-left */}
            <path 
              d="M40 34 Q36 22 28 16 Q20 10 14 8 Q8 6 4 4" 
              stroke="#1B1722" 
              strokeWidth="1.2" 
              strokeLinecap="round" 
              fill="none"
            />
            {/* Arrowhead — two short strokes */}
            <path d="M4 4 L9 3" stroke="#1B1722" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M4 4 L5 9" stroke="#1B1722" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default CardNav;

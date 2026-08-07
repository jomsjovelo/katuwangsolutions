"use client"

import React from 'react';

export function MessengerWidget() {
  const [isOverlayActive, setIsOverlayActive] = React.useState(false);

  React.useEffect(() => {
    const checkOverlay = () => {
      const isCustomOverlay = document.body.getAttribute('data-overlay-open') === 'true';
      const isRadixDialogOpen = document.querySelector('[role="dialog"]') !== null;
      setIsOverlayActive(isCustomOverlay || isRadixDialogOpen);
    };
    checkOverlay();
    const observer = new MutationObserver(checkOverlay);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (isOverlayActive) return null;

  return (
    <a
      data-testid="floating-messenger-widget"
      href="https://m.me/katuwangsolutions"
      target="_blank"
      rel="noopener noreferrer"
      // Positioned bottom-24 to avoid colliding with the bottom FloatingCta on mobile, 
      // but on large screens where FloatingCta might not stretch, we can keep it nice and clear.
      className="fixed bottom-24 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-full text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-300"
      style={{
        background: 'linear-gradient(83.84deg, #0088FF -6.87%, #A033FF 26.54%, #FF5C87 100%)', // Official Messenger gradient
        boxShadow: '0 10px 25px -5px rgba(0, 136, 255, 0.4)'
      }}
    >
      <svg 
        width="24" 
        height="24" 
        viewBox="0 0 36 36" 
        fill="currentColor" 
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path d="M17.6539 2C8.61113 2 1.28223 8.84752 1.28223 17.2942C1.28223 21.9961 3.51813 26.1953 6.99427 28.9329C7.30752 29.1822 7.49845 29.5601 7.49392 29.9575L7.42436 33.1554C7.38289 35.0645 9.40058 36.1751 10.9859 35.1165L14.7317 32.6143C15.0673 32.39 15.4673 32.2858 15.8742 32.3168C16.4552 32.3614 17.0494 32.3857 17.6539 32.3857C26.6967 32.3857 34.0256 25.5381 34.0256 17.0915C34.0256 8.64483 26.6967 2 17.6539 2ZM18.7235 22.8631L15.3402 19.2612C14.7226 18.6042 13.6841 18.5204 12.9667 19.0682L8.74567 22.2929C7.88607 22.9493 6.75736 21.9366 7.28828 20.9856L11.0205 14.3013C11.6669 13.1437 13.2505 12.759 14.3725 13.4891L17.7558 17.091C18.3734 17.7479 19.4119 17.8318 20.1293 17.284L24.3503 14.0592C25.2099 13.4029 26.3386 14.4155 25.8077 15.3665L22.0755 22.0509C21.4291 23.2085 19.8455 23.5932 18.7235 22.8631Z" />
      </svg>
      <span className="font-bold tracking-tight text-sm pr-1">Chat with us</span>
    </a>
  );
}

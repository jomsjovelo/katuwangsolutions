describe('Customer Incident — Repeated iOS Install Prompt & In-App Browser Suppression', () => {
  const IPHONE_SAFARI_GENUINE_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  
  // iOS 3rd Party Browsers
  const IPHONE_CHROME_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1';
  const IPHONE_FIREFOX_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/123.0 Mobile/15E148 Safari/604.1';
  
  // iOS In-App Browsers
  const IPHONE_FACEBOOK_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBCR/Smart;FBID/phone;FBLC/en_US;FBOP/5]';
  const IPHONE_MESSENGER_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FB_IAB/MessengerForiOS;FBAV/442.0.0.28.109]';
  const IPHONE_INSTAGRAM_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 321.0.0.18.108 (iPhone15,2; iOS 17_4; en_US)';
  const IPHONE_GOOGLE_APP_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/305.0.609594411 Mobile/15E148 Safari/604.1';

  // Desktop / Android
  const ANDROID_CHROME_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.90 Mobile Safari/537.36';

  const STORAGE_KEY = 'katuwang_ios_install_prompt_dismissed_v1';

  const seedValidStaffSession = (win: Window) => {
    const loginTimestamp = Date.now();
    const tenant = {
      id: 'ios-prompt-test-tenant',
      name: 'iOS Test Store',
      moduleType: 'benta-snap',
      ownerUid: 'staff_pin',
      staffUids: ['ios-prompt-test-staff'],
      pricingTier: 'promo_99',
      subscriptionStatus: 'active',
      createdAt: new Date(loginTimestamp).toISOString(),
    };

    win.localStorage.setItem(
      'katuwang-staff-session-storage',
      JSON.stringify({
        state: {
          staffSession: {
            tenantId: tenant.id,
            staffAccountId: 'ios-prompt-test-staff',
            username: 'ios_test_staff',
            tenantName: tenant.name,
            moduleType: tenant.moduleType,
            loginTimestamp,
          },
        },
        version: 0,
      })
    );
    win.localStorage.setItem(
      'katuwang-store',
      JSON.stringify({
        state: {
          activeTenant: tenant,
          activeModuleOverride: null,
          seededTenants: [],
        },
        version: 0,
      })
    );

    // Unhide content in test environment
    const style = win.document.createElement('style');
    style.id = 'cypress-unhide-style';
    style.innerHTML = '.hidden { display: block !important; }';
    win.document.head?.appendChild(style);
    win.addEventListener('DOMContentLoaded', () => {
      if (!win.document.getElementById('cypress-unhide-style')) {
        win.document.head.appendChild(style);
      }
    });
  };

  describe('1. Route-based Suppression (Dashboard Only)', () => {
    it('does not display automatic prompt on landing page /', () => {
      cy.visit('/', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });
      cy.wait(1200);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('does not display automatic prompt on /login', () => {
      cy.visit('/login', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });
      cy.wait(1200);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('does not display automatic prompt on module pages (/benta-snap)', () => {
      cy.visit('/benta-snap', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });
      cy.wait(1200);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('does not display automatic prompt on onboarding pages (/benta-snap/onboarding)', () => {
      cy.visit('/benta-snap/onboarding', {
        onBeforeLoad: (win) => {
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });
      cy.wait(1200);
      cy.contains('Install Katuwang App').should('not.exist');
    });
  });

  describe('2. Authenticated Dashboard Presentation, Dismissal & Persistence', () => {
    it('shows automatic prompt on /dashboard for genuine iOS Safari, dismisses on close, and stores versioned key', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });

      // Prompt should appear after timer
      cy.contains('Install Katuwang App', { timeout: 5000 }).should('be.visible');
      cy.contains('Install this web app on your iPhone for full-screen access').should('be.visible');

      // Verify close button accessibility and touch target size >= 44x44
      cy.get('button[aria-label="Isara ang iOS install prompt"]')
        .should('be.visible')
        .then(($btn) => {
          const rect = $btn[0].getBoundingClientRect();
          expect(rect.height).to.be.at.least(44);
          expect(rect.width).to.be.at.least(44);
        });

      // Dismiss prompt
      cy.get('button[aria-label="Isara ang iOS install prompt"]').click();
      cy.contains('Install Katuwang App').should('not.exist');

      // Check localStorage persistence
      cy.window().then((win) => {
        expect(win.localStorage.getItem(STORAGE_KEY)).to.equal('true');
      });
    });

    it('does not show prompt on reload or subsequent visit when dismissed in localStorage', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          win.sessionStorage.clear();
          seedValidStaffSession(win);
          win.localStorage.setItem(STORAGE_KEY, 'true');
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });
  });

  describe('3. In-App Browser and Non-Safari Suppression (Only Genuine Safari Qualifies)', () => {
    it('suppresses prompt in Facebook iOS in-app browser', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_FACEBOOK_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in Messenger iOS in-app browser', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_MESSENGER_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in Instagram iOS in-app browser', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_INSTAGRAM_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in Google App on iOS', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_GOOGLE_APP_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in iOS Chrome (CriOS)', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_CHROME_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in iOS Firefox (FxiOS)', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_FIREFOX_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt on non-iOS browsers (Android Chrome)', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: ANDROID_CHROME_UA,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('suppresses prompt in standalone (PWA installed) mode', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
          Object.defineProperty(win.navigator, 'standalone', {
            value: true,
            configurable: true,
          });
        },
      });

      cy.wait(1500);
      cy.contains('Install Katuwang App').should('not.exist');
    });
  });

  describe('4. Storage Resilience & Manual Controls Preservation', () => {
    it('handles localStorage failure gracefully without crashing the dashboard', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
          // Mock localStorage throwing errors on prompt key
          const originalGet = win.localStorage.getItem.bind(win.localStorage);
          cy.stub(win.localStorage, 'getItem').callsFake((key: string) => {
            if (key === STORAGE_KEY) {
              throw new Error('SecurityError: The operation is insecure.');
            }
            return originalGet(key);
          });
        },
      });

      cy.contains('Install Katuwang App', { timeout: 5000 }).should('be.visible');
      cy.get('button[aria-label="Isara ang iOS install prompt"]').click();
      cy.contains('Install Katuwang App').should('not.exist');
    });

    it('preserves manual HELP guide install guidance independently of automatic prompt dismissal', () => {
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: (win) => {
          seedValidStaffSession(win);
          win.localStorage.setItem(STORAGE_KEY, 'true');
          Object.defineProperty(win.navigator, 'userAgent', {
            value: IPHONE_SAFARI_GENUINE_UA,
            configurable: true,
          });
        },
      });

      // Automatic prompt is dismissed
      cy.contains('Install Katuwang App').should('not.exist');

      // Click HELP button to verify manual help guide is accessible
      cy.contains('button', 'HELP').should('be.visible').click();
      cy.contains('Gabay sa Paggamit').should('be.visible');
      cy.get('button[aria-label="Isara ang gabay"]').should('be.visible').click();

      // Click floating Help & Support drawer to verify manual PWA install guidance is accessible
      cy.get('button.fixed.bottom-20').should('be.visible').click();
      cy.contains('Help & Support').should('be.visible');
      cy.contains('I-INSTALL SA IPHONE').scrollIntoView().should('be.visible');
    });
  });
});

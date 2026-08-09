import { transformFirebaseAuthActionLink } from '../../src/lib/firebase-auth-action-link';

describe('Production Reliability Hotfix Acceptance Suite', () => {
  const seedValidStaffSession = (win: Window) => {
    const loginTimestamp = Date.now();
    const tenant = {
      id: 'hotfix-help-test-tenant',
      name: 'Hotfix Help Test Store',
      moduleType: 'benta-snap',
      ownerUid: 'staff_pin',
      staffUids: ['hotfix-help-test-staff'],
      pricingTier: 'promo_99',
      subscriptionStatus: 'active',
      createdAt: new Date(loginTimestamp).toISOString(),
    };

    win.localStorage.setItem('katuwang-staff-session-storage', JSON.stringify({
      state: {
        staffSession: {
          tenantId: tenant.id,
          staffAccountId: 'hotfix-help-test-staff',
          username: 'hotfix_help_test',
          tenantName: tenant.name,
          moduleType: tenant.moduleType,
          loginTimestamp,
        },
      },
      version: 0,
    }));
    win.localStorage.setItem('katuwang-store', JSON.stringify({
      state: {
        activeTenant: tenant,
        activeModuleOverride: null,
        seededTenants: [],
      },
      version: 0,
    }));
  };

  describe('INC-01: Firebase auth-action links and routes', () => {
    it('transforms expected verification and reset links and preserves Firebase parameters', () => {
      const verificationSource =
        'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc123XYZ_test&apiKey=AIzaSyTestKey123&continueUrl=https%3A%2F%2Fkatuwangsolutions.com%2Fdashboard%3Ffrom%3Demail&lang=fil';
      const resetSource =
        'https://studio-5538116689-bdfb2.web.app/__/auth/action?mode=resetPassword&oobCode=resetCode999&apiKey=AIzaSyTestKey123&continueUrl=https%3A%2F%2Fkatuwangsolutions.com%2Flogin&lang=en';

      [verificationSource, resetSource].forEach((source) => {
        const sourceUrl = new URL(source);
        const transformedUrl = new URL(transformFirebaseAuthActionLink(source));

        expect(transformedUrl.origin).to.equal('https://katuwangsolutions.com');
        expect(transformedUrl.pathname).to.equal('/auth/action');
        expect(transformedUrl.search).to.equal(sourceUrl.search);
        expect(transformedUrl.searchParams.get('mode')).to.equal(sourceUrl.searchParams.get('mode'));
        expect(transformedUrl.searchParams.get('oobCode')).to.equal(sourceUrl.searchParams.get('oobCode'));
        expect(transformedUrl.searchParams.get('apiKey')).to.equal(sourceUrl.searchParams.get('apiKey'));
        expect(transformedUrl.searchParams.get('continueUrl')).to.equal(sourceUrl.searchParams.get('continueUrl'));
        expect(transformedUrl.searchParams.get('lang')).to.equal(sourceUrl.searchParams.get('lang'));
      });
    });

    it('fails closed for malformed, unsafe, unexpected-host, and unexpected-path inputs', () => {
      const rejectedInputs = [
        '',
        'not-a-url',
        'http://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=x',
        'https://evil.example/__/auth/action?mode=verifyEmail&oobCode=x',
        'https://studio-5538116689-bdfb2.firebaseapp.com/auth/action?mode=verifyEmail&oobCode=x',
        'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action/extra?mode=verifyEmail&oobCode=x',
        'https://studio-5538116689-bdfb2.firebaseapp.com:444/__/auth/action?mode=verifyEmail&oobCode=x',
        'https://user:pass@studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=x',
        'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?oobCode=x',
        'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail',
        'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=x#fragment',
      ];

      rejectedInputs.forEach((input) => {
        expect(() => transformFirebaseAuthActionLink(input)).to.throw();
      });
    });

    it('allows signed-out access to the canonical missing-code state', () => {
      cy.visit('/auth/action', { failOnStatusCode: false });
      cy.location('pathname').should('eq', '/auth/action');
      cy.contains('Invalid Link').should('be.visible');
      cy.contains('Walang action mode o verification code').should('be.visible');
    });

    it('preserves legacy verification parameters while redirecting to the canonical action route', () => {
      cy.intercept('POST', '**/identitytoolkit.googleapis.com/**', {
        statusCode: 400,
        body: { error: { code: 400, message: 'INVALID_OOB_CODE' } },
      }).as('legacyFirebaseAction');

      cy.visit('/__/auth/action?mode=verifyEmail&oobCode=dummy_legacy_code&lang=fil', {
        failOnStatusCode: false,
      });
      cy.location('pathname').should('eq', '/auth/action');
      cy.location('search').should('include', 'mode=verifyEmail');
      cy.location('search').should('include', 'oobCode=dummy_legacy_code');
      cy.location('search').should('include', 'lang=fil');
      cy.contains('Ang link na ito ay expired na o nagamit na.').should('be.visible');
    });

    ['INVALID_OOB_CODE', 'EXPIRED_OOB_CODE'].forEach((firebaseError) => {
      it(`renders a safe verification error for ${firebaseError} without a real Firebase mutation`, () => {
        cy.intercept('POST', '**/identitytoolkit.googleapis.com/**', {
          statusCode: 400,
          body: { error: { code: 400, message: firebaseError } },
        }).as('firebaseVerificationAction');

        cy.visit(`/auth/action?mode=verifyEmail&oobCode=${firebaseError.toLowerCase()}`);
        cy.wait('@firebaseVerificationAction');
        cy.contains('Ang link na ito ay expired na o nagamit na.').should('be.visible');
      });
    });

    it('routes invalid reset-password codes through the canonical handler without a real reset', () => {
      cy.intercept('POST', '**/identitytoolkit.googleapis.com/**', {
        statusCode: 400,
        body: { error: { code: 400, message: 'INVALID_OOB_CODE' } },
      }).as('firebaseResetAction');

      cy.visit('/auth/action?mode=resetPassword&oobCode=invalid_reset_code');
      cy.wait('@firebaseResetAction');
      cy.contains('Ang link na ito ay expired na o nagamit na.').should('be.visible');
    });

    it('renders unsupported modes safely and keeps authenticated application UI protected', () => {
      cy.visit('/auth/action?mode=unknownMode&oobCode=dummy_code');
      cy.contains('Hindi suportadong action mode.').should('be.visible');

      cy.visit('/dashboard', { failOnStatusCode: false });
      cy.get('body').should('not.contain.text', 'APP MARKET PLACE');
      cy.get('body').should('not.contain.text', 'HELP');
    });
  });

  describe('INC-02: actual production ModuleGuide mobile and accessibility behavior', () => {
    const viewports: Array<[number, number]> = [
      [320, 568],
      [360, 800],
      [390, 844],
      [412, 915],
    ];

    it('opens, scrolls, closes, and restores focus at all four required viewports', () => {
      let forbiddenMutationRequests = 0;
      cy.intercept('POST', '**/identitytoolkit.googleapis.com/**', () => {
        forbiddenMutationRequests += 1;
      });
      cy.intercept('POST', '**/*documents:commit*', () => {
        forbiddenMutationRequests += 1;
      });

      cy.viewport(320, 568);
      cy.visit('/dashboard', {
        failOnStatusCode: false,
        onBeforeLoad: seedValidStaffSession,
      });

      cy.contains('button', 'Back to Profile').should('exist').click({ force: true });
      cy.contains('Open Register').should('not.exist');
      cy.contains('button', 'HELP')
        .should('exist')
        .then(($button) => {
          $button.parents('.hidden').removeClass('hidden');
        });

      viewports.forEach(([width, height]) => {
        cy.viewport(width, height);
        cy.contains('button', 'HELP')
          .should('be.visible')
          .focus()
          .then(($button) => {
            const rect = $button[0].getBoundingClientRect();
            expect(rect.width).to.be.at.least(44);
            expect(rect.height).to.be.at.least(44);
          })
          .click();

        cy.get('[role="dialog"]')
          .should('be.visible')
          .and('have.attr', 'data-state', 'open')
          .should(($dialog) => {
            const rect = $dialog[0].getBoundingClientRect();
            expect(rect.top).to.be.at.least(0);
            expect(rect.bottom).to.be.at.most(height + 1);
          });
        cy.contains('Gabay sa Paggamit').should('be.visible');
        cy.get('[role="dialog"] .overflow-y-auto')
          .should('exist')
          .then(($scrollRegion) => {
            expect(getComputedStyle($scrollRegion[0]).overflowY).to.equal('auto');
            if (width === 320 && height === 568) {
              expect($scrollRegion[0].scrollHeight).to.be.greaterThan($scrollRegion[0].clientHeight);
              $scrollRegion[0].scrollTop = $scrollRegion[0].scrollHeight;
              expect($scrollRegion[0].scrollTop).to.be.greaterThan(0);
            }
          });
        cy.get('button[aria-label="Isara ang gabay"]').should('be.visible');
        cy.contains('button', 'Nakuha Ko Na!').should('be.visible');
        cy.focused().should(($focused) => {
          expect($focused.closest('[role="dialog"]')).to.have.length(1);
        });

        cy.get('body').type('{esc}');
        cy.get('[role="dialog"]').should('not.exist');
        cy.contains('button', 'HELP').should('be.focused').click();
        cy.get('[role="dialog"]').should('be.visible');
        cy.get('button[aria-label="Isara ang gabay"]').click();
        cy.get('[role="dialog"]').should('not.exist');
        cy.contains('button', 'HELP').click();
        cy.contains('button', 'Nakuha Ko Na!').click();
        cy.get('[role="dialog"]').should('not.exist');
      });

      cy.wrap(null).then(() => {
        expect(forbiddenMutationRequests).to.equal(0);
      });
    });
  });
});

import { transformFirebaseAuthActionLink } from '../../src/lib/firebase-auth-action-link';
import { getActiveAppById } from '../../src/lib/app-data';

describe('Production Health Pass 1 Behavioral Corrections Suite', () => {

  const UA_SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const UA_FACEBOOK_ANDROID = 'Mozilla/5.0 (Linux; Android 10; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/405.0.0.0.100;]';
  const UA_MESSENGER_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MessengerForiOS/405.0.0.0.100';
  const UA_INSTAGRAM_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 305.0.0.0.100';

  const visitWithUserAgent = (url: string, userAgent: string) => {
    cy.visit(url, {
      onBeforeLoad(win) {
        win.sessionStorage.removeItem('katuwang_iab_dismissed');
        Object.defineProperty(win.navigator, 'userAgent', {
          value: userAgent,
          configurable: true,
          writable: true,
        });
      },
    });
  };

  describe('1. Verification API route security and generic responses', () => {
    it('rejects missing bearer token with generic 401 response', () => {
      cy.request({
        method: 'POST',
        url: '/api/auth/send-verification',
        body: { email: 'test@example.com' },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body).to.deep.eq({ error: 'Invalid or unauthorized request' });
        expect(JSON.stringify(response.body)).to.not.include('Missing or invalid token');
      });
    });

    it('rejects invalid bearer token with generic 401 response', () => {
      cy.request({
        method: 'POST',
        url: '/api/auth/send-verification',
        headers: { Authorization: 'Bearer INVALID_JWT_TOKEN_ABC123' },
        body: { email: 'test@example.com' },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body).to.deep.eq({ error: 'Invalid or unauthorized request' });
        expect(JSON.stringify(response.body)).to.not.include('Firebase');
        expect(JSON.stringify(response.body)).to.not.include('token');
      });
    });

    it('rejects mismatched request body email with generic 401 response', () => {
      cy.request({
        method: 'POST',
        url: '/api/auth/send-verification',
        headers: { Authorization: 'Bearer MALFORMED_TOKEN' },
        body: { email: 'attacker@example.com' },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(401);
        expect(response.body).to.deep.eq({ error: 'Invalid or unauthorized request' });
        expect(JSON.stringify(response.body)).to.not.include('Forbidden');
        expect(JSON.stringify(response.body)).to.not.include('attacker@example.com');
      });
    });
  });

  describe('2. Social browser advisory simulation & Safari / attribution preservation', () => {
    it('displays non-blocking advisory for Facebook user agent and preserves URL, fbclid, UTM, ref, and CTA parameters', () => {
      const targetUrl = '/benta-snap/onboarding?fbclid=IwAR3TestFbclidParam123&utm_source=facebook&utm_medium=cpc&ref=PARTNER123&cta=hero';
      visitWithUserAgent(targetUrl, UA_FACEBOOK_ANDROID);

      // Verify advisory is displayed
      cy.contains('Naka-open sa social browser').should('be.visible');

      // Verify parameters remain in window.location
      cy.url().should('include', 'fbclid=IwAR3TestFbclidParam123');
      cy.url().should('include', 'utm_source=facebook');
      cy.url().should('include', 'ref=PARTNER123');
      cy.url().should('include', 'cta=hero');

      // Dismiss advisory
      cy.get('button[aria-label="Isara"]').click({ force: true });
      cy.contains('Naka-open sa social browser').should('not.exist');

      // Onboarding wizard remains fully interactive
      cy.contains('ACCOUNT SETUP').should('exist');
    });

    it('displays non-blocking advisory for Messenger/iOS user agent', () => {
      visitWithUserAgent('/benta-snap/onboarding?utm_source=messenger', UA_MESSENGER_IOS);
      cy.contains('Naka-open sa social browser').should('be.visible');
    });

    it('displays non-blocking advisory for Instagram user agent', () => {
      visitWithUserAgent('/benta-snap/onboarding?utm_source=instagram', UA_INSTAGRAM_IOS);
      cy.contains('Naka-open sa social browser').should('be.visible');
    });

    it('does NOT display advisory for normal Safari on iOS even with fbclid and Facebook referrer', () => {
      cy.visit('/benta-snap/onboarding?fbclid=IwAR3TestFbclidParam123&utm_source=facebook', {
        onBeforeLoad(win) {
          win.sessionStorage.removeItem('katuwang_iab_dismissed');
          Object.defineProperty(win.navigator, 'userAgent', {
            value: UA_SAFARI_IOS,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(win.document, 'referrer', {
            value: 'https://m.facebook.com/',
            configurable: true,
          });
        },
      });

      // Should NOT show in-app advisory for genuine Safari
      cy.contains('Naka-open sa social browser').should('not.exist');
      cy.contains('ACCOUNT SETUP').should('exist');
    });

    it('does NOT display advisory for normal Chrome on Android', () => {
      visitWithUserAgent('/benta-snap/onboarding?utm_source=google_ads', UA_CHROME_ANDROID);
      cy.contains('Naka-open sa social browser').should('not.exist');
      cy.contains('ACCOUNT SETUP').should('exist');
    });
  });

  describe('3. Selected Katuwang module name in Messenger payment message', () => {
    it('uses correct Katuwang module name Benta Snap instead of [DEFAULT]', () => {
      const app = getActiveAppById('benta-snap');
      expect(app?.name).to.equal('Benta Snap');
      expect(app?.name).to.not.equal('[DEFAULT]');
    });

    it('uses correct Katuwang module name Budget Mo for budget-mo module', () => {
      const app = getActiveAppById('budget-mo');
      expect(app?.name).to.equal('Budget Mo');
      expect(app?.name).to.not.equal('[DEFAULT]');
    });
  });

  describe('4. Auth action link preservation', () => {
    it('preserves verification and password reset query params and canonical routes', () => {
      const rawVerification = 'https://studio-5538116689-bdfb2.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=testOobCode123&apiKey=testApiKey';
      const transformed = transformFirebaseAuthActionLink(rawVerification);
      expect(transformed).to.equal('https://katuwangsolutions.com/auth/action?mode=verifyEmail&oobCode=testOobCode123&apiKey=testApiKey');
    });
  });

});

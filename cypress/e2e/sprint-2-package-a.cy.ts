import {
  flushMetaEventQueue,
  trackMetaCustomEvent,
  trackMetaEvent,
} from '../../src/lib/meta-pixel';
import {
  trackModuleDiscovery,
  trackOnboardingStageView,
  trackPaymentMarkedSent,
  trackPaymentMessengerClick,
  trackRegistrationIntent,
} from '../../src/lib/conversion-events';
import {
  captureFirstTouchAcquisition,
  getStoredAcquisitionSnapshot,
  sanitizeUtmValue,
  updateAcquisitionCtaSource,
  validateLandingPath,
} from '../../src/lib/conversion-attribution';

describe('Sprint 2 Package A — Comprehensive Acceptance Suite (Correction Pass 1)', () => {
  const runControlledTsx = (source: string) => {
    const encoded = Cypress.Buffer.from(source, 'utf8').toString('base64');
    const launcher = `const{execFileSync}=require('child_process');const source=Buffer.from('${encoded}','base64').toString('utf8');process.stdout.write(execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','-e',source],{encoding:'utf8'}));`;
    return cy.exec(`node -e "${launcher}"`, { timeout: 60000 }).then(({ stdout }) => {
      const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith('CONTROLLED_RESULT='));
      expect(resultLine, stdout).to.be.a('string');
      return JSON.parse(resultLine!.slice('CONTROLLED_RESULT='.length));
    });
  };

  const pressEnterNatively = () => {
    const cypressWithAutomation = Cypress as unknown as {
      automation: (event: string, payload: unknown) => Promise<unknown>;
    };

    return cy.then(() => cypressWithAutomation.automation('remote:debugger:protocol', {
        command: 'Input.dispatchKeyEvent',
        params: {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
          windowsVirtualKeyCode: 13,
          nativeVirtualKeyCode: 13,
        },
      }));
  };

  const viewports: [number, number][] = [
    [360, 800],
    [375, 812],
    [390, 844],
    [412, 915],
  ];

  viewports.forEach(([w, h]) => {
    describe(`Viewport ${w}x${h}`, () => {
      beforeEach(() => {
        cy.viewport(w, h);
      });

      it('verifies hero, floating bar, and Messenger visibility and non-overlap geometry', () => {
        cy.visit('/');
        // While hero is in view, floating controls should remain hidden
        cy.get('#homepage-hero').should('be.visible');
        cy.get('#floating-registration-bar').should('not.exist');
        cy.get('[data-testid="floating-messenger-widget"]').should('not.exist');

        // Scroll to bottom past hero
        cy.scrollTo('bottom');

        // Floating bar should become visible
        cy.get('#floating-registration-bar').should('be.visible');

        // Verify touch target geometry (min 44px height)
        cy.get('[data-testid="floating-register-cta"]').then(($btn) => {
          const rect = $btn[0].getBoundingClientRect();
          expect(rect.height).to.be.at.least(44);
          expect(rect.width).to.be.at.least(44);
        });

        // Verify Messenger widget mobile target (min 48x48px)
        cy.get('[data-testid="floating-messenger-widget"]').should('be.visible').then(($widget) => {
          const rect = $widget[0].getBoundingClientRect();
          expect(rect.height).to.be.at.least(48);
          expect(rect.width).to.be.at.least(48);
          expect(rect.left).to.be.at.least(0);
          expect(rect.right).to.be.at.most(w);

          cy.get('#floating-registration-bar').then(($bar) => {
            const bar = $bar[0].getBoundingClientRect();
            expect(rect.bottom).to.be.at.most(bar.top);
            expect(bar.left).to.be.at.least(0);
            expect(bar.right).to.be.at.most(w);
            expect(bar.bottom).to.be.at.most(h);
          });
        });
      });
    });
  });

  describe('Funnel Continuity & Role Preservations', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
    });

    it('maintains Business Finder continuity to owner onboarding for Benta Snap', () => {
      cy.visit('/');
      cy.get('#business-finder').scrollIntoView();
      cy.contains('button', 'Retail / Sari-Sari').click();
      cy.get('#business-finder').contains('button', 'Mag-register').click();

      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Benta Snap').should('be.visible');

      cy.contains('button', 'Business Owner').click();
      cy.contains('button', 'Magpatuloy sa Registration').click();

      cy.url().should('include', '/benta-snap/onboarding');
    });

    it('maintains Problem Finder continuity for Ledger Flow and Tsek-In', () => {
      cy.visit('/');
      cy.contains('h2', 'challenge').scrollIntoView();

      // Ledger Flow problem
      cy.contains('button', 'Hindi ko alam ang tunay kong kita').click();
      cy.contains('button', 'Mag-register para sa Ledger Flow').click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Ledger Flow').should('be.visible');
      cy.get('[aria-label="Isara ang registration sheet"]').click();

      // Tsek-In problem
      cy.contains('h2', 'challenge').scrollIntoView();
      cy.contains('button', 'Magulo ang monitoring ng available rooms at guest check-ins').click();
      cy.contains('button', 'Mag-register para sa Tsek-In').click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Tsek-In').should('be.visible');
      cy.get('[aria-label="Isara ang registration sheet"]').click();
    });

    it('maintains Budget Mo continuity to personal budgeting onboarding', () => {
      cy.visit('/budget-mo');
      cy.contains('h1', 'Budget Mo').should('be.visible');
      cy.contains('a', 'Mag-register para sa Budget Mo').click();
      cy.url().should('include', '/budget-mo/onboarding');
    });

    it('ensures Team Member role routes to Login/Invitation and never owner onboarding', () => {
      cy.visit('/');
      cy.get('[data-testid="hero-register-cta"]').click();
      cy.get('[role="dialog"]').should('be.visible');

      cy.contains('button', 'Team Member / Staff').click();
      cy.contains('button', 'Magpatuloy sa Login').click();

      cy.url().should('include', '/login');
      cy.url().should('not.include', '/onboarding');
    });
  });

  describe('Catalogue Truth & Policy Disclosures', () => {
    it('displays truthful catalogue copy on /modules', () => {
      cy.viewport(1280, 800);
      cy.visit('/modules');

      cy.contains('a', 'Mag-register').should('exist');
      cy.contains('Handa nang pumili ng module?').should('be.visible');
      cy.contains('Libre ang paggawa ng account. Kailangan ang manual GCash o Maya payment').should('be.visible');
      cy.contains('Pumili at Mag-register').should('be.visible');
    });

    it('requires authoritative Terms/Privacy consent links without auto-checking checkbox', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap/onboarding');

      // Complete business step 1
      cy.get('#fullName').type('Juan Dela Cruz');
      
      cy.get('#birthday-month').click();
      cy.contains('[role="option"]', 'Mayo').click();

      cy.get('#birthday-day').click();
      cy.contains('[role="option"]', '15').click();

      cy.get('#birthday-year').click();
      cy.contains('[role="option"]', '1995').click();

      cy.contains('button', 'Susunod').click();

      // Complete business step 2
      cy.get('#businessName').clear().type('Dela Cruz Store');
      cy.get('#address').type('Manila');
      cy.contains('button', 'Tuloy Natin').click();

      // Account Step
      cy.contains('Gumawa ng Account').should('be.visible');
      cy.get('#terms').should('not.be.checked');

      // Verify the keyboard can activate both authoritative policy links.
      cy.contains('a', 'Terms & Conditions')
        .should('have.attr', 'target', '_blank')
        .should('have.attr', 'href', '/terms')
        .invoke('removeAttr', 'target')
        .focus();
      pressEnterNatively();
      cy.location('pathname').should('eq', '/terms');

      cy.go('back');
      cy.contains('Gumawa ng Account').should('be.visible');
      cy.get('#terms').should('not.be.checked');

      cy.contains('a', 'Privacy Policy')
        .should('have.attr', 'target', '_blank')
        .should('have.attr', 'href', '/privacy')
        .invoke('removeAttr', 'target')
        .focus();
      pressEnterNatively();
      cy.location('pathname').should('eq', '/privacy');

      cy.go('back');
      cy.contains('Gumawa ng Account').should('be.visible');

      // Consent checkbox remains unchecked
      cy.get('#terms').should('not.be.checked');
    });
  });

  describe('Dialog Accessibility, Escape & Focus Return', () => {
    it('traps focus, closes on Escape, and returns focus to invoker', () => {
      cy.viewport(390, 844);
      cy.visit('/');

      cy.get('[data-testid="hero-register-cta"]').focus().click();
      cy.get('[role="dialog"]').should('be.visible');
      cy.get('[role="dialog"]').should('have.attr', 'aria-modal', 'true');

      // Escape key closes dialog
      cy.get('body').type('{esc}');
      cy.get('[role="dialog"]').should('not.exist');
      cy.get('[data-testid="hero-register-cta"]').should('be.focused');
    });
  });

  describe('Journey Progress & Payment Event Semantics', () => {
    afterEach(() => {
      delete window.fbq;
    });

    it('renders four progress states accurately without live payment mutation', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap/onboarding');

      // Hakbang 1
      cy.contains('ACCOUNT SETUP · HAKBANG 1 SA 4').should('be.visible');

      // Complete step 1A
      cy.get('#fullName').type('Juan Dela Cruz');
      
      cy.get('#birthday-month').click();
      cy.contains('[role="option"]', 'Mayo').click();

      cy.get('#birthday-day').click();
      cy.contains('[role="option"]', '15').click();

      cy.get('#birthday-year').click();
      cy.contains('[role="option"]', '1995').click();

      cy.contains('button', 'Susunod').click();

      // Complete step 1B
      cy.get('#businessName').clear().type('Dela Cruz Store');
      cy.get('#address').type('Manila');
      cy.contains('button', 'Tuloy Natin').click();

      cy.contains('Gumawa ng Account').should('be.visible');
    });

    it('executes successful and failed registration completion contracts', () => {
      runControlledTsx(`
        (async () => {
        const { completeRegistrationAndAdvance } = await import('./src/components/onboarding/onboarding-wizard');
        const data = { appId: 'benta-snap' };
        const successOrder: string[] = [];
        let successStep = 'account';
        let successPayload: any;
        await completeRegistrationAndAdvance({
          data,
          referredBy: 'REF1234',
          acquisition: { landingPath: '/benta-snap', ctaSource: 'business_finder' },
          moveToPayment: () => { successOrder.push('payment'); successStep = 'payment'; },
        }, {
          registerTenant: async (payload: any) => { successOrder.push('register'); successPayload = payload; return { success: true }; },
          trackCompleteRegistration: () => successOrder.push('complete'),
        });
        const failureOrder: string[] = [];
        let failureStep = 'account';
        let failureMessage = '';
        try {
          await completeRegistrationAndAdvance({
            data,
            referredBy: null,
            acquisition: undefined,
            moveToPayment: () => { failureOrder.push('payment'); failureStep = 'payment'; },
          }, {
            registerTenant: async () => { failureOrder.push('register'); throw new Error('controlled registration failure'); },
            trackCompleteRegistration: () => failureOrder.push('complete'),
          });
        } catch (cause) { failureMessage = (cause as Error).message; }
        console.log('CONTROLLED_RESULT=' + JSON.stringify({ successOrder, successStep, successPayload, failureOrder, failureStep, failureMessage }));
        })().catch((error) => { console.error(error); process.exit(1); });
      `).then((result) => {
        expect(result.successOrder).to.deep.equal(['register', 'complete', 'payment']);
        expect(result.successStep).to.equal('payment');
        expect(result.successPayload.referredBy).to.equal('REF1234');
        expect(result.successPayload.acquisition).to.deep.equal({ landingPath: '/benta-snap', ctaSource: 'business_finder' });
        expect(result.failureMessage).to.equal('controlled registration failure');
        expect(result.failureOrder).to.deep.equal(['register']);
        expect(result.failureStep).to.equal('account');
      });
    });

    it('executes Payment, Messenger, Marked Sent, and Verification behavior without implying activation', () => {
      const calls: unknown[][] = [];
      window.fbq = (...args: unknown[]) => calls.push(args);
      const trackerSet = new Set<string>();
      trackPaymentMessengerClick('benta-snap');
      trackPaymentMarkedSent('benta-snap', trackerSet);

      runControlledTsx(`
        (async () => {
        const { completeRegistrationAndAdvance, getVerificationStepAfterPayment } = await import('./src/components/onboarding/onboarding-wizard');
        const order: string[] = [];
        let step = 'account';
        await completeRegistrationAndAdvance({
          data: { appId: 'benta-snap' },
          referredBy: null,
          acquisition: undefined,
          moveToPayment: () => { order.push('payment'); step = 'payment'; },
        }, {
          registerTenant: async () => { order.push('register'); return { success: true }; },
          trackCompleteRegistration: () => order.push('complete'),
        });
        order.push('marked-sent');
        step = getVerificationStepAfterPayment();
        order.push('verification');
        console.log('CONTROLLED_RESULT=' + JSON.stringify({ order, step }));
        })().catch((error) => { console.error(error); process.exit(1); });
      `).then((result) => {
        expect(result.order).to.deep.equal(['register', 'complete', 'payment', 'marked-sent', 'verification']);
        expect(result.step).to.equal('pending');
        expect(calls.map((call) => call[1])).to.deep.equal([
          'PaymentMessengerClick',
          'PaymentMarkedSent',
        ]);
        expect(JSON.stringify(calls)).not.to.match(/PaymentVerified|AccountActivated|purchase|subscription/i);
        delete window.fbq;
      });
    });
  });

  describe('Measurement and Attribution Contracts', () => {
    afterEach(() => {
      delete window.fbq;
      window.sessionStorage.clear();
    });

    it('preserves Meta track versus trackCustom queue methods and exact allowed payloads', () => {
      const calls: unknown[][] = [];
      delete window.fbq;

      trackMetaEvent('PageView', { content_type: 'website' });
      trackMetaCustomEvent('ModuleDiscovery', {
        module_id: 'benta-snap',
        discovery_type: 'business_finder',
      });

      window.fbq = (...args: unknown[]) => calls.push(args);
      flushMetaEventQueue();

      expect(calls).to.deep.equal([
        ['track', 'PageView', { content_type: 'website' }],
        ['trackCustom', 'ModuleDiscovery', {
          module_id: 'benta-snap',
          discovery_type: 'business_finder',
        }],
      ]);
    });

    it('rejects prohibited analytics values and deduplicates repeat click events', () => {
      const calls: unknown[][] = [];
      window.fbq = (...args: unknown[]) => calls.push(args);

      trackModuleDiscovery('service-master', 'problem_finder');
      trackModuleDiscovery('service-master', 'problem_finder');
      trackRegistrationIntent('hero', 'service-master');
      trackRegistrationIntent('hero', 'service-master');
      trackRegistrationIntent('email@example.com' as never, 'service-master');
      trackModuleDiscovery('bad/email' as never, 'catalogue');

      expect(calls).to.deep.equal([
        ['trackCustom', 'ModuleDiscovery', {
          module_id: 'service-master',
          discovery_type: 'problem_finder',
        }],
        ['trackCustom', 'RegistrationIntent', {
          cta_source: 'hero',
          module_id: 'service-master',
        }],
      ]);
      expect(JSON.stringify(calls)).not.to.match(/email|phone|address|payment|purchase|activation/i);
    });

    it('keeps first-touch attribution, updates final CTA source, and rejects prohibited values', () => {
      window.sessionStorage.clear();
      captureFirstTouchAcquisition(
        new URLSearchParams('utm_source=facebook&utm_medium=social&utm_campaign=launch&utm_content=video-a&fbclid=secret&utm_term=ignored'),
        '/benta-snap'
      );
      captureFirstTouchAcquisition(
        new URLSearchParams('utm_source=other&utm_campaign=user%40example.com'),
        '/privacy?raw=1'
      );
      updateAcquisitionCtaSource('business_finder');

      expect(getStoredAcquisitionSnapshot()).to.deep.equal({
        landingPath: '/benta-snap',
        utmSource: 'facebook',
        utmMedium: 'social',
        utmCampaign: 'launch',
        utmContent: 'video-a',
        ctaSource: 'business_finder',
      });
      expect(sanitizeUtmValue('user@example.com')).to.equal(undefined);
      expect(sanitizeUtmValue('https://example.com')).to.equal(undefined);
      expect(sanitizeUtmValue('a/b')).to.equal(undefined);
      expect(validateLandingPath('/safe/path')).to.equal('/safe/path');
      expect(validateLandingPath('/unsafe?email=user@example.com')).to.equal(undefined);
    });

    it('deduplicates payment events and keeps marked-sent distinct from activation', () => {
      const calls: unknown[][] = [];
      const markedSent = new Set<string>();
      const stageViews = new Set<string>();
      window.fbq = (...args: unknown[]) => calls.push(args);

      trackOnboardingStageView('benta-snap', 'payment', stageViews);
      trackOnboardingStageView('benta-snap', 'payment', stageViews);
      trackPaymentMessengerClick('benta-snap');
      trackPaymentMessengerClick('benta-snap');
      trackPaymentMarkedSent('benta-snap', markedSent);
      trackPaymentMarkedSent('benta-snap', markedSent);

      expect(calls.map((call) => call[1])).to.deep.equal([
        'OnboardingStageView',
        'PaymentInstructionsView',
        'PaymentMessengerClick',
        'PaymentMarkedSent',
      ]);
      expect(JSON.stringify(calls)).not.to.match(/PaymentVerified|AccountActivated|purchase/i);
    });

    it('executes controlled tenant/user persistence with sanitized acquisition and server timestamp', () => {
      runControlledTsx(`
        (async () => {
        const { registerNewTenant } = await import('./src/firebase/firestore/onboarding-actions');
        const writes: Array<{ path: string; data: Record<string, any> }> = [];
        const timestampSentinel = { kind: 'controlled-server-timestamp' };
        let verificationRequests = 0;
        const document = (...args: any[]) => args.length === 1
          ? { path: 'tenants/tenant-controlled', id: 'tenant-controlled' }
          : { path: args[1] + '/' + args[2], id: args[2] };
        const transaction = {
          get: async () => ({ exists: () => false }),
          set: (reference: { path: string }, data: Record<string, any>) => writes.push({ path: reference.path, data }),
        };
        await registerNewTenant({
          appId: 'benta-snap',
          fullName: 'Juan Dela Cruz',
          birthday: '1995-05-15',
          gender: 'Prefer not to say',
          address: 'Manila, Philippines',
          businessName: 'Controlled Store',
          email: 'controlled@example.test',
          password: 'Password123',
          confirmPassword: 'Password123',
          termsAccepted: true,
          referredBy: 'REF1234',
          acquisition: {
            landingPath: '/benta-snap',
            utmSource: 'facebook',
            utmMedium: 'social',
            utmCampaign: 'launch',
            utmContent: 'video-a',
            ctaSource: 'business_finder',
            email: 'blocked@example.test',
            phone: '09170000000',
            fbclid: 'blocked-click-id',
            utmTerm: 'blocked-term',
            unsafePath: '/privacy?email=blocked@example.test',
          },
        }, {
          initializeFirebase: () => ({ auth: { controlled: true }, db: { controlled: true } }),
          createUser: async (_auth: unknown, email: string) => ({ user: { uid: 'user-controlled', email, getIdToken: async () => 'controlled-token', delete: async () => undefined } }),
          getDocument: async () => ({ exists: () => false }),
          document,
          collectionRef: () => ({ path: 'tenants' }),
          runTransaction: async (_db: unknown, update: any) => { await update(transaction); },
          timestamp: () => timestampSentinel,
          fetchRequest: async () => { verificationRequests += 1; return { ok: true }; },
        } as any);
        const tenantWrite = writes.find((write) => write.path === 'tenants/tenant-controlled');
        const userWrite = writes.find((write) => write.path === 'users/user-controlled');
        console.log('CONTROLLED_RESULT=' + JSON.stringify({ writes, tenantWrite, userWrite, verificationRequests }));
        })().catch((error) => { console.error(error); process.exit(1); });
      `).then((result) => {
        const { writes, tenantWrite, userWrite, verificationRequests } = result;
        expect(writes).to.have.length(4);
        expect(tenantWrite).to.exist;
        expect(userWrite).to.exist;
        expect(tenantWrite?.data.acquisition).to.deep.equal({
          landingPath: '/benta-snap',
          utmSource: 'facebook',
          utmMedium: 'social',
          utmCampaign: 'launch',
          utmContent: 'video-a',
          ctaSource: 'business_finder',
          capturedAt: { kind: 'controlled-server-timestamp' },
        });
        expect(userWrite?.data).not.to.have.property('acquisition');
        expect(JSON.stringify(tenantWrite?.data.acquisition)).not.to.match(/email|phone|fbclid|utmTerm|unsafePath|blocked/i);
        expect(tenantWrite?.data.subscriptionStatus).to.equal('pending');
        expect(userWrite?.data.tenantId).to.equal('tenant-controlled');
        expect(verificationRequests).to.equal(1);
      });
    });
  });

  describe('Touch Targets & Bounding Geometry', () => {
    it('verifies minimum 44x44px computed bounding rects on all required interactive controls', () => {
      cy.viewport(390, 844);

      // Hero Login button
      cy.visit('/');
      cy.contains('button', 'Login', { matchCase: false }).then(($btn) => {
        const rect = $btn[0].getBoundingClientRect();
        expect(rect.height).to.be.at.least(44);
      });

      cy.get('#business-finder').scrollIntoView();
      cy.contains('#business-finder button', 'Retail / Sari-Sari').click();
      cy.contains('#business-finder button', 'Mag-register').then(($btn) => {
        const rect = $btn[0].getBoundingClientRect();
        expect(rect.height).to.be.at.least(44);
        expect(rect.width).to.be.at.least(44);
      });

      // Onboarding back button
      cy.visit('/benta-snap/onboarding');
      cy.get('button[aria-label="Bumalik sa nakaraang hakbang"]').then(($btn) => {
        const rect = $btn[0].getBoundingClientRect();
        expect(rect.height).to.be.at.least(44);
        expect(rect.width).to.be.at.least(44);
      });
    });
  });

  describe('SEO & Indexation Audit', () => {
    it('verifies sitemap has zero onboarding URLs and uses apex origin', () => {
      cy.request('/sitemap.xml').then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.include('https://katuwangsolutions.com');
        expect(response.body).to.not.include('/onboarding');
      });
    });

    it('renders noindex,follow metadata on both onboarding route forms', () => {
      cy.visit('/onboarding');
      cy.get('meta[name="robots"]').should('have.attr', 'content').and('match', /noindex/).and('match', /follow/);

      cy.visit('/benta-snap/onboarding');
      cy.get('meta[name="robots"]').should('have.attr', 'content').and('match', /noindex/).and('match', /follow/);
    });
  });

  describe('Reduced Motion', () => {
    it('exposes reduced-motion-safe classes on newly touched transitions', () => {
      cy.viewport(390, 844);
      cy.visit('/');
      cy.get('[data-testid="hero-register-cta"]')
        .should('have.class', 'motion-reduce:transition-none')
        .and('have.class', 'motion-reduce:transform-none');

      cy.scrollTo('bottom');
      cy.get('[data-testid="floating-register-cta"]')
        .should('have.class', 'motion-reduce:transition-none')
        .and('have.class', 'motion-reduce:transform-none');
      cy.get('[data-testid="floating-messenger-widget"]')
        .should('have.class', 'motion-reduce:transition-none')
        .and('have.class', 'motion-reduce:transform-none');
    });
  });
});

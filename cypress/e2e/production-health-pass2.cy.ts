import { activeModules } from '../../src/lib/app-data';

describe('Production Health Pass 2 Behavioral & Accessibility Suite', () => {
  const VIEWPORTS: Array<{ width: number; height: number; name: string }> = [
    { width: 360, height: 800, name: '360x800' },
    { width: 375, height: 812, name: '375x812' },
    { width: 390, height: 844, name: '390x844' },
    { width: 412, height: 915, name: '412x915' },
  ];

  const stubOnboardingState = (appId: string, step: string) => {
    cy.visit(`/${appId}/onboarding`, {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'katuwang_onboarding_draft',
          JSON.stringify({
            step,
            data: {
              appId,
              businessName: appId === 'budget-mo' ? 'Aking Personal Budget' : 'Subok Negosyo',
              fullName: 'Juan dela Cruz',
              email: 'juan@example.com',
            },
          })
        );
      },
    });
  };

  VIEWPORTS.forEach(({ width, height, name }) => {
    describe(`Viewport ${name}`, () => {
      beforeEach(() => {
        cy.viewport(width, height);
      });

      it('has no horizontal page overflow on payment step', () => {
        stubOnboardingState('benta-snap', 'payment');
        cy.contains('Mga Tagubilin sa Pagbabayad').should('be.visible');
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });
      });

      it('has no horizontal page overflow on pending step', () => {
        stubOnboardingState('benta-snap', 'pending');
        cy.contains('Hinihintay ang Payment Verification').should('be.visible');
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });
      });

      it('has no horizontal page overflow on /modules page', () => {
        cy.visit('/modules');
        cy.contains('Lahat ng Modules').should('be.visible');
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });
      });

      it('has no horizontal page overflow on module pages (e.g. benta-snap)', () => {
        cy.visit('/benta-snap');
        cy.contains('Benta Snap').should('be.visible');
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });
      });
    });
  });

  describe('1. Payment & Pending Wording and Dynamic Pricing', () => {
    it('displays truthful payment instructions and dynamic promo pricing for Benta Snap (₱99.00)', () => {
      stubOnboardingState('benta-snap', 'payment');

      cy.contains('h2', 'Mga Tagubilin sa Pagbabayad').should('be.visible');
      cy.contains('Magbayad ng ₱99.00 gamit ang GCash o Maya. Pagkatapos, ipadala ang payment screenshot sa Messenger. Ia-activate ang napiling module matapos ma-verify ang payment.').should('be.visible');
      cy.get('[data-testid="payment-journey-banner"]').should('contain', 'Account created → Magbayad → Iva-verify ang payment → Ia-activate ang module');
      cy.get('[data-testid="payment-amount"]').should('contain', '₱99.00');
      cy.get('[data-testid="payment-clarification"]').should('contain', 'Ang bayad na ₱99 ay para sa napili mong module.');
      cy.get('[data-testid="payment-verification-disclaimer"]').should(
        'contain',
        'Manual ang verification. Ang pagpapadala ng screenshot o pag-click sa button sa ibaba ay hindi pa kumpirmasyon na verified ang payment o active na ang module.'
      );

      cy.contains('a', 'Buksan ang Messenger at Ipadala ang Screenshot').should('be.visible');
      cy.contains('button', 'Naipadala ko na sa Messenger').should('be.visible');
      cy.contains('Paano Magbayad').should('be.visible');
      cy.contains('Buksan ang GCash o Maya → i-tap ang Send Money → i-paste ang numero sa itaas.').should('be.visible');
      cy.contains('Ipasok ang eksaktong halaga: ₱99.00.').should('be.visible');
    });

    it('displays truthful payment instructions and dynamic promo pricing for Budget Mo (₱50.00)', () => {
      stubOnboardingState('budget-mo', 'payment');

      cy.contains('h2', 'Mga Tagubilin sa Pagbabayad').should('be.visible');
      cy.contains('Magbayad ng ₱50.00 gamit ang GCash o Maya. Pagkatapos, ipadala ang payment screenshot sa Messenger. Ia-activate ang napiling module matapos ma-verify ang payment.').should('be.visible');
      cy.get('[data-testid="payment-amount"]').should('contain', '₱50.00');
      cy.get('[data-testid="payment-clarification"]').should('contain', 'Ang bayad na ₱50 ay para sa napili mong module.');
    });

    it('displays clear pending-verification status copy without activation guarantees or promises', () => {
      stubOnboardingState('benta-snap', 'pending');

      cy.contains('h2', 'Hinihintay ang Payment Verification').should('be.visible');
      cy.contains('Naitala na ang registration mo at dinala ka namin sa payment-verification status. Hindi pa ito kumpirmasyon na verified ang payment o active na ang module.').should('be.visible');
      cy.contains('Susuriin ng Operations team ang payment screenshot na ipinadala sa Messenger. Kapag na-verify ang payment, saka ia-activate ang napili mong module.').should('be.visible');
      cy.contains('span', 'PAYMENT VERIFICATION · HAKBANG 3 SA 4').should('be.visible');
      cy.contains('a', 'Buksan ang Messenger at Ipadala ang Screenshot').should('be.visible');
    });

    it('advances from payment step to pending step on secondary action without triggering activation', () => {
      stubOnboardingState('benta-snap', 'payment');

      cy.contains('button', 'Naipadala ko na sa Messenger').click();
      cy.contains('h2', 'Hinihintay ang Payment Verification').should('be.visible');
      cy.contains('span', 'PAYMENT VERIFICATION · HAKBANG 3 SA 4').should('be.visible');
    });
  });

  describe('2. Copy-Number Clipboard Accuracy & Controlled Fallback', () => {
    it('shows Copied! when clipboard writing succeeds', () => {
      stubOnboardingState('benta-snap', 'payment');

      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').resolves();
      });

      cy.get('[data-testid="gcash-number"]').parent().contains('button', 'Copy Number').click();
      cy.get('[data-testid="gcash-number"]').parent().contains('Copied!').should('be.visible');
      cy.get('[data-testid="gcash-copy-error"]').should('not.exist');
    });

    it('shows fallback instructions when clipboard writing fails or is rejected', () => {
      stubOnboardingState('benta-snap', 'payment');

      cy.window().then((win) => {
        cy.stub(win.navigator.clipboard, 'writeText').rejects(new Error('Permission denied'));
      });

      cy.get('[data-testid="gcash-number"]').parent().contains('button', 'Copy Number').click();
      cy.get('[data-testid="gcash-copy-error"]').should(
        'contain',
        'Hindi nakopya. Pindutin nang matagal ang numero para piliin at kopyahin.'
      );
      cy.contains('Copied!').should('not.exist');
      cy.get('[data-testid="gcash-number"]').should('contain', '0995 166 5423');
    });
  });

  describe('3. Minimum Mobile Touch Target Geometry', () => {
    it('ensures Business Finder detail link is at least 44px high', () => {
      cy.visit('/');
      cy.contains('button', 'Retail / Sari-Sari').click();
      cy.contains('a', 'Tingnan ang Detalye').then(($el) => {
        const height = $el[0].getBoundingClientRect().height;
        expect(height).to.be.at.least(44);
      });
    });

    it('ensures App Suite category tabs and detail action links are at least 44px high', () => {
      cy.visit('/');
      cy.contains('button', '✨ Lahat ng Modules (20)').then(($el) => {
        const height = $el[0].getBoundingClientRect().height;
        expect(height).to.be.at.least(44);
      });

      cy.contains('a', 'Tingnan ang Detalye').then(($el) => {
        const height = $el[0].getBoundingClientRect().height;
        expect(height).to.be.at.least(44);
      });
    });

    it('ensures /modules card actions Detalye and Mag-register are at least 44px high', () => {
      cy.visit('/modules');
      cy.get('[data-module-id="benta-snap"]').within(() => {
        cy.contains('a', 'Detalye').then(($el) => {
          const height = $el[0].getBoundingClientRect().height;
          expect(height).to.be.at.least(44);
        });

        cy.contains('a', 'Mag-register').then(($el) => {
          const height = $el[0].getBoundingClientRect().height;
          expect(height).to.be.at.least(44);
        });
      });
    });

    it('ensures payment primary and secondary actions are at least 44px high', () => {
      stubOnboardingState('benta-snap', 'payment');

      cy.contains('a', 'Buksan ang Messenger at Ipadala ang Screenshot').then(($el) => {
        const height = $el[0].getBoundingClientRect().height;
        expect(height, 'Messenger CTA height').to.be.at.least(44);
      });

      cy.contains('button', 'Naipadala ko na sa Messenger').then(($el) => {
        const height = $el[0].getBoundingClientRect().height;
        expect(height, 'Secondary action height').to.be.at.least(44);
      });
    });

    it('verifies hero and final registration CTAs are at least 56px high across all 20 module pages', () => {
      activeModules.forEach((app) => {
        cy.visit(`/${app.id}`);

        // Genuinely verify both hero and final CTAs on every active module page
        cy.get(`a[href="/${app.id}/onboarding"]`).should('have.length', 2).each(($el, index) => {
          expect($el.text()).to.include(`Mag-register para sa ${app.name}`);
          const height = $el[0].getBoundingClientRect().height;
          expect(height, `${app.id} CTA #${index + 1} height`).to.be.at.least(56);
        });

        // Verify destination and hero ctaSource tracking behavior
        cy.get(`a[href="/${app.id}/onboarding"]`).eq(0).click();
        cy.url().should('include', `/${app.id}/onboarding`);
        cy.window().then((win) => {
          expect(win.sessionStorage.getItem('katuwang_cta_source')).to.equal('module_page_hero');
        });

        // Verify final ctaSource tracking behavior
        cy.visit(`/${app.id}`);
        cy.get(`a[href="/${app.id}/onboarding"]`).eq(1).click();
        cy.url().should('include', `/${app.id}/onboarding`);
        cy.window().then((win) => {
          expect(win.sessionStorage.getItem('katuwang_cta_source')).to.equal('module_page_final');
        });
      });
    });
  });

  describe('4. CTA Semantics & Interactive Markup Validity', () => {
    it('ensures no nested interactive elements exist in hero and final CTAs on module pages', () => {
      cy.visit('/benta-snap');

      cy.get('a button').should('have.length', 0);
      cy.get('button a').should('have.length', 0);
      cy.get('a a').should('have.length', 0);
      cy.get('button button').should('have.length', 0);
    });

    it('ensures no nested interactive elements exist in App Suite carousel', () => {
      cy.visit('/');
      cy.get('#products').within(() => {
        cy.get('a button').should('have.length', 0);
        cy.get('button a').should('have.length', 0);
      });
    });

    it('preserves module page hero and final CTA navigation and tracking props', () => {
      cy.visit('/benta-snap');

      cy.contains('a', 'Mag-register para sa Benta Snap')
        .should('have.attr', 'href', '/benta-snap/onboarding')
        .first()
        .click();

      cy.url().should('include', '/benta-snap/onboarding');
      cy.contains('ACCOUNT SETUP').should('be.visible');
    });
  });
});

describe('Sprint 2 Package B — Batch 1: Homepage First-Viewport Conversion Clarity', () => {
  const VIEWPORTS: Array<{ width: number; height: number; name: string }> = [
    { width: 360, height: 800, name: '360x800' },
    { width: 375, height: 812, name: '375x812' },
    { width: 390, height: 844, name: '390x844' },
    { width: 412, height: 915, name: '412x915' },
  ];

  VIEWPORTS.forEach(({ width, height, name }) => {
    describe(`Viewport ${name}`, () => {
      beforeEach(() => {
        cy.viewport(width, height);
        cy.visit('/');
      });

      it('has no horizontal page overflow or clipping in hero first-viewport layout', () => {
        cy.get('#homepage-hero').should('be.visible');

        // Verify zero horizontal scroll overflow
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });

        // Verify eyebrow, headline, supporting copy, pricing card, both CTAs, and scroll hint bounding boxes are fully contained within initial viewport
        cy.contains('Business software para sa Filipino entrepreneurs').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'eyebrow node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'eyebrow top').to.be.at.least(0);
          expect(rect.bottom, 'eyebrow bottom').to.be.at.most(height);
          expect(rect.left, 'eyebrow left').to.be.at.least(0);
          expect(rect.right, 'eyebrow right').to.be.at.most(width);
        });

        cy.contains('h1', 'Mas organisadong negosyo, isang module sa bawat pangangailangan.').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'headline node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'headline top').to.be.at.least(0);
          expect(rect.bottom, 'headline bottom').to.be.at.most(height);
          expect(rect.left, 'headline left').to.be.at.least(0);
          expect(rect.right, 'headline right').to.be.at.most(width);
        });

        cy.contains('Pumili ng praktikal na module para sa benta, inventory, orders, payroll, gastos, at iba pang araw-araw na trabaho.').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'supporting copy node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'supporting copy top').to.be.at.least(0);
          expect(rect.bottom, 'supporting copy bottom').to.be.at.most(height);
          expect(rect.left, 'supporting copy left').to.be.at.least(0);
          expect(rect.right, 'supporting copy right').to.be.at.most(width);
        });

        cy.contains('Business modules').parents('.rounded-2xl').first().should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'pricing card node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'pricing card top').to.be.at.least(0);
          expect(rect.bottom, 'pricing card bottom').to.be.at.most(height);
          expect(rect.left, 'pricing card left').to.be.at.least(0);
          expect(rect.right, 'pricing card right').to.be.at.most(width);
        });

        cy.contains('a', 'Hanapin ang Module Ko').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'primary CTA node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'primary CTA top').to.be.at.least(0);
          expect(rect.bottom, 'primary CTA bottom').to.be.at.most(height);
          expect(rect.left, 'primary CTA left').to.be.at.least(0);
          expect(rect.right, 'primary CTA right').to.be.at.most(width);
        });

        cy.contains('button', 'May napili na? Mag-register').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'secondary CTA node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'secondary CTA top').to.be.at.least(0);
          expect(rect.bottom, 'secondary CTA bottom').to.be.at.most(height);
          expect(rect.left, 'secondary CTA left').to.be.at.least(0);
          expect(rect.right, 'secondary CTA right').to.be.at.most(width);
        });

        cy.contains('Scroll pababa para malaman pa ↓').should('be.visible').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'scroll hint node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.top, 'scroll hint top').to.be.at.least(0);
          expect(rect.bottom, 'scroll hint bottom').to.be.at.most(height);
          expect(rect.left, 'scroll hint left').to.be.at.least(0);
          expect(rect.right, 'scroll hint right').to.be.at.most(width);
        });
      });

      it('verifies touch target dimensions are at least 44px high', () => {
        cy.contains('a', 'Hanapin ang Module Ko').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'primary CTA node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.height, 'Primary CTA height').to.be.at.least(44);
        });

        cy.contains('button', 'May napili na? Mag-register').then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'secondary CTA node').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.height, 'Secondary CTA height').to.be.at.least(44);
        });
      });
    });
  });

  describe('1. Pricing Presentation & Truthfulness', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
      cy.visit('/');
    });

    it('displays distinct Business modules and Budget Mo pricing without starting at wording', () => {
      cy.contains('Promo ₱99/mo bawat module').should('be.visible');
      cy.contains('regular ₱199/mo').should('be.visible');
      cy.contains('Promo ₱50/mo').should('be.visible');
      cy.contains('regular ₱100/mo').should('be.visible');

      // Ensure ambiguous "starting at" wording is not used in hero pricing
      cy.get('#homepage-hero').should('not.contain', 'starting at');
      cy.get('#homepage-hero').should('not.contain', 'nagsisimula sa');
    });
  });

  describe('2. CTA Behavior & Attribution Hierarchy', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
      cy.visit('/');
    });

    it('primary CTA scrolls to #business-finder without opening RegisterSheet or emitting registration intent', () => {
      cy.scrollTo('top');
      cy.get('#homepage-hero').should('be.visible');
      cy.window().then((win) => {
        const initialAcquisition = win.sessionStorage.getItem('katuwang_acquisition_v1');
        const initialCta = initialAcquisition ? JSON.parse(initialAcquisition).ctaSource : undefined;

        cy.contains('a', 'Hanapin ang Module Ko')
          .should('have.attr', 'href', '#business-finder')
          .click();

        // Verify page scrolls to Business Finder section
        cy.get('#business-finder').should('be.visible');

        // RegisterSheet should NOT be open
        cy.get('[role="dialog"]').should('not.exist');

        // Primary CTA click should not record a registration ctaSource
        const currentAcquisition = win.sessionStorage.getItem('katuwang_acquisition_v1');
        const currentCta = currentAcquisition ? JSON.parse(currentAcquisition).ctaSource : undefined;
        expect(currentCta).to.equal(initialCta);
      });
    });

    it('secondary CTA opens RegisterSheet with hero attribution', () => {
      cy.scrollTo('top');
      cy.get('#homepage-hero').should('be.visible');

      cy.get('[data-testid="hero-register-cta"]').should('be.visible').click();

      // RegisterSheet should be open
      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Ano ang role mo?').should('be.visible');

      // Acquisition session storage should record hero ctaSource
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(raw).to.not.be.null;
        const parsed = JSON.parse(raw!);
        expect(parsed.ctaSource).to.equal('hero');
      });
    });
  });

  describe('3. Factual Confidence Section', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
      cy.visit('/');
    });

    it('displays only approved facts and excludes pseudo-statistics', () => {
      cy.contains('20 practical modules').should('be.visible');
      cy.contains('Hiwalay na subscription bawat module').should('be.visible');
      cy.contains('Manual GCash/Maya payment').should('be.visible');
      cy.contains('Activation pagkatapos ng payment verification').should('be.visible');

      // Ensure pseudo-statistics and weak claims are removed
      cy.contains('19 + 1').should('not.exist');
      cy.contains('Easy Onboarding').should('not.exist');
      cy.contains('Made for Filipinos').should('not.exist');
    });
  });

  describe('4. Business Finder Continuity', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
      cy.visit('/');
    });

    it('preserves industry selection, module recommendation, and registration continuity', () => {
      cy.get('#business-finder').scrollIntoView().should('be.visible');
      cy.contains('button', 'Retail / Sari-Sari').should('be.visible').click();

      cy.get('#business-finder').contains('button', 'Mag-register').should('be.visible').click();

      cy.get('[role="dialog"]').should('be.visible');
      cy.contains('Ano ang role mo?').should('be.visible');
      cy.contains('Nagpaparehistro para sa Benta Snap.').should('be.visible');
    });
  });
});

import { activeModules } from '../../src/lib/app-data';

describe('Sprint 2 Package B — Batch 2: Module-Page Decision Clarity', () => {
  const VIEWPORTS: Array<{ width: number; height: number; name: string }> = [
    { width: 360, height: 800, name: '360x800' },
    { width: 375, height: 812, name: '375x812' },
    { width: 390, height: 844, name: '390x844' },
    { width: 412, height: 915, name: '412x915' },
  ];

  describe('1. Comprehensive 20-Module Decision Content, Counts & Integrity', () => {
    activeModules.forEach((mod) => {
      it(`renders decision-support sections, exact item counts, and CTAs for ${mod.name} (/${mod.id})`, () => {
        cy.viewport(390, 844);
        cy.visit(`/${mod.id}`);

        // 1. Target audience section
        if (mod.targetUsers && mod.targetUsers.length > 0) {
          cy.get('#target-audience').should('be.visible');
          cy.get('#target-audience').contains(`Bagay ang ${mod.name} para sa:`).should('be.visible');
          cy.get('#target-audience li').should('have.length', mod.targetUsers.length);
          mod.targetUsers.forEach((user) => {
            cy.get('#target-audience').contains(user).should('be.visible');
          });
        }

        // 2. Problem/Benefit & Features section
        cy.get('#features').should('be.visible');
        cy.get('#features').contains('Anong tinutulungan nitong ayusin?').should('be.visible');
        cy.get('#features').contains('Mga pangunahing trabahong matutulungan nitong ayusin:').should('be.visible');
        cy.get('#features').contains(mod.description).should('be.visible');
        cy.get('#features').contains('Ano ang magagawa nito:').should('be.visible');
        cy.get('#features li').should('have.length', mod.features.length);
        mod.features.forEach((feature) => {
          cy.get('#features').contains(feature).should('be.visible');
        });

        // 3. Truthful 3-Step Start Process section & Rendered Operational Clarifications
        cy.get('#how-to-start').should('be.visible');
        cy.get('#how-to-start').contains('Gumawa ng account').should('be.visible');
        cy.get('#how-to-start').contains('Sundin ang GCash/Maya payment instructions').should('be.visible');
        cy.get('#how-to-start').contains('Hintayin ang payment verification at account activation').should('be.visible');

        // Behavioral rendered assertions for operational truthfulness
        cy.get('#how-to-start').contains('Ang pag-register at pagpapadala ng screenshot ay hindi nangangahulugang verified na agad o activated na ang account').should('be.visible');
        cy.get('#how-to-start').contains('manual na iberipika ng Operations team ang payment bago ang activation').should('be.visible');
        cy.get('#how-to-start').contains('Walang free trial o instant automated activation').should('be.visible');

        // Prohibited claims check
        cy.get('#how-to-start').should('not.contain', 'instant activation');
        cy.get('#how-to-start').should('not.contain', 'automatic payment');
        cy.get('#how-to-start').should('not.contain', 'libreng subok');

        // 4. Hero and Final CTAs existence, destinations, and heights
        cy.get(`a[href="/${mod.id}/onboarding"]`)
          .should('have.length', 2)
          .each(($el, index) => {
            expect($el.text()).to.include(`Mag-register para sa ${mod.name}`);
            const height = $el[0].getBoundingClientRect().height;
            expect(height, `${mod.id} CTA #${index + 1} height`).to.be.at.least(44);
          });
      });
    });
  });

  describe('2. In-Depth Case Verifications: Benta Snap, Budget Mo, Tsek-In', () => {
    it('verifies deep content, pricing, and exact feature isolation for Benta Snap', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap');

      // Pricing check
      cy.contains('Promo ₱99/buwan bawat module').should('be.visible');
      cy.contains('regular ₱199/buwan').should('be.visible');

      // Specific target users count & items
      cy.get('#target-audience li').should('have.length', 4);
      cy.get('#target-audience').contains('Sari-sari Stores').should('be.visible');
      cy.get('#target-audience').contains('Retail Shops').should('be.visible');
      cy.get('#target-audience').contains('Pharmacies').should('be.visible');
      cy.get('#target-audience').contains('Mini Marts').should('be.visible');

      // Specific features count & items
      cy.get('#features li').should('have.length', 3);
      cy.get('#features').contains('Sales Recording').should('be.visible');
      cy.get('#features').contains('Inventory Monitoring').should('be.visible');
      cy.get('#features').contains('Customer Credit Tracking').should('be.visible');

      // Leakage check: features of other apps should NOT appear in Benta Snap features
      cy.get('#features').should('not.contain', 'Room Status');
      cy.get('#features').should('not.contain', 'Fuel and Tolls');
      cy.get('#features').should('not.contain', 'Table Management');
    });

    it('verifies deep content, pricing, and exact feature isolation for Budget Mo', () => {
      cy.viewport(390, 844);
      cy.visit('/budget-mo');

      // Pricing check (Promo ₱50 / reg ₱100)
      cy.contains('Promo ₱50/buwan').should('be.visible');
      cy.contains('regular ₱100/buwan').should('be.visible');

      // Specific target users count & items
      cy.get('#target-audience li').should('have.length', 4);
      cy.get('#target-audience').contains('Individuals').should('be.visible');
      cy.get('#target-audience').contains('Employees').should('be.visible');
      cy.get('#target-audience').contains('Students').should('be.visible');
      cy.get('#target-audience').contains('Freelancers').should('be.visible');

      // Specific features count & items
      cy.get('#features li').should('have.length', 4);
      cy.get('#features').contains('Budgets').should('be.visible');
      cy.get('#features').contains('Transactions').should('be.visible');
      cy.get('#features').contains('Debts').should('be.visible');
      cy.get('#features').contains('Savings').should('be.visible');

      // Leakage check
      cy.get('#features').should('not.contain', 'Table Management');
      cy.get('#features').should('not.contain', 'Kitchen Queue');
      cy.get('#features').should('not.contain', 'Sales Recording');
    });

    it('verifies deep content, pricing, and exact feature isolation for Tsek-In', () => {
      cy.viewport(390, 844);
      cy.visit('/tsek-in');

      // Pricing check
      cy.contains('Promo ₱99/buwan bawat module').should('be.visible');
      cy.contains('regular ₱199/buwan').should('be.visible');

      // Specific target users count & items
      cy.get('#target-audience li').should('have.length', 5);
      cy.get('#target-audience').contains('Resorts').should('be.visible');
      cy.get('#target-audience').contains('Boarding Houses').should('be.visible');
      cy.get('#target-audience').contains('Apartelles').should('be.visible');
      cy.get('#target-audience').contains('Motels').should('be.visible');
      cy.get('#target-audience').contains('Transient Houses').should('be.visible');

      // Specific features count & items
      cy.get('#features li').should('have.length', 3);
      cy.get('#features').contains('Room Status').should('be.visible');
      cy.get('#features').contains('Guest Stays').should('be.visible');
      cy.get('#features').contains('Checkout Billing').should('be.visible');

      // Leakage check
      cy.get('#features').should('not.contain', 'Sales Recording');
      cy.get('#features').should('not.contain', 'Inventory Monitoring');
      cy.get('#features').should('not.contain', 'Budgets');
    });
  });

  describe('3. Content Hierarchy & Visual Section Ordering', () => {
    it('verifies that sections appear in the required sequence before FAQ', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap');

      // Document flow position checks
      cy.get('#target-audience').then(($aud) => {
        cy.get('#features').then(($feat) => {
          cy.get('#how-to-start').then(($how) => {
            cy.contains('h2', 'Mga Madalas Itanong ng Negosyante').then(($faq) => {
              const audTop = $aud[0].getBoundingClientRect().top + window.scrollY;
              const featTop = $feat[0].getBoundingClientRect().top + window.scrollY;
              const howTop = $how[0].getBoundingClientRect().top + window.scrollY;
              const faqTop = $faq[0].getBoundingClientRect().top + window.scrollY;

              expect(audTop, 'target audience is before features').to.be.lessThan(featTop);
              expect(featTop, 'features is before how to start').to.be.lessThan(howTop);
              expect(howTop, 'how to start is before FAQ').to.be.lessThan(faqTop);
            });
          });
        });
      });
    });
  });

  describe('4. CTA Attribution & Registration Continuity', () => {
    it('maintains hero CTA attribution and onboarding transition for benta-snap', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap');

      // Primary hero CTA click
      cy.get('a[href="/benta-snap/onboarding"]').eq(0).click();
      cy.url().should('include', '/benta-snap/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(raw).to.not.be.null;
        const parsed = JSON.parse(raw!);
        expect(parsed.ctaSource).to.equal('module_page_hero');
      });
    });

    it('maintains final CTA attribution and onboarding transition for benta-snap', () => {
      cy.viewport(390, 844);
      cy.visit('/benta-snap');

      // Final CTA click
      cy.get('a[href="/benta-snap/onboarding"]').eq(1).scrollIntoView().click();
      cy.url().should('include', '/benta-snap/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(raw).to.not.be.null;
        const parsed = JSON.parse(raw!);
        expect(parsed.ctaSource).to.equal('module_page_final');
      });
    });

    it('maintains hero and final CTA attribution for budget-mo and tsek-in', () => {
      // Budget Mo Hero
      cy.visit('/budget-mo');
      cy.get('a[href="/budget-mo/onboarding"]').eq(0).click();
      cy.url().should('include', '/budget-mo/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(JSON.parse(raw!).ctaSource).to.equal('module_page_hero');
      });

      // Budget Mo Final
      cy.visit('/budget-mo');
      cy.get('a[href="/budget-mo/onboarding"]').eq(1).scrollIntoView().click();
      cy.url().should('include', '/budget-mo/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(JSON.parse(raw!).ctaSource).to.equal('module_page_final');
      });

      // Tsek-In Hero
      cy.visit('/tsek-in');
      cy.get('a[href="/tsek-in/onboarding"]').eq(0).click();
      cy.url().should('include', '/tsek-in/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(JSON.parse(raw!).ctaSource).to.equal('module_page_hero');
      });

      // Tsek-In Final
      cy.visit('/tsek-in');
      cy.get('a[href="/tsek-in/onboarding"]').eq(1).scrollIntoView().click();
      cy.url().should('include', '/tsek-in/onboarding');
      cy.window().then((win) => {
        const raw = win.sessionStorage.getItem('katuwang_acquisition_v1');
        expect(JSON.parse(raw!).ctaSource).to.equal('module_page_final');
      });
    });

    it('ensures no nested interactive elements exist in CTA markup', () => {
      cy.visit('/benta-snap');
      cy.get('a button').should('have.length', 0);
      cy.get('button a').should('have.length', 0);
      cy.get('a a').should('have.length', 0);
      cy.get('button button').should('have.length', 0);
    });
  });

  describe('5. Mobile Viewport Layout & Touch Accessibility', () => {
    VIEWPORTS.forEach(({ width, height, name }) => {
      it(`verifies no horizontal overflow and 44px min height for CTAs on ${name}`, () => {
        cy.viewport(width, height);
        cy.visit('/benta-snap');

        // Zero horizontal scroll width overflow
        cy.window().then((win) => {
          expect(win.document.documentElement.scrollWidth).to.be.at.most(width);
        });

        // Registration CTAs touch target sizing check (at least 44px high)
        cy.get('a[href="/benta-snap/onboarding"]').eq(0).then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'hero CTA').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.height).to.be.at.least(44);
        });

        cy.get('a[href="/benta-snap/onboarding"]').eq(1).then(($el: any) => {
          const node = $el?.[0];
          expect(node, 'final CTA').to.exist;
          const rect = node.getBoundingClientRect();
          expect(rect.height).to.be.at.least(44);
        });
      });
    });
  });
});

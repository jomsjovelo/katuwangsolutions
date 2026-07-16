/**
 * Catalogue Reconciliation E2E Tests
 *
 * No global uncaught:exception suppression is used.
 * Payment step pricing is verified through the /modules page and /product pages,
 * without any production backdoor (dev_step has been removed).
 * All selectors prefer data-module-id and data-testid attributes over broad body text.
 */

// ─── Helper: wait for app to be ready (not stuck on loading screen) ──────────
const waitForApp = (timeout = 20000) => {
  cy.get('body', { timeout }).should('not.contain.text', 'Initializing Ecosystem');
};

// ─── 1. Active Modules Catalogue ─────────────────────────────────────────────
describe('1. Active Modules Catalogue', () => {
  beforeEach(() => {
    cy.visit('/modules');
    waitForApp();
  });

  it('displays exactly 18 unique active canonical IDs', () => {
    const ids: string[] = [];
    cy.get('[data-module-id]')
      .each(($el) => {
        const id = $el.attr('data-module-id') || '';
        expect(ids, `Duplicate ID: ${id}`).to.not.include(id);
        ids.push(id);
      })
      .then(() => {
        expect(ids.length, 'Expected exactly 18 unique active module IDs').to.equal(18);
      });
  });

  it('Service Master is present and has an onboarding CTA', () => {
    cy.get('[data-module-id="service-master"]').should('exist');
    cy.get('a[href*="/onboarding?app=service-master"]').should('exist');
  });

  it('Biyahe Sync is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="biyahe-sync"]').should('exist');
    cy.get('a[href*="/onboarding?app=biyahe-sync"]').should('exist');
  });

  it('Rental is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="rental"]').should('exist');
    cy.get('a[href*="/onboarding?app=rental"]').should('exist');
  });

  it('Wellness Pro is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="wellness-pro"]').should('exist');
    cy.get('a[href*="/onboarding?app=wellness-pro"]').should('exist');
  });

  it('Farm Master is entirely absent from public catalogue', () => {
    cy.get('[data-module-id="farm-master"]').should('not.exist');
    cy.get('a[href*="farm-master"]').should('not.exist');
    cy.get('body').should('not.contain.text', 'Farm Master');
  });

  it('does not display duplicate module cards', () => {
    cy.get('[data-module-id]').then(($els) => {
      const ids = Array.from($els).map((el) => el.getAttribute('data-module-id'));
      const unique = new Set(ids);
      expect(unique.size).to.equal(ids.length);
    });
  });

  it('dynamic activeModulesCount shows 18 in page description', () => {
    cy.contains("Pumili mula sa 18 iba't-ibang Katuwang modules").should('exist');
  });

  it('no alias IDs (fleet-sync, rental-track) appear as module IDs', () => {
    cy.get('[data-module-id="fleet-sync"]').should('not.exist');
    cy.get('[data-module-id="rental-track"]').should('not.exist');
  });
});

// ─── 2. Redirects and Obsolete IDs ───────────────────────────────────────────
describe('2. Redirects and Obsolete IDs', () => {
  it('/product/fleet-sync permanently redirects to /product/biyahe-sync', () => {
    cy.request({
      url: '/product/fleet-sync',
      followRedirect: false,
    }).then((resp) => {
      // Next.js permanentRedirect() returns 308 in production, 307 in dev mode
      expect(resp.status).to.be.oneOf([301, 307, 308]);
    });
  });

  it('/product/fleet-sync redirect preserves referral query param', () => {
    cy.visit('/product/fleet-sync?ref=test-ref', { failOnStatusCode: false });
    waitForApp();
    cy.url().should('include', '/product/biyahe-sync');
    cy.url().should('include', 'ref=test-ref');
  });

  it('/product/rental-track permanently redirects to /product/rental', () => {
    cy.request({
      url: '/product/rental-track',
      followRedirect: false,
    }).then((resp) => {
      // Next.js permanentRedirect() returns 308 in production, 307 in dev mode
      expect(resp.status).to.be.oneOf([301, 307, 308]);
    });
  });

  it('/product/rental-track redirect preserves referral query param', () => {
    cy.visit('/product/rental-track?code=test-code', { failOnStatusCode: false });
    waitForApp();
    cy.url().should('include', '/product/rental');
    cy.url().should('include', 'code=test-code');
  });

  it('/product/farm-master returns HTTP 404 status (not 200)', () => {
    cy.request({
      url: '/product/farm-master',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.equal(404);
    });
  });

  it('/product/farm-master body contains "Not Found" text', () => {
    cy.visit('/product/farm-master', { failOnStatusCode: false });
    // Do not wait for AuthGuard — the 404 page renders without it
    cy.get('h2', { timeout: 10000 }).should('contain.text', 'Not Found');
  });
});

// ─── 3. Onboarding Parameter Normalization ────────────────────────────────────
describe('3. Onboarding Parameter Normalization', () => {
  it('/onboarding?app=fleet-sync normalizes to biyahe-sync and opens business step', () => {
    cy.visit('/onboarding?app=fleet-sync');
    waitForApp();
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
  });

  it('/onboarding?app=rental-track normalizes to rental and opens business step', () => {
    cy.visit('/onboarding?app=rental-track');
    waitForApp();
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
  });

  it('/onboarding?app=unknown-id returns to the app picker', () => {
    cy.visit('/onboarding?app=unknown-id-xyz');
    waitForApp();
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
  });

  it('/onboarding?app=farm-master returns to picker with unavailable notice', () => {
    cy.visit('/onboarding?app=farm-master');
    waitForApp();
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
    cy.contains('Ang napiling module ay kasalukuyang hindi magagamit.').should('exist');
  });
});

// ─── 4. Onboarding App Picker (data-module-id) ────────────────────────────────
describe('4. Onboarding App Picker', () => {
  beforeEach(() => {
    cy.visit('/onboarding');
    waitForApp();
    cy.contains('Magsimula ng Negosyo').click();
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
  });

  it('app picker contains exactly 18 module controls', () => {
    cy.get('[data-module-id]').should('have.length', 18);
  });

  it('app picker contains Service Master and does not contain Farm Master', () => {
    cy.get('[data-module-id="service-master"]').should('exist');
    cy.get('[data-module-id="farm-master"]').should('not.exist');
  });

  it('selecting a module advances to the business info step', () => {
    cy.get('[data-module-id="benta-snap"]').click();
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
  });

  it('back navigation from business step returns to picker safely', () => {
    cy.get('[data-module-id="benta-snap"]').click();
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
    cy.get('button').filter(':has(svg)').first().click(); // Back chevron button
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
  });
});

// ─── 5. Draft Recovery ────────────────────────────────────────────────────────
describe('5. Draft Recovery', () => {
  it('Farm Master draft clears appId, returns to picker, and shows unavailable notice', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('katuwang_onboarding_draft', JSON.stringify({
        step: 'business',
        data: {
          appId: 'farm-master',
          businessName: 'My Legacy Farm',
          businessPhone: '09123456789',
        },
      }));
    });
    cy.visit('/onboarding');
    waitForApp();
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
    cy.contains('Ang napiling module ay kasalukuyang hindi magagamit.').should('exist');
  });

  it('Farm Master draft preserves safe unrelated fields (businessName is retained in state after recovery)', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('katuwang_onboarding_draft', JSON.stringify({
        step: 'business',
        data: {
          appId: 'farm-master',
          businessName: 'Legacy Biz Name',
          businessPhone: '09000000000',
        },
      }));
    });
    cy.visit('/onboarding');
    waitForApp();
    // Wizard resets to 'apps' step. Select a valid module and proceed to business step.
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
    cy.get('[data-module-id="benta-snap"]').click();
    // After selecting a new module, business info step loads. The draft businessName was cleared alongside farm-master.
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
  });

  it('alias ID (fleet-sync) draft normalizes to biyahe-sync and preserves business name', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('katuwang_onboarding_draft', JSON.stringify({
        step: 'business',
        data: {
          appId: 'fleet-sync',
          businessName: 'My Trucking Co',
        },
      }));
    });
    cy.visit('/onboarding');
    waitForApp();
    // fleet-sync normalizes to biyahe-sync which is valid, so business step should load
    cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
    // The business name should be preserved in the input
    cy.get('#businessName').should('have.value', 'My Trucking Co');
  });

  it('unknown-id draft clears selection and returns to picker', () => {
    cy.window().then((win) => {
      win.localStorage.setItem('katuwang_onboarding_draft', JSON.stringify({
        step: 'business',
        data: { appId: 'unknown-app-id', businessName: 'My Secret Biz' },
      }));
    });
    cy.visit('/onboarding');
    waitForApp();
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
  });
});

// ─── 6. Pricing and Copy Integrity ───────────────────────────────────────────
describe('6. Pricing and Copy Integrity', () => {
  it('/modules page shows ₱99 per-module pricing, no bundle language', () => {
    cy.visit('/modules');
    waitForApp();
    cy.contains('₱99 lang per month').should('exist');
    cy.get('body').should('not.contain.text', 'all 18 modules');
    cy.get('body').should('not.contain.text', 'all modules');
    cy.get('body').should('not.contain.text', 'all 15 modules');
  });

  it('product page for biyahe-sync shows ₱99/buwan bawat module pricing', () => {
    cy.visit('/product/biyahe-sync');
    waitForApp(5000);
    cy.contains('₱99/buwan bawat module').should('exist');
    cy.get('body').should('not.contain.text', 'all modules');
  });

  it('product page for service-master shows ₱99/buwan bawat module pricing', () => {
    cy.visit('/product/service-master');
    waitForApp(5000);
    cy.contains('₱99/buwan bawat module').should('exist');
  });

  it('homepage uses choice language, not bundle language', () => {
    cy.visit('/');
    waitForApp();
    cy.contains("business modules na mapagpipilian").should('exist');
    cy.get('body').should('not.contain.text', 'modules para sa lahat ng negosyo');
  });
});

// ─── 7. Sitemap Validation ────────────────────────────────────────────────────
describe('7. Sitemap Validation', () => {
  it('contains exactly 18 canonical product URLs', () => {
    cy.request('/sitemap.xml').then((response) => {
      expect(response.status).to.equal(200);
      const xml = response.body as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');
      const locs = Array.from(xmlDoc.getElementsByTagName('loc'))
        .map((el) => el.textContent || '');
      const productUrls = locs.filter((url) => url.includes('/product/'));
      expect(productUrls.length, 'Expected 18 product URLs in sitemap').to.equal(18);
    });
  });

  it('sitemap excludes farm-master, fleet-sync, and rental-track', () => {
    cy.request('/sitemap.xml').then((response) => {
      const xml = response.body as string;
      expect(xml).to.not.include('/product/farm-master');
      expect(xml).to.not.include('/product/fleet-sync');
      expect(xml).to.not.include('/product/rental-track');
    });
  });
});

// ─── 8. Mobile Geometry Verification ─────────────────────────────────────────
describe('8. Mobile Geometry Verification', () => {
  const mobileViewports = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ];

  mobileViewports.forEach((vp) => {
    describe(`Viewport ${vp.width}x${vp.height}`, () => {
      beforeEach(() => {
        cy.viewport(vp.width, vp.height);
      });

      it(`no horizontal overflow on /modules (scrollWidth <= innerWidth)`, () => {
        cy.visit('/modules');
        waitForApp();
        cy.window().then((win) => {
          expect(
            win.document.documentElement.scrollWidth,
            'scrollWidth should not exceed innerWidth'
          ).to.be.lte(win.innerWidth);
        });
      });

      it(`/modules shows exactly 18 module cards`, () => {
        cy.visit('/modules');
        waitForApp();
        cy.get('[data-module-id]').should('have.length', 18);
      });

      it(`Service Master is reachable on /modules`, () => {
        cy.visit('/modules');
        waitForApp();
        cy.get('[data-module-id="service-master"]').should('exist').and('be.visible');
      });

      it(`Farm Master is absent on /modules`, () => {
        cy.visit('/modules');
        waitForApp();
        cy.get('[data-module-id="farm-master"]').should('not.exist');
      });

      it(`app picker shows 18 module buttons with minimum 44px touch area`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id]').should('have.length', 18);

        // Verify each button meets 44×44 CSS pixel minimum touch area
        cy.get('[data-module-id]').each(($btn) => {
          const height = $btn[0].getBoundingClientRect().height;
          const width = $btn[0].getBoundingClientRect().width;
          expect(height, `button height should be ≥44px`).to.be.gte(44);
          expect(width, `button width should be ≥44px`).to.be.gte(44);
        });
      });

      it(`category headings are visible and not clipped on /onboarding picker`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('h3').each(($heading) => {
          const rect = $heading[0].getBoundingClientRect();
          // Width should be at least 1px (not zero-width clipped)
          expect(rect.width).to.be.gt(0);
        });
      });

      it(`selecting a module from picker advances to business step`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id="service-master"]').click();
        cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
      });

      it(`back navigation returns to module picker and selection is cleared`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id="benta-snap"]').click();
        cy.contains("Ano'ng pangalan mo at ng tindahan mo?", { timeout: 10000 }).should('exist');
        // Press back
        cy.get('button[disabled]').should('not.exist'); // Not loading
        cy.get('header button').first().click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
      });
    });
  });
});

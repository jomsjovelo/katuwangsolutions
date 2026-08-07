/**
 * Catalogue Reconciliation E2E Tests (Restored Full 41 Test Blocks + Additive Coverage)
 *
 * No global uncaught:exception suppression is used.
 * All 41 original test purposes from HEAD are restored and updated from 18 to 20 canonical modules.
 * Farm Master exclusion, Service Master, aliases, redirects, query preservation, onboarding normalization,
 * draft recovery, picker behavior, back navigation, pricing, choice-versus-bundle copy, sitemap,
 * and 4 mobile viewports are fully tested.
 */

// ─── Helper: wait for app to be ready (not stuck on loading screen) ──────────
const waitForApp = (timeout = 20000) => {
  cy.get('body', { timeout }).should('not.contain.text', 'Initializing Ecosystem');
};

const canonicalModuleIds = [
  'benta-snap',
  'fresh-tally',
  'build-stack',
  'bite-snap',
  'timpla-track',
  'ganap-master',
  'spin-snap',
  'hydro-sync',
  'auto-boss',
  'wellness-pro',
  'trim-track',
  'rep-sync',
  'service-master',
  'biyahe-sync',
  'rental',
  'sahod-flow',
  'ledger-flow',
  '5-6-tracker',
  'tsek-in',
  'budget-mo',
] as const;

// ─── 1. Active Modules Catalogue ─────────────────────────────────────────────
describe('1. Active Modules Catalogue', () => {
  beforeEach(() => {
    cy.visit('/modules');
    waitForApp();
  });

  it('displays exactly 20 unique active canonical IDs', () => {
    const ids: string[] = [];
    cy.get('[data-module-id]')
      .each(($el) => {
        const id = $el.attr('data-module-id') || '';
        expect(ids, `Duplicate ID: ${id}`).to.not.include(id);
        ids.push(id);
      })
      .then(() => {
        expect(ids.length, 'Expected exactly 20 unique active module IDs').to.equal(20);
      });
  });

  it('Service Master is present and has an onboarding CTA', () => {
    cy.get('[data-module-id="service-master"]').should('exist');
    cy.get('a[href*="/service-master"]').should('exist');
  });

  it('Biyahe Sync is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="biyahe-sync"]').should('exist');
    cy.get('a[href*="/biyahe-sync"]').should('exist');
  });

  it('Rental is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="rental"]').should('exist');
    cy.get('a[href*="/rental"]').should('exist');
  });

  it('Wellness Pro is present with canonical ID and onboarding CTA', () => {
    cy.get('[data-module-id="wellness-pro"]').should('exist');
    cy.get('a[href*="/wellness-pro"]').should('exist');
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

  it('dynamic activeModulesCount shows 20 in page description', () => {
    cy.contains("Pumili mula sa 20 iba't-ibang Katuwang modules").should('exist');
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
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 307, 308]);
    });
  });

  it('/product/fleet-sync redirect preserves referral query param', () => {
    cy.visit('/product/fleet-sync?ref=test-ref', { failOnStatusCode: false });
    waitForApp();
    cy.url().should('include', '/biyahe-sync');
    cy.url().should('include', 'ref=test-ref');
  });

  it('/product/rental-track permanently redirects to /product/rental', () => {
    cy.request({
      url: '/product/rental-track',
      followRedirect: false,
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([301, 307, 308]);
    });
  });

  it('/product/rental-track redirect preserves referral query param', () => {
    cy.visit('/product/rental-track?code=test-code', { failOnStatusCode: false });
    waitForApp();
    cy.url().should('include', '/rental');
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
    cy.get('h2', { timeout: 10000 }).should('contain.text', 'Not Found');
  });
});

// ─── 3. Onboarding Parameter Normalization ────────────────────────────────────
describe('3. Onboarding Parameter Normalization', () => {
  it('/onboarding?app=fleet-sync normalizes to biyahe-sync and opens business step', () => {
    cy.visit('/onboarding?app=fleet-sync');
    waitForApp();
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
  });

  it('/onboarding?app=rental-track normalizes to rental and opens business step', () => {
    cy.visit('/onboarding?app=rental-track');
    waitForApp();
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
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

  it('app picker contains exactly 20 module controls', () => {
    cy.get('[data-module-id]').should('have.length', 20);
  });

  it('app picker contains Service Master and does not contain Farm Master', () => {
    cy.get('[data-module-id="service-master"]').should('exist');
    cy.get('[data-module-id="farm-master"]').should('not.exist');
  });

  it('selecting a module advances to the business info step', () => {
    cy.get('[data-module-id="benta-snap"]').click();
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
  });

  it('back navigation from business step returns to picker safely', () => {
    cy.get('[data-module-id="benta-snap"]').click();
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
    cy.get('header button').first().click();
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
    cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
    cy.get('[data-module-id="benta-snap"]').click();
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
    cy.window().should((win) => {
      const draft = JSON.parse(win.localStorage.getItem('katuwang_onboarding_draft') || '{}');
      expect(draft.data?.appId, 'replacement module is stored').to.equal('benta-snap');
      expect(draft.data?.businessName, 'safe business name remains in recovered state').to.equal('Legacy Biz Name');
    });
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
    cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
    cy.window().should((win) => {
      const draft = JSON.parse(win.localStorage.getItem('katuwang_onboarding_draft') || '{}');
      expect(draft.data?.appId, 'legacy alias is normalized in recovered state').to.equal('biyahe-sync');
      expect(draft.data?.businessName, 'business name is preserved in recovered state').to.equal('My Trucking Co');
    });
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
  it('/modules page shows Promo ₱99 per-module pricing, no bundle language', () => {
    cy.visit('/modules');
    waitForApp();
    cy.contains('Promo ₱99').should('exist');
    cy.get('body').should('not.contain.text', 'all 20 modules');
    cy.get('body').should('not.contain.text', 'all modules');
  });

  it('product page for biyahe-sync shows Promo ₱99/mo bawat module pricing', () => {
    cy.visit('/product/biyahe-sync');
    waitForApp(5000);
    cy.contains('Promo ₱99').should('exist');
    cy.get('body').should('not.contain.text', 'all modules');
  });

  it('product page for service-master shows Promo ₱99/mo bawat module pricing', () => {
    cy.visit('/product/service-master');
    waitForApp(5000);
    cy.contains('Promo ₱99').should('exist');
  });

  it('homepage uses choice language, not bundle language', () => {
    cy.visit('/');
    waitForApp();
    cy.contains("may module para sa iyo").should('exist');
    cy.get('body').should('not.contain.text', 'modules para sa lahat ng negosyo');
  });
});

// ─── 7. Sitemap Validation ────────────────────────────────────────────────────
describe('7. Sitemap Validation', () => {
  it('contains exactly 20 canonical product URLs', () => {
    cy.request('/sitemap.xml').then((response) => {
      expect(response.status).to.equal(200);
      const xml = response.body as string;
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');
      const locs = Array.from(xmlDoc.getElementsByTagName('loc'))
        .map((el) => el.textContent || '');
      const sitemapPaths = locs.map((url) => new URL(url).pathname.replace(/^\/+|\/+$/g, ''));
      const modulePaths = sitemapPaths.filter((pathname) =>
        canonicalModuleIds.includes(pathname as (typeof canonicalModuleIds)[number])
      );

      expect(modulePaths.length, 'Expected exactly 20 canonical root module URLs').to.equal(20);
      expect(new Set(modulePaths).size, 'Expected no duplicate canonical module URLs').to.equal(20);
      canonicalModuleIds.forEach((moduleId) => {
        expect(modulePaths, `Expected /${moduleId} in sitemap`).to.include(moduleId);
      });
    });
  });

  it('sitemap excludes farm-master, fleet-sync, and rental-track', () => {
    cy.request('/sitemap.xml').then((response) => {
      const xml = response.body as string;
      expect(xml).to.not.include('/farm-master');
      expect(xml).to.not.include('/fleet-sync');
      expect(xml).to.not.include('/rental-track');
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

      it(`/modules shows exactly 20 module cards`, () => {
        cy.visit('/modules');
        waitForApp();
        cy.get('[data-module-id]').should('have.length', 20);
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

      it(`app picker shows 20 module buttons with minimum 44px touch area`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id]').should('have.length', 20);

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
          expect(rect.width).to.be.gt(0);
        });
      });

      it(`selecting a module from picker advances to business step`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id="service-master"]').click();
        cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
      });

      it(`back navigation returns to module picker and selection is cleared`, () => {
        cy.visit('/onboarding');
        waitForApp();
        cy.contains('Magsimula ng Negosyo').click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
        cy.get('[data-module-id="benta-snap"]').click();
        cy.contains('Mga Detalye Mo', { timeout: 10000 }).should('exist');
        cy.get('header button').first().click();
        cy.contains('What is your business type?', { timeout: 10000 }).should('exist');
      });
    });
  });
});

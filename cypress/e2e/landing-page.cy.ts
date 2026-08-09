describe('Landing Page E2E Tests', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the hero section, tagline, and CTA button', () => {
    cy.get('body').should('contain', 'Katuwang mo sa Negosyo');
    cy.get('button').contains('Mag-register').should('be.visible');
  });

  it('displays active modules in the app suite carousel', () => {
    cy.get('body').should('contain', 'Benta Snap');
    cy.get('body').should('contain', 'Budget Mo');
  });

  it('renders features section without prohibited claims', () => {
    cy.get('body').should('contain', 'Bakit Katuwang Solutions?');
    cy.get('body').should('not.contain.text', 'Industrial-Grade Offline');
    cy.get('body').should('not.contain.text', '1-Minute Setup');
    cy.get('body').should('not.contain.text', 'Mabilis na Flow');
    cy.get('body').should('not.contain.text', 'Hindi mo kailangan ng IT background');
    cy.get('body').should('not.contain.text', 'Direct Referral Program');
  });

  it('renders complete promotional pricing disclosures', () => {
    cy.get('body').should('contain', '₱99');
    cy.get('body').should('contain', 'bawat module');
    cy.get('body').should('contain', 'regular');
  });

  it('renders exactly one normalized apex canonical without query or fragment', () => {
    cy.get('head link[rel="canonical"]').should('have.length', 1).then(($canonical) => {
      const href = $canonical.attr('href');
      expect(href, 'canonical href').to.be.a('string').and.not.be.empty;

      const canonical = new URL(href!);
      expect(canonical.protocol).to.equal('https:');
      expect(canonical.hostname).to.equal('katuwangsolutions.com');
      expect(canonical.hostname).to.not.match(/^www\./);
      expect(canonical.pathname).to.equal('/');
      expect(canonical.search).to.equal('');
      expect(canonical.hash).to.equal('');
    });
  });

  it('renders neutral About facts without unsupported origin or founding claims', () => {
    cy.visit('/about');
    cy.contains('Built for Filipino entrepreneurs.').should('be.visible');
    cy.contains('20').should('exist');
    cy.contains('Business Modules').should('exist');
    cy.contains('Budget Mo').should('exist');
    cy.contains('Hiwalay na Subscription').should('exist');
    cy.get('body').should('not.contain.text', '2024');
    cy.get('body').should('not.contain.text', 'Founded');
    cy.get('body').should('not.contain.text', 'Made in PH');
    cy.get('body').should('not.contain.text', '100% Pinoy Made');
  });

  [
    { id: 'benta-snap', name: 'Benta Snap', description: 'Record sales, monitor inventory, and track customer credit.' },
    { id: 'budget-mo', name: 'Budget Mo', description: 'Track budgets, transactions, debts, and savings for personal or small-business planning.' },
  ].forEach(({ id, name, description }) => {
    it(`renders governed copy and activation disclosure for ${name}`, () => {
      cy.visit(`/${id}`);
      cy.get('h1').should('have.text', name);
      cy.contains(description).should('be.visible');
      cy.contains('Manual GCash/Maya').should('be.visible');
      cy.contains('Activation after payment verification').should('be.visible');
      cy.contains('Bawat module ay may hiwalay na subscription').should('be.visible');
      cy.get('body').should('not.contain.text', 'Bago Dumating ang Katuwang');
      cy.get('body').should('not.contain.text', 'Generic Software');
      cy.get('body').should('not.contain.text', 'May offline mode');
      cy.get('body').should('not.contain.text', 'Mabilis na Flow');
    });
  });
});

describe('NC-06 simplified MVP policy pages', () => {
  const prohibitedLegacyPhrases = [
    'Strict No Refunds',
    'Offline Mode & Data Syncing',
    'Bluetooth Thermal',
    'BIR accreditation',
    'rolling window of 7 days',
    'encrypted both in transit',
    '1–3 business days',
    'lock in that discounted rate',
    'Farm, Rental',
  ];

  const assertSelfCanonical = (path: string) => {
    cy.get('head link[rel="canonical"]').should('have.length', 1).and('have.attr', 'href', `https://katuwangsolutions.com${path}`);
  };

  const assertCommonPageRequirements = (path: string, h1: string) => {
    cy.visit(path);
    cy.get('h1').should('have.length', 1).and('have.text', h1);
    assertSelfCanonical(path);
    cy.get('a[href="mailto:support@katuwangsolutions.com"]').should('have.length.at.least', 1);
    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.be.at.most(document.documentElement.clientWidth);
    });
    prohibitedLegacyPhrases.forEach((phrase) => {
      cy.get('body').should('not.contain.text', phrase);
    });
  };

  it('renders the frozen Terms wording with exactly seven sections', () => {
    assertCommonPageRequirements('/terms', 'Terms & Conditions');
    cy.get('main h2').should('have.length', 7);
    cy.contains('Katuwang Solutions modules are subscribed to separately. One subscription does not unlock all modules.').should('be.visible');
    cy.contains('Payments are currently made manually through GCash or Maya.').should('be.visible');
    cy.contains('It is not a lifetime or permanent price guarantee.').should('be.visible');
    cy.contains('We do not promise uninterrupted availability or a fixed response or restoration time.').should('be.visible');
  });

  it('renders the frozen Privacy wording, seven sections, and verified Meta Pixel disclosure', () => {
    assertCommonPageRequirements('/privacy', 'Privacy Policy');
    cy.get('main h2').should('have.length', 7);
    ['PageView', 'ViewContent', 'InitiateCheckout', 'CompleteRegistration'].forEach((eventName) => {
      cy.get('main').contains(eventName).should('be.visible');
    });
    cy.contains('We do not send registration-field values, names, email addresses, phone numbers, addresses, birth dates, gender, business records, payment screenshots, tenant IDs, user IDs, referral codes, raw URLs, or raw query strings to Meta through these application events.').should('be.visible');
    cy.contains('When a new business account is created, Katuwang Solutions may store a limited first-party acquisition record with the tenant account').should('be.visible');
    cy.contains('To request account or data deletion').should('be.visible');
  });

  it('renders exactly eight approved FAQ cards and the manual activation explanation', () => {
    assertCommonPageRequirements('/faq', 'Frequently Asked Questions');
    cy.get('[data-testid="faq-card"]').should('have.length', 8);
    cy.contains('Magkahiwalay ang subscription at bayad ng bawat module.').should('be.visible');
    cy.contains('Walang fixed activation-time promise sa kasalukuyan.').should('be.visible');
    cy.contains('Hindi kami nangangako ng universal offline operation o compatibility sa lahat ng devices.').should('be.visible');
  });

  it('preserves zoom, semantic headings, readable body text, and named support links', () => {
    ['/terms', '/privacy', '/faq'].forEach((path) => {
      cy.visit(path);
      cy.get('meta[name="viewport"]').invoke('attr', 'content').then((content) => {
        expect(content || '').not.to.match(/maximum-scale|user-scalable\s*=\s*no/i);
      });
      cy.get('main h1').should('have.length', 1);
      cy.get('main p').first().then(($paragraph) => {
        const style = getComputedStyle($paragraph[0]);
        expect(Number.parseFloat(style.fontSize)).to.be.at.least(16);
        expect(Number.parseFloat(style.lineHeight)).to.be.greaterThan(Number.parseFloat(style.fontSize));
      });
      cy.get('a[href="mailto:support@katuwangsolutions.com"]').first().should('be.visible').and('not.have.text', '');
    });
  });

  [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ].forEach(({ width, height }) => {
    it(`has no horizontal overflow at ${width}x${height} on all NC-06 routes`, () => {
      cy.viewport(width, height);
      ['/terms', '/privacy', '/faq'].forEach((path) => {
        cy.visit(path);
        cy.window().should((window) => {
          expect(window.innerWidth, `${path} viewport width`).to.equal(width);
          expect(window.innerHeight, `${path} viewport height`).to.equal(height);
        });
        cy.document().then((document) => {
          expect(document.documentElement.scrollWidth, `${path} scroll width`).to.be.at.most(document.documentElement.clientWidth);
        });
        cy.screenshot(`nc-06-${path.slice(1)}-${width}x${height}`, { capture: 'viewport' });
      });
    });
  });
});

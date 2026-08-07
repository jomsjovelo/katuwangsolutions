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
  });

  it('renders complete promotional pricing disclosures', () => {
    cy.get('body').should('contain', '₱99');
    cy.get('body').should('contain', 'bawat module');
    cy.get('body').should('contain', 'regular');
  });

  it('renders valid canonical tag in head', () => {
    cy.get('head link[rel="canonical"]').should('have.attr', 'href').and('include', 'https://katuwangsolutions.com');
  });
});

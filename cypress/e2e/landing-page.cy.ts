describe('Landing Page', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the hero section and CTA buttons', () => {
    cy.get('body').should('contain', 'I-angat ang Negosyo');
    cy.get('button').contains('Simulan ang Katuwang').should('be.visible');
  });

  it('displays the app suite carousel', () => {
    cy.get('button').contains('View all Products').should('be.visible');
    // Verify an app card exists (e.g., Benta Snap)
    cy.get('body').should('contain', 'Benta Snap');
  });

  it('renders features and pricing sections', () => {
    cy.get('body').should('contain', 'Bakit Katuwang?');
    cy.get('body').should('contain', '₱99');
  });
});

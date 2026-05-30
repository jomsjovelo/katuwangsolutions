describe('Onboarding Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('opens onboarding wizard from landing page', () => {
    // Click 'View all Products'
    cy.contains('button', 'View all Products').click();
    
    // Should display the first step of the wizard
    cy.get('body').should('contain', 'STEP 1 OF 3');
    cy.get('body').should('contain', 'Piliin ang App para sa Negosyo');
    
    // Select an app (e.g., Benta Snap) and proceed
    cy.contains('Benta Snap').click();
    cy.contains('button', 'Magpatuloy').click();
    
    // Should display the second step
    cy.get('body').should('contain', 'STEP 2 OF 3');
    cy.get('body').should('contain', 'Impormasyon ng Negosyo');
  });
});

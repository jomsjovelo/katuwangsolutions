describe('Staff Access Security Phase 1 — UI regression only', () => {
  it('preserves the owner login page and opens the existing Cashier PIN form', () => {
    cy.visit('/login');
    cy.get('input[name="email"]').should('be.visible').type('owner@example.com').clear();
    cy.get('[data-testid="cashier-login-toggle-btn"]').should('be.visible').click();
    cy.contains('Cashier / Staff Login').should('be.visible');
    cy.get('#staff-biz-code').should('be.visible');
    cy.get('#staff-username').should('be.visible');
    cy.get('#staff-pin').should('be.visible').and('have.attr', 'maxlength', '4');
    cy.contains('button', 'Pumasok sa POS').should('be.disabled');
  });

  it('keeps the Cashier PIN input numeric and requires four digits', () => {
    cy.visit('/login');
    cy.get('input[name="email"]').should('be.visible').type('owner@example.com').clear();
    cy.get('[data-testid="cashier-login-toggle-btn"]').should('be.visible').click();
    cy.get('#staff-biz-code').should('be.visible').type('demo123');
    cy.get('#staff-username').type('cashier');
    cy.get('#staff-pin').type('1a2b34');
    cy.get('#staff-pin').should('have.value', '1234');
    cy.contains('button', 'Pumasok sa POS').should('not.be.disabled');
  });
});

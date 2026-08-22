describe('Staff Access Security Phase 1 — UI regression only', () => {
  it('preserves the owner login page and opens the existing Cashier PIN form', () => {
    cy.visit('/login');
    cy.contains(/Mag-log in|Email|Password/i).should('be.visible');
    cy.contains('button', 'Staff / Cashier Login (PIN)').click();
    cy.contains('Cashier / Staff Login').should('be.visible');
    cy.get('#staff-biz-code').should('be.visible');
    cy.get('#staff-username').should('be.visible');
    cy.get('#staff-pin').should('be.visible').and('have.attr', 'maxlength', '4');
    cy.contains('button', 'Pumasok sa POS').should('be.disabled');
  });

  it('keeps the Cashier PIN input numeric and requires four digits', () => {
    cy.visit('/login');
    cy.contains('button', 'Staff / Cashier Login (PIN)').click();
    cy.get('#staff-biz-code').type('demo123');
    cy.get('#staff-username').type('cashier');
    cy.get('#staff-pin').type('1a2b34');
    cy.get('#staff-pin').should('have.value', '1234');
    cy.contains('button', 'Pumasok sa POS').should('not.be.disabled');
  });
});

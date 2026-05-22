describe('Benta Dashboard Checkout Flow', () => {
  beforeEach(() => {
    // Visit the home page (which should show Benta Dashboard for authenticated/default tenant)
    // Note: If authentication is required, we would typically log in programmatically here
    // or stub the auth context to pretend we are logged in. For smoke testing, we assume
    // the UI is accessible.
    cy.visit('/?view=benta');
  });

  it('should add an item to the cart and process a cash checkout', () => {
    // 1. Wait for the product grid to load and have items
    cy.get('[data-testid="product-card"]').should('have.length.greaterThan', 0);

    // 2. Click the first product to add to cart
    cy.get('[data-testid="product-card"]').first().click();

    // 3. Verify the cart has the item
    // Assuming the cart shows the total in the UI
    cy.contains('Kabuuang Halaga').should('be.visible');
    
    // 4. Click the 'Cash' checkout button
    // We target the button containing 'Cash'
    cy.contains('button', 'Cash').click();

    // 5. If there's a confirmation modal or immediate processing, wait for success
    // Wait for the "Transaction Saved" toast/message
    cy.contains('Transaction Saved', { timeout: 10000 }).should('be.visible');

    // 6. Verify cart has reset
    cy.contains('Walang Laman ang Cart').should('be.visible');
  });
});

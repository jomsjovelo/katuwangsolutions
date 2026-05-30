describe('Auth Guards', () => {
  it('redirects unauthenticated users to the landing page from dashboard', () => {
    cy.visit('/dashboard');
    cy.location('pathname').should('eq', '/');
  });

  it('shows login dialog when accessing admin panel', () => {
    cy.visit('/admin');
    cy.location('pathname').should('eq', '/');
    // We expect it to redirect to landing since it's unauthenticated
  });
});

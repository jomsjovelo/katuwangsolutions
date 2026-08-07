describe('Onboarding & Registration Modal E2E Tests', () => {
  const viewports: [number, number][] = [
    [360, 800],
    [375, 812],
    [390, 844],
    [412, 915]
  ];

  const openRegistrationSheet = () => {
    cy.get('[data-testid="hero-register-cta"]').should('be.visible').click();
    cy.get('[role="dialog"]').should('be.visible');
  };

  viewports.forEach(([width, height]) => {
    describe(`Registration Sheet at viewport ${width}x${height}`, () => {
      beforeEach(() => {
        cy.viewport(width, height);
        cy.visit('/');
      });

      it('opens registration sheet and displays accessible dialog attributes', () => {
        openRegistrationSheet();
        cy.get('[role="dialog"]').should('have.attr', 'aria-modal', 'true');
        cy.get('[role="dialog"]').should('have.attr', 'aria-labelledby', 'register-sheet-title');
        cy.get('[role="radiogroup"]').should('exist');
      });

      it('displays two-tier promo pricing in module selection list', () => {
        openRegistrationSheet();
        cy.contains('button', 'Business Owner').click();
        cy.contains('button', 'Magpatuloy').click();

        cy.get('[role="radiogroup"]').should('exist');
        cy.contains('Promo ₱99/mo').should('exist');
        cy.contains('bawat module').should('exist');
      });

      it('hides Floating CTA and Messenger Widget when registration sheet is open', () => {
        cy.get('[role="dialog"]').should('not.exist');
        openRegistrationSheet();
        
        // Assert floating controls are hidden / not visible while dialog is active
        cy.get('[data-testid="floating-register-cta"]').should('not.exist');
        cy.get('[data-testid="floating-messenger-widget"]').should('not.exist');
      });

      it('closes sheet on Escape key press and restores focus to invoker', () => {
        cy.get('[data-testid="hero-register-cta"]').as('invokerBtn').should('be.visible').focus().click();
        cy.get('[role="dialog"]').should('be.visible');
        
        cy.get('body').type('{esc}');
        cy.get('[role="dialog"]').should('not.exist');
        cy.get('@invokerBtn').should('have.focus');
      });
    });
  });

  describe('Keyboard Radio Navigation & Focus Trapping', () => {
    beforeEach(() => {
      cy.viewport(390, 844);
      cy.visit('/');
    });

    it('navigates role radio selection using Arrow keys and roving tabIndex', () => {
      openRegistrationSheet();
      cy.get('[role="radiogroup"]').should('exist');
      
      // Focus on first radio (Business Owner)
      cy.get('[role="radio"]').first().focus().should('have.attr', 'aria-checked', 'false');
      
      // Press Down Arrow to move selection and focus to Team Member
      cy.get('[role="radio"]').first().type('{downarrow}');
      cy.get('[role="radio"]').eq(1).should('have.attr', 'aria-checked', 'true');
      cy.get('[role="radio"]').eq(1).should('have.focus');
    });

    it('traps focus within modal dialog when pressing Tab and Shift+Tab', () => {
      openRegistrationSheet();

      cy.get('[role="dialog"] button:not([disabled])').then(($focusableButtons) => {
        const firstButton = $focusableButtons[0];
        const lastButton = $focusableButtons[$focusableButtons.length - 1];

        cy.wrap(firstButton).focus().trigger('keydown', {
          key: 'Tab',
          code: 'Tab',
          keyCode: 9,
          which: 9,
          shiftKey: true,
          bubbles: true,
        });
        cy.focused().should(($focused) => {
          expect($focused[0], 'Shift+Tab wraps from first to last dialog control').to.equal(lastButton);
        });

        cy.focused().trigger('keydown', {
          key: 'Tab',
          code: 'Tab',
          keyCode: 9,
          which: 9,
          bubbles: true,
        });
        cy.focused().should(($focused) => {
          expect($focused[0], 'Tab wraps from last to first dialog control').to.equal(firstButton);
        });
      });
    });

    it('navigates to module onboarding on continue', () => {
      openRegistrationSheet();
      cy.contains('button', 'Business Owner').click();
      cy.contains('button', 'Magpatuloy').click();
      
      cy.contains('Benta Snap').click();
      cy.contains('button', 'Ituloy ang Pagpaparehistro').click();
      
      cy.url().should('include', '/benta-snap/onboarding');
    });
  });
});

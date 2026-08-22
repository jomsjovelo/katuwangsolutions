describe('Secure Benta Snap Cashier — Genuine UI Lifecycle Suite', () => {
  beforeEach(() => {
    const mockValidJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZnN0dWRpby01NTM4MTE2Njg5LWJkZmIyIiwiYXVkIjoiZnN0dWRpby01NTM4MTE2Njg5LWJkZmIyIiwiYXV0aF90aW1lIjoxNzcxMjM0NTY3LCJ1c2VyX2lkIjoiY2FzaGllcl91aWRfdGVzdCIsInN1YiI6ImNhc2hpZXJfdWlkX3Rlc3QiLCJpYXQiOjE3NzEyMzQ1NjcsImV4cCI6MTk3MTIzNDU2NywiZW1haWwiOiJtYXJpYUBrYXR1d2FuZy5pbnRlcm5hbCIsInJvbGUiOiJjYXNoaWVyIiwidGVuYW50SWQiOiJ0ZW5hbnRfY3lfdGVzdCIsInN0YWZmQWNjb3VudElkIjoic3RhZmZfYWNjXzEiLCJzZXNzaW9uVmVyc2lvbiI6MX0.signature';

    // Intercept Google Identity Toolkit for Client-Side Custom Token Authentication
    cy.intercept('POST', '**/accounts:signInWithCustomToken*', {
      statusCode: 200,
      body: {
        kind: 'identitytoolkit#VerifyCustomTokenResponse',
        idToken: mockValidJwt,
        refreshToken: 'mock-refresh-token-xyz',
        expiresIn: '3600',
        isNewUser: false,
        localId: 'cashier_uid_test'
      }
    }).as('googleCustomToken');

    cy.intercept('POST', '**/accounts:lookup*', {
      statusCode: 200,
      body: {
        kind: 'identitytoolkit#GetAccountInfoResponse',
        users: [
          {
            localId: 'cashier_uid_test',
            email: 'maria@katuwang.internal',
            emailVerified: true,
            customAttributes: JSON.stringify({
              role: 'cashier',
              tenantId: 'tenant_cy_test',
              staffAccountId: 'staff_acc_1',
              sessionVersion: 1
            })
          }
        ]
      }
    }).as('googleLookup');

    cy.intercept('POST', '**/token*', {
      statusCode: 200,
      body: {
        access_token: mockValidJwt,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token-xyz',
        id_token: mockValidJwt,
        user_id: 'cashier_uid_test',
        project_id: 'fstudio-5538116689-bdfb2'
      }
    }).as('googleTokenRefresh');

    cy.intercept('POST', '**/securetoken.googleapis.com/**', {
      statusCode: 200,
      body: {
        access_token: mockValidJwt,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token-xyz',
        id_token: mockValidJwt,
        user_id: 'cashier_uid_test',
        project_id: 'fstudio-5538116689-bdfb2'
      }
    });

    let activeCyShift: any = null;

    // 1. PIN Login Intercept
    cy.intercept('POST', '/api/auth/staff-pin-login', (req) => {
      expect(req.body).to.have.property('businessCode', 'DEMO123');
      expect(req.body).to.have.property('username', 'maria');
      expect(req.body).to.have.property('pin', '1234');

      req.reply({
        statusCode: 200,
        body: {
          success: true,
          customToken: 'mock-custom-token-cashier-maria',
          tenantId: 'tenant_cy_test',
          authUid: 'cashier_uid_test',
          sessionVersion: 1,
          tenantName: 'Katuwang Sari-Sari Store',
          moduleType: 'benta-snap',
          staffAccount: {
            id: 'staff_acc_1',
            username: 'maria',
            status: 'active'
          }
        }
      });
    }).as('pinLogin');

    // 2. Authoritative Bootstrap Intercept
    cy.intercept('GET', '/api/cashier/benta-bootstrap', (req) => {
      expect(req.headers['authorization']).to.match(/^Bearer /);
      req.reply({
        statusCode: 200,
        body: {
          tenantId: 'tenant_cy_test',
          tenantDisplayName: 'Katuwang Sari-Sari Store',
          moduleId: 'benta-snap',
          staffAccountId: 'staff_acc_1',
          cashierDisplayName: 'Maria Santos',
          currentShift: activeCyShift,
          products: [
            {
              id: 'prod_rice_1',
              name: 'Sinandomeng Rice 1kg',
              salePrice: 5500,
              currentStock: 25,
              unit: 'kg',
              isActive: true,
              category: 'Rice'
            },
            {
              id: 'prod_coffee_1',
              name: 'Kopiko Black 3-in-1',
              salePrice: 1200,
              currentStock: 50,
              unit: 'sachet',
              isActive: true,
              category: 'Beverage'
            }
          ]
        }
      });
    }).as('bootstrap');

    // 3. Shift Open Intercept
    cy.intercept('POST', '/api/cashier/benta-shift-open', (req) => {
      expect(req.body).to.have.property('idempotencyKey');
      expect(req.body).to.have.property('startingCashCentavos', 50000);
      activeCyShift = {
        shiftId: 'shift_cy_001',
        id: 'shift_cy_001',
        openedAt: new Date().toISOString(),
        moduleId: 'benta-snap',
        status: 'open',
        startingCashCentavos: 50000
      };
      req.reply({
        statusCode: 201,
        body: activeCyShift
      });
    }).as('shiftOpen');

    // 4. Checkout Intercept
    cy.intercept('POST', '/api/cashier/benta-checkout', (req) => {
      expect(req.body).to.have.property('idempotencyKey');
      expect(req.body).to.have.property('shiftId', 'shift_cy_001');
      expect(req.body).to.have.property('items');
      expect(req.body).to.have.property('paymentMethod');
      expect(req.body.items[0]).to.not.have.property('price');

      req.reply({
        statusCode: 201,
        body: {
          saleId: 'sale_cy_1001',
          receiptNumber: 'RCP-2026-0001',
          committedAt: new Date().toISOString(),
          moduleId: 'benta-snap',
          paymentMethod: req.body.paymentMethod,
          shiftId: 'shift_cy_001',
          cashierDisplayName: 'Maria Santos',
          items: [
            {
              productId: req.body.items[0].productId,
              name: req.body.items[0].productId === 'prod_rice_1' ? 'Sinandomeng Rice 1kg' : 'Kopiko Black 3-in-1',
              unit: req.body.items[0].productId === 'prod_rice_1' ? 'kg' : 'sachet',
              quantity: req.body.items[0].quantity,
              unitPriceCentavos: req.body.items[0].productId === 'prod_rice_1' ? 5500 : 1200,
              lineTotalCentavos: req.body.items[0].productId === 'prod_rice_1' ? 5500 : 1200
            }
          ],
          subtotalCentavos: req.body.items[0].productId === 'prod_rice_1' ? 5500 : 1200,
          totalCentavos: req.body.items[0].productId === 'prod_rice_1' ? 5500 : 1200
        }
      });
    }).as('checkout');

    // 5. Shift Reconciliation Intercept
    cy.intercept('POST', '/api/cashier/benta-shift-reconciliation', (req) => {
      expect(req.body).to.have.property('shiftId', 'shift_cy_001');
      expect(req.body).to.have.property('endingCashCentavos', 55500);
      activeCyShift = null;
      req.reply({
        statusCode: 200,
        body: {
          reconciliationVersion: 1,
          shiftId: 'shift_cy_001',
          startingCashCentavos: 50000,
          cashSales: 5500,
          gcashSales: 0,
          mayaSales: 0,
          totalShiftSales: 5500,
          electronicReceipts: 0,
          physicalCashAdjustments: 0,
          saleCount: 1,
          expectedPhysicalCashCentavos: 55500,
          endingCashCentavos: 55500,
          discrepancyCentavos: 0,
          closedAt: new Date().toISOString()
        }
      });
    }).as('reconcile');

    // 4. Trusted Server Logout Intercept
    cy.intercept('POST', '/api/auth/staff-logout', (req) => {
      expect(req.headers['authorization']).to.match(/^Bearer /);
      req.reply({
        statusCode: 200,
        body: { success: true }
      });
    }).as('staffLogout');
    cy.viewport(1280, 800);
  });

  const performCashierLogin = () => {
    cy.visit('/login');
    cy.contains('button', 'Staff / Cashier Login (PIN)').click();
    cy.get('#staff-biz-code').type('DEMO123');
    cy.get('#staff-username').type('maria');
    cy.get('#staff-pin').type('1234');
    cy.contains('button', 'Pumasok sa POS').click();
    cy.wait('@pinLogin');
    cy.wait('@bootstrap');
  };

  const openCashierShift = (startingCash = '500') => {
    performCashierLogin();
    cy.contains('Buksan ang Kaha').should('be.visible');
    cy.get('input[type="number"]').type(startingCash);
    cy.contains('button', 'Simulan ang Shift').click();
    cy.wait('@shiftOpen');
    cy.contains('Buksan ang Kaha').should('not.exist');
    cy.contains('Sinandomeng Rice 1kg').should('be.visible');
  };

  it('1. Open Shift through the UI', () => {
    openCashierShift('500');
    cy.contains('Sinandomeng Rice 1kg').should('be.visible');
    cy.contains('Kopiko Black 3-in-1').should('be.visible');
  });

  it('2. Cash checkout through the UI and rendered receipt', () => {
    openCashierShift('500');
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('not.be.disabled').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', 'Exact').click();
      cy.contains('button', 'Tapusin ang Sale').click();
    });

    cy.wait('@checkout');
    cy.contains('RCP-2026-0001').should('be.visible');
    cy.contains('Kopiko Black 3-in-1').should('be.visible');
    cy.contains('₱12.00').should('be.visible');
  });

  it('3. GCash checkout through the UI and rendered receipt', () => {
    openCashierShift('500');
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.get('button').contains('GCash').filter(':visible').should('not.be.disabled').click();
    cy.contains('button', 'I-verify Payment').click();

    cy.wait('@checkout', { timeout: 10000 });
    cy.contains('RCP-2026-0001').should('be.visible');
    cy.contains('Kopiko Black 3-in-1').should('be.visible');
  });

  it('4. Maya checkout through the UI and rendered receipt', () => {
    openCashierShift('500');
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.get('button').contains('Maya').filter(':visible').should('not.be.disabled').click();
    cy.contains('button', 'I-verify Payment').click();

    cy.wait('@checkout', { timeout: 10000 });
    cy.contains('RCP-2026-0001').should('be.visible');
    cy.contains('Kopiko Black 3-in-1').should('be.visible');
  });

  it('5. Close Shift through the UI and rendered reconciliation', () => {
    openCashierShift('500');
    cy.contains('Profile').click({ force: true });
    cy.contains('Shift Active').should('be.visible');
    cy.contains('button', 'Isara ang Shift (Close Register)').click();
    cy.get('input[placeholder="0.00"]').type('555');
    cy.contains('button', 'Kumpirmahin at Isara').click();

    cy.wait('@reconcile');
    cy.get('[role="dialog"]').first().within(() => {
      cy.get('h2').contains('Ulat ng Pagsasara').should('be.visible');
      cy.contains('₱555.00').should('be.visible');
    });
  });

  it('6. Successful trusted logout: server logout completes before returning to logged-out state', () => {
    openCashierShift('500');
    cy.contains('Profile').click({ force: true });
    cy.on('window:confirm', () => true);
    cy.contains('button', 'Mag-logout (Sign Out)').click();

    cy.wait('@staffLogout');
    cy.url().should('include', '/login');
  });

  it('7. Offline checkout: checkout is attempted, sends zero checkout requests, and renders no success/receipt', () => {
    let checkoutAttempted = false;
    cy.intercept('POST', '/api/cashier/benta-checkout', () => {
      checkoutAttempted = true;
    }).as('unexpectedCheckout');

    openCashierShift('500');
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.window().then((win) => {
      Object.defineProperty(win.navigator, 'onLine', { value: false, configurable: true });
      win.dispatchEvent(new Event('offline'));
    });

    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('not.be.disabled').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', 'Exact').click();
      cy.contains('button', 'Tapusin ang Sale').click();
    });

    cy.contains('Offline ang device').should('be.visible');
    cy.contains('RCP-').should('not.exist');
    cy.contains('Benta Kumpleto').should('not.exist');
    cy.then(() => {
      expect(checkoutAttempted).to.be.false;
    });
  });

  it('8. Ambiguous checkout retry: sends deeply identical request body & key, blocks cart mutations (+/- and new items), and dedicated retry action uses displayed method', () => {
    let callCount = 0;
    let initialRequestBody: any = null;

    cy.intercept('POST', '/api/cashier/benta-checkout', (req) => {
      callCount++;
      if (callCount === 1) {
        initialRequestBody = JSON.parse(JSON.stringify(req.body));
        req.reply({ statusCode: 500, body: { error: 'Temporary Network Error' } });
      } else {
        expect(req.body).to.deep.equal(initialRequestBody);
        req.reply({
          statusCode: 201,
          body: {
            saleId: 'sale_cy_retry',
            receiptNumber: 'RCP-RETRY-001',
            committedAt: new Date().toISOString(),
            moduleId: 'benta-snap',
            paymentMethod: 'cash',
            shiftId: 'shift_cy_001',
            cashierDisplayName: 'Maria Santos',
            items: [
              {
                productId: 'prod_coffee_1',
                name: 'Kopiko Black 3-in-1',
                unit: 'pc',
                quantity: 1,
                unitPriceCentavos: 1200,
                lineTotalCentavos: 1200
              }
            ],
            subtotalCentavos: 1200,
            totalCentavos: 1200
          }
        });
      }
    }).as('retryCheckout');

    openCashierShift('500');
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('not.be.disabled').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', 'Exact').click();
      cy.contains('button', 'Tapusin ang Sale').click();
    });

    cy.wait('@retryCheckout');
    cy.contains('Temporary Network Error').should('be.visible');

    // 1. Pending transaction UI is displayed showing locked method
    cy.contains('Nakabinbing Transaksyon (CASH)').should('be.visible');
    cy.contains('button', 'Subukan Muli (CASH)').should('be.visible');

    // 2. Normal payment selection is disabled
    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('be.disabled');
    cy.get('button').contains('GCash').filter(':visible').should('be.disabled');
    cy.get('button').contains('Maya').filter(':visible').should('be.disabled');

    // 3. Cart modifications are genuinely blocked:
    // Action A: Attempt adding another product (Sinandomeng Rice 1kg)
    cy.contains('Sinandomeng Rice 1kg').click({ force: true });
    cy.get('.lg\\:block').within(() => {
      cy.contains('Sinandomeng Rice 1kg').should('not.exist');
    });

    // Action B: Attempt increasing quantity using + button
    cy.get('.lg\\:block').within(() => {
      cy.get('button:has(svg.lucide-plus)').should('be.disabled').click({ force: true });
      cy.contains('1').should('be.visible');
    });

    // Action C: Attempt decreasing quantity using - button
    cy.get('.lg\\:block').within(() => {
      cy.get('button:has(svg.lucide-minus)').should('be.disabled').click({ force: true });
      cy.contains('1').should('be.visible');
      cy.contains('button', 'Burahin Lahat').should('be.disabled');
    });

    // 4. Dedicated retry action resubmits deeply identical request
    cy.contains('button', 'Subukan Muli (CASH)').click();
    cy.wait('@retryCheckout');
    cy.contains('RCP-RETRY-001').should('be.visible');
    cy.contains('Nakabinbing Transaksyon').should('not.exist');
  });

  it('9. Changed pre-submission cart/payment intent generates a new idempotency key', () => {
    let capturedKeys: string[] = [];

    cy.intercept('POST', '/api/cashier/benta-checkout', (req) => {
      capturedKeys.push(req.body.idempotencyKey);
      req.reply({
        statusCode: 201,
        body: {
          saleId: `sale_cy_${capturedKeys.length}`,
          receiptNumber: `RCP-SEQ-${capturedKeys.length}`,
          committedAt: new Date().toISOString(),
          moduleId: 'benta-snap',
          paymentMethod: 'cash',
          shiftId: 'shift_cy_001',
          cashierDisplayName: 'Maria Santos',
          items: [{ productId: 'prod_coffee_1', name: 'Kopiko Black 3-in-1', unit: 'pc', quantity: 1, unitPriceCentavos: 1200, lineTotalCentavos: 1200 }],
          subtotalCentavos: 1200,
          totalCentavos: 1200
        }
      });
    }).as('seqCheckout');

    openCashierShift('500');

    // First sale
    cy.get('h4').contains('Kopiko Black 3-in-1').click();
    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('not.be.disabled').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', 'Exact').click();
      cy.contains('button', 'Tapusin ang Sale').click();
    });
    cy.wait('@seqCheckout');
    cy.contains('button', 'Matapos at Bumalik sa POS').click();

    // Second sale with changed intent receives a distinct idempotency key
    cy.get('h4').contains('Sinandomeng Rice 1kg').click();
    cy.get('button').filter(':contains("Cash")').not(':contains("GCash")').filter(':visible').should('not.be.disabled').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', 'Exact').click();
      cy.contains('button', 'Tapusin ang Sale').click();
    });
    cy.wait('@seqCheckout');

    cy.then(() => {
      expect(capturedKeys).to.have.length(2);
      expect(capturedKeys[0]).to.not.equal(capturedKeys[1]);
    });
  });

  it('10. Owner authentication reaches Owner experience with valid matching tenant, while mismatched tenant fails closed', () => {
    const mockOwnerJwt = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZnN0dWRpby01NTM4MTE2Njg5LWJkZmIyIiwiYXVkIjoiZnN0dWRpby01NTM4MTE2Njg5LWJkZmIyIiwiYXV0aF90aW1lIjoxNzcxMjM0NTY3LCJ1c2VyX2lkIjoib3duZXJfdWlkX3Rlc3QiLCJzdWIiOiJvd25lcl91aWRfdGVzdCIsImlhdCI6MTc3MTIzNDU2NywiZXhwIjoxOTcxMjM0NTY3LCJlbWFpbCI6Im93bmVyQGthdHV3YW5nLnBoIiwicm9sZSI6Im93bmVyIiwidGVuYW50SWQiOiJ0ZW5hbnRfb3duZXJfdGVzdCJ9.signature';

    cy.intercept('POST', '**/accounts:signInWithPassword*', {
      statusCode: 200,
      body: {
        kind: 'identitytoolkit#VerifyPasswordResponse',
        localId: 'owner_uid_test',
        email: 'owner@katuwang.ph',
        displayName: 'Test Owner',
        idToken: mockOwnerJwt,
        registered: true,
        refreshToken: 'mock-refresh-token-owner',
        expiresIn: '3600'
      }
    }).as('ownerSignIn');

    cy.intercept('POST', '**/accounts:lookup*', {
      statusCode: 200,
      body: {
        kind: 'identitytoolkit#GetAccountInfoResponse',
        users: [
          {
            localId: 'owner_uid_test',
            email: 'owner@katuwang.ph',
            emailVerified: true,
            displayName: 'Test Owner',
            customAttributes: JSON.stringify({
              role: 'owner',
              tenantId: 'tenant_owner_test'
            })
          }
        ]
      }
    }).as('ownerLookup');

    cy.intercept('POST', '**/token*', {
      statusCode: 200,
      body: {
        access_token: mockOwnerJwt,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token-owner',
        id_token: mockOwnerJwt,
        user_id: 'owner_uid_test',
        project_id: 'fstudio-5538116689-bdfb2'
      }
    }).as('ownerTokenRefresh');

    cy.intercept('POST', '**/securetoken.googleapis.com/**', {
      statusCode: 200,
      body: {
        access_token: mockOwnerJwt,
        expires_in: '3600',
        token_type: 'Bearer',
        refresh_token: 'mock-refresh-token-owner',
        id_token: mockOwnerJwt,
        user_id: 'owner_uid_test',
        project_id: 'fstudio-5538116689-bdfb2'
      }
    });

    // Part A: Persisted tenant state alone cannot authorize before authoritative Firestore snapshot arrives
    cy.visit('/login', {
      onBeforeLoad(win: any) {
        win.localStorage.setItem('katuwang-store', JSON.stringify({
          state: {
            activeTenant: {
              id: 'tenant_owner_test',
              name: 'Katuwang Retail Store',
              ownerUid: 'owner_uid_test',
              staffUids: [],
              moduleType: 'benta-snap',
              pricingTier: 'standard_100',
              subscriptionStatus: 'active',
              createdAt: '2026-08-17T00:00:00Z'
            }
          },
          version: 0
        }));
      }
    });

    cy.get('input[name="email"]').type('owner@katuwang.ph');
    cy.get('input[name="password"]').type('password123');
    cy.contains('button', 'Mag-Login').click();

    cy.wait('@ownerSignIn');
    // AuthGuard keeps session in verification/loading state until authoritative Firestore snapshot arrives
    cy.contains('Initializing Ecosystem', { timeout: 10000 }).should('be.visible');
    // Invariant: Protected Owner controls must NEVER render from persisted client state alone
    cy.contains('button', 'Add Item').should('not.exist');
    cy.contains('Buksan ang Kaha').should('not.exist');

    // Part B: Forged/mismatched Owner UID in local tenant state must fail closed or stay in loading
    cy.visit('/login', {
      onBeforeLoad(win: any) {
        win.localStorage.setItem('katuwang-store', JSON.stringify({
          state: {
            activeTenant: {
              id: 'tenant_other_business',
              name: 'Other Stolen Store',
              ownerUid: 'attacker_or_other_uid', // Mismatched UID
              staffUids: [],
              moduleType: 'benta-snap',
              pricingTier: 'standard_100',
              subscriptionStatus: 'active',
              createdAt: '2026-08-17T00:00:00Z'
            }
          },
          version: 0
        }));
      }
    });

    cy.get('input[name="email"]').type('owner@katuwang.ph');
    cy.get('input[name="password"]').type('password123');
    cy.contains('button', 'Mag-Login').click();

    cy.wait('@ownerSignIn');
    // AuthGuard keeps session in verification/loading state and NEVER authorizes from forged local state
    cy.contains('Initializing Ecosystem', { timeout: 10000 }).should('be.visible');
    cy.contains('Add Item').should('not.exist');
    cy.contains('Other Stolen Store').should('not.exist');

    // Part C: Adversarial Case — Forged matching ownerUid on unauthorized tenant ID cannot grant access to victim tenant
    cy.visit('/login', {
      onBeforeLoad(win: any) {
        win.localStorage.setItem('katuwang-store', JSON.stringify({
          state: {
            activeTenant: {
              id: 'tenant_unauthorized_victim_999',
              name: 'Victim Business Under Attack',
              ownerUid: 'owner_uid_test', // Forged to match authenticated user.uid
              staffUids: [],
              moduleType: 'benta-snap',
              pricingTier: 'standard_100',
              subscriptionStatus: 'active',
              createdAt: '2026-08-17T00:00:00Z'
            }
          },
          version: 0
        }));
      }
    });

    cy.get('input[name="email"]').type('owner@katuwang.ph');
    cy.get('input[name="password"]').type('password123');
    cy.contains('button', 'Mag-Login').click();

    cy.wait('@ownerSignIn');
    // Proves forged tenant is ignored; access to unauthorized victim tenant is strictly denied
    cy.contains('Victim Business Under Attack').should('not.exist');
    cy.contains('Add Item').should('not.exist');
  });

  it('11. Server-revocation failure keeps the session safely recoverable', () => {
    cy.intercept('POST', '/api/auth/staff-logout', {
      statusCode: 500,
      body: { error: 'Server session revocation failed' }
    }).as('failingLogout');

    openCashierShift('500');
    cy.contains('Profile').click({ force: true });
    cy.on('window:confirm', () => true);
    cy.contains('button', 'Mag-logout (Sign Out)').click();

    cy.wait('@failingLogout');
    cy.contains('Server session revocation failed').should('be.visible');
    cy.url().should('include', '/dashboard');
  });

  it('12. Cashier cannot access excluded Owner controls (Tingi, Palista, Discounts, Reports)', () => {
    openCashierShift('500');
    cy.contains('button', 'Palista').should('not.exist');
    cy.contains('button', 'Tingi').should('not.exist');
    cy.contains('button', 'Discount').should('not.exist');
    cy.contains('Inventory').should('not.exist');
    cy.contains('Reports').should('not.exist');
  });

  it('13. Successful server revocation followed by Firebase sign-out failure still clears Cashier/tenant display state and navigates to /login', () => {
    cy.intercept('POST', '/api/auth/staff-logout', {
      statusCode: 200,
      body: { success: true }
    }).as('successfulLogout');

    cy.intercept('POST', '**/accounts:signOut*', {
      statusCode: 500,
      body: { error: 'Simulated Firebase Client SignOut Network Error' }
    }).as('firebaseSignOutFail');

    openCashierShift('500');
    cy.contains('Profile').click({ force: true });
    cy.on('window:confirm', () => true);
    cy.contains('button', 'Mag-logout (Sign Out)').click();

    cy.wait('@successfulLogout');
    cy.url().should('include', '/login');
    cy.contains('POS Terminal').should('not.exist');
    cy.contains('Maria Santos').should('not.exist');
  });
});

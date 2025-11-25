# Payment Logic Unit Tests - Error Prevention

## 🧪 **UNIT TESTS TO PREVENT BUSINESS LOGIC ERRORS**

These test examples show how to catch business logic errors like the supplier balance bug through comprehensive testing.

## **📋 TEST SCENARIOS**

### **Customer Payment Tests**

```typescript
describe('Customer Payment Logic', () => {
  test('Customer pays us - balance should decrease', () => {
    // Arrange
    const customer = { id: '1', name: 'John Doe', lb_balance: 1000 }; // Customer owes us 1000 LBP
    const payment = {
      entityType: 'customer',
      entityId: '1',
      amount: '300',
      currency: 'LBP',
      paymentDirection: 'receive'
    };
    
    // Act
    const result = calculateNewBalance(customer, payment);
    
    // Assert
    expect(result.newBalance).toBe(700); // 1000 - 300 = 700
    expect(result.interpretation).toBe('Customer owes us 700 LBP');
  });

  test('We pay customer (refund) - balance should increase', () => {
    // Arrange
    const customer = { id: '1', name: 'John Doe', lb_balance: 1000 };
    const payment = {
      entityType: 'customer',
      entityId: '1', 
      amount: '200',
      currency: 'LBP',
      paymentDirection: 'pay'
    };
    
    // Act
    const result = calculateNewBalance(customer, payment);
    
    // Assert
    expect(result.newBalance).toBe(1200); // 1000 + 200 = 1200
    expect(result.interpretation).toBe('Customer owes us 1200 LBP');
  });
});
```

### **Supplier Payment Tests**

```typescript
describe('Supplier Payment Logic', () => {
  test('We pay supplier - balance should decrease', () => {
    // Arrange
    const supplier = { id: '1', name: 'ABC Supplies', lb_balance: 2000 }; // We owe supplier 2000 LBP
    const payment = {
      entityType: 'supplier',
      entityId: '1',
      amount: '500', 
      currency: 'LBP',
      paymentDirection: 'pay'
    };
    
    // Act
    const result = calculateNewBalance(supplier, payment);
    
    // Assert
    expect(result.newBalance).toBe(1500); // 2000 - 500 = 1500 ✅ CRITICAL TEST
    expect(result.interpretation).toBe('We owe supplier 1500 LBP');
    
    // This test would have FAILED with the old buggy logic:
    // Old logic: 2000 + 500 = 2500 ❌ WRONG!
  });

  test('Supplier pays us (rare) - balance should increase', () => {
    // Arrange
    const supplier = { id: '1', name: 'ABC Supplies', lb_balance: 1000 };
    const payment = {
      entityType: 'supplier',
      entityId: '1',
      amount: '300',
      currency: 'LBP', 
      paymentDirection: 'receive'
    };
    
    // Act
    const result = calculateNewBalance(supplier, payment);
    
    // Assert
    expect(result.newBalance).toBe(1300); // 1000 + 300 = 1300
    expect(result.interpretation).toBe('We owe supplier 1300 LBP');
  });
});
```

### **Edge Case Tests**

```typescript
describe('Payment Edge Cases', () => {
  test('Zero balance customer payment', () => {
    const customer = { id: '1', name: 'John', lb_balance: 0 };
    const payment = { entityType: 'customer', amount: '100', paymentDirection: 'receive' };
    
    const result = calculateNewBalance(customer, payment);
    expect(result.newBalance).toBe(-100); // Customer has credit
  });

  test('Negative balance supplier payment', () => {
    const supplier = { id: '1', name: 'ABC', lb_balance: -500 }; // Supplier owes us
    const payment = { entityType: 'supplier', amount: '200', paymentDirection: 'pay' };
    
    const result = calculateNewBalance(supplier, payment);
    expect(result.newBalance).toBe(-700); // We pay them, they owe us more
  });

  test('Currency conversion accuracy', () => {
    const customer = { id: '1', name: 'John', usd_balance: 100 };
    const payment = { entityType: 'customer', amount: '50', currency: 'USD', paymentDirection: 'receive' };
    
    const result = calculateNewBalance(customer, payment);
    expect(result.newBalance).toBe(50);
    expect(result.balanceField).toBe('usd_balance');
  });
});
```

## **🔍 INTEGRATION TESTS**

### **End-to-End Payment Flow**

```typescript
describe('Payment Processing Integration', () => {
  test('Complete supplier payment flow', async () => {
    // Arrange
    const initialSupplierBalance = 1000;
    const paymentAmount = 300;
    const supplier = await createTestSupplier({ lb_balance: initialSupplierBalance });
    
    // Act
    const result = await processPayment({
      entityType: 'supplier',
      entityId: supplier.id,
      amount: paymentAmount.toString(),
      currency: 'LBP',
      paymentDirection: 'pay',
      storeId: 'test-store',
      createdBy: 'test-user'
    });
    
    // Assert
    expect(result.success).toBe(true);
    
    // Verify supplier balance decreased
    const updatedSupplier = await getSupplier(supplier.id);
    expect(updatedSupplier.lb_balance).toBe(700); // 1000 - 300 = 700
    
    // Verify transaction created
    const transactions = await getTransactionsBySupplier(supplier.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].category).toBe('Supplier Payment');
    expect(transactions[0].amount).toBe(300);
    
    // Verify cash drawer decreased
    const cashDrawer = await getCashDrawerAccount();
    expect(cashDrawer.current_balance).toBe(initialCashBalance - 300);
  });
});
```

## **🛡️ TEST-DRIVEN ERROR PREVENTION**

### **Red-Green-Refactor for Business Logic**

```typescript
// 1. RED - Write failing test first
test('Supplier payment should decrease balance', () => {
  const supplier = { lb_balance: 1000 };
  const result = processSupplierPayment(supplier, 300);
  expect(result.newBalance).toBe(700); // This will fail with buggy logic
});

// 2. GREEN - Fix the code to make test pass
const processSupplierPayment = (supplier, amount) => {
  // Fix: Use correct supplier logic
  return { newBalance: supplier.lb_balance - amount };
};

// 3. REFACTOR - Improve code while keeping tests green
const processSupplierPayment = (supplier, amount, direction) => {
  if (direction === 'pay') {
    return { newBalance: supplier.lb_balance - amount }; // We owe them less
  } else {
    return { newBalance: supplier.lb_balance + amount }; // They owe us less
  }
};
```

### **Property-Based Testing**

```typescript
describe('Payment Logic Properties', () => {
  test('Supplier payments always decrease balance when we pay', () => {
    // Generate random test data
    fc.assert(fc.property(
      fc.integer(0, 10000), // Initial balance
      fc.integer(1, 1000),  // Payment amount
      (initialBalance, paymentAmount) => {
        const supplier = { lb_balance: initialBalance };
        const result = processSupplierPayment(supplier, paymentAmount, 'pay');
        
        // Property: Balance should always decrease when we pay supplier
        expect(result.newBalance).toBeLessThan(initialBalance);
      }
    ));
  });
});
```

## **📊 TEST COVERAGE MATRIX**

### **Required Coverage**

| Entity | Direction | Currency | Balance State | Expected |
|--------|-----------|----------|---------------|----------|
| Customer | Receive | LBP | Positive | Decrease |
| Customer | Receive | USD | Positive | Decrease |
| Customer | Pay | LBP | Positive | Increase |
| Customer | Pay | USD | Positive | Increase |
| Supplier | Receive | LBP | Positive | Increase |
| Supplier | Receive | USD | Positive | Increase |
| Supplier | Pay | LBP | Positive | **Decrease** ⭐ |
| Supplier | Pay | USD | Positive | **Decrease** ⭐ |

**⭐ Critical tests that would have caught the bug**

## **🚨 REGRESSION PREVENTION**

### **Continuous Testing**

```typescript
// Add to CI/CD pipeline
describe('Critical Business Logic Regression Tests', () => {
  test('REGRESSION: Supplier payment decreases balance', () => {
    // This test prevents the bug from reoccurring
    const supplier = { lb_balance: 1000 };
    const result = calculateSupplierPayment(supplier, 300);
    
    // If this fails, the bug has returned!
    expect(result.newBalance).toBe(700);
    expect(result.newBalance).not.toBe(1300); // Explicitly test against bug
  });
});
```

### **Automated Balance Validation**

```typescript
const validateBalanceChange = (entity, oldBalance, newBalance, payment) => {
  const expectedDirection = getExpectedBalanceDirection(entity.type, payment.direction);
  const actualDirection = newBalance > oldBalance ? 'increase' : 'decrease';
  
  if (expectedDirection !== actualDirection) {
    throw new Error(`Balance change validation failed: Expected ${expectedDirection}, got ${actualDirection}`);
  }
};
```

## **🎯 TESTING BEST PRACTICES**

### **1. Test Business Rules, Not Implementation**
```typescript
// ✅ GOOD - Tests business rule
test('Paying supplier reduces our debt to them', () => {
  expect(paySupplier(1000, 300)).toBe(700);
});

// ❌ BAD - Tests implementation detail
test('Supplier payment subtracts amount from balance', () => {
  expect(balance - amount).toBe(expectedResult);
});
```

### **2. Use Descriptive Test Names**
```typescript
// ✅ GOOD - Clear business context
test('When we pay supplier 300 LBP, our debt to them decreases by 300 LBP', () => {});

// ❌ BAD - Technical but unclear
test('processPayment with supplier and pay direction', () => {});
```

### **3. Test Both Happy Path and Edge Cases**
```typescript
describe('Supplier Payments', () => {
  test('Normal payment reduces balance');
  test('Payment larger than balance creates negative balance');
  test('Zero payment leaves balance unchanged');
  test('Payment with currency conversion');
});
```

## **🎉 CONCLUSION**

These comprehensive tests would have **immediately caught the supplier balance bug** and prevented it from reaching production. 

**Implement similar tests for all business logic to prevent future errors!** 🛡️

---

**Testing Strategy**: Comprehensive business logic coverage  
**Error Prevention**: Red-Green-Refactor + Property-based testing  
**Regression Prevention**: Automated validation + CI/CD integration  
**Result**: ✅ **Business logic bugs caught early**  

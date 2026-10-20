/**
 * Utility functions for PrintedBills component
 */

export const formatDecimal = (value) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
};

export const formatCurrency = (amount) => `Rs. ${formatDecimal(amount)}`;

export const debugCreditChanges = (billNo, previousCredit, newCredit, source) => {
  console.log(`🔍 CREDIT DEBUG - Bill: ${billNo}`);
  console.log(`   Previous Credit: ${previousCredit}`);
  console.log(`   New Credit: ${newCredit}`);
  console.log(`   Source: ${source}`);
  console.log(`   Changed: ${previousCredit !== newCredit ? 'YES ⚠️' : 'NO ✓'}`);
  if (previousCredit !== newCredit) {
    console.trace('Credit change stack trace:');
  }
};

/**
 * Process bill data from API response
 * Groups bills by status and calculates totals
 */
export const processBillData = (salesData) => {
  if (!Array.isArray(salesData) || salesData.length === 0) {
    return { pendingBills: [], appliedBills: [] };
  }

  const pendingMap = {};
  const appliedMap = {};

  try {
    salesData
      .filter(s => s?.bill_printed === 'Y' && s?.bill_no)
      .forEach(sale => {
        try {
          const billNo = sale.bill_no;
          let paymentHistory = [];

          if (sale.payment_history) {
            try {
              paymentHistory = typeof sale.payment_history === 'string'
                ? JSON.parse(sale.payment_history)
                : sale.payment_history;
              if (!Array.isArray(paymentHistory)) paymentHistory = [];
            } catch (e) {
              console.warn(`Failed to parse payment history for bill ${billNo}:`, e);
              paymentHistory = [];
            }
          }

          let totalCreditAmount = 0;
          let totalCashPaid = 0;
          let totalGivenAmount = 0;

          paymentHistory.forEach(payment => {
            const amount = parseFloat(payment?.amount) || 0;
            totalGivenAmount += amount;

            if (payment?.method === 'Credit') {
              totalCreditAmount += amount;
            } else if (['Cash', 'Cheque', 'Bank Transfer'].includes(payment?.method)) {
              totalCashPaid += amount;
            }
          });

          const finalGivenAmount = totalGivenAmount;
          const finalCashPayments = totalCashPaid;
          const finalCreditAmount = totalCreditAmount;
          let finalRemainingCredit = totalCreditAmount;

          const isApplied = sale.given_amount_applied === 'Y';
          const targetMap = isApplied ? appliedMap : pendingMap;

          if (!targetMap[billNo]) {
            targetMap[billNo] = {
              billNo,
              customerCode: sale.customer_code || '',
              sales: [],
              totalAmount: 0,
              givenAmount: finalGivenAmount,
              cashPayments: finalCashPayments,
              creditAmount: finalCreditAmount,
              remainingCredit: finalRemainingCredit,
              givenAmountApplied: sale.given_amount_applied || 'N',
              paymentAdjustmentType: sale.payment_adjustment_type || null,
              createdAt: sale.created_at,
              chequeDetails: sale.cheq_no ? {
                cheq_no: sale.cheq_no,
                cheq_date: sale.cheq_date,
                bank_name: sale.bank_name
              } : null,
              transferDetails: sale.transfer_reference_no ? {
                reference_no: sale.transfer_reference_no,
                transfer_date: sale.transfer_date
              } : null,
              paymentHistory
            };
          }

          targetMap[billNo].sales.push(sale);
          targetMap[billNo].totalAmount += (parseFloat(sale.total) || 0) +
            ((parseFloat(sale.packs) || 0) * (parseFloat(sale.CustomerPackCost) || 0));
        } catch (itemError) {
          console.warn(`Error processing sale item:`, itemError);
        }
      });

    return {
      pendingBills: Object.values(pendingMap).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      ),
      appliedBills: Object.values(appliedMap).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      )
    };
  } catch (error) {
    console.error('Error processing bill data:', error);
    return { pendingBills: [], appliedBills: [] };
  }
};

/**
 * Get total received amount from payment history
 * Excludes credit payments as they represent debt
 */
export const getTotalReceived = (bill) => {
  if (!bill) return 0;

  try {
    let total = 0;
    const history = bill.paymentHistory || bill.payment_history;

    if (history) {
      let payments = typeof history === 'string' ? JSON.parse(history) : history;
      if (Array.isArray(payments)) {
        payments.forEach(p => {
          if (p?.method !== 'Credit') {
            total += parseFloat(p?.amount) || 0;
          }
        });
      }
    }
    return total;
  } catch (error) {
    console.warn('Error calculating total received:', error);
    return 0;
  }
};

/**
 * Get remaining bill amount based on section (pending/completed)
 */
export const getRemainingBillAmount = (bill, isAppliedSection = false) => {
  if (!bill) return 0;

  try {
    if (isAppliedSection) {
      // For completed section: show unsettled credit
      return bill.remainingCredit || 0;
    } else {
      // For pending section: show bill total - all payments
      let totalAllPayments = 0;
      const history = bill.paymentHistory || bill.payment_history;

      if (history) {
        let payments = typeof history === 'string' ? JSON.parse(history) : history;
        if (Array.isArray(payments)) {
          payments.forEach(p => {
            totalAllPayments += parseFloat(p?.amount) || 0;
          });
        }
      }
      return Math.max(0, bill.totalAmount - totalAllPayments);
    }
  } catch (error) {
    console.warn('Error calculating remaining amount:', error);
    return 0;
  }
};

/**
 * Get display remaining amount based on section
 */
export const getDisplayRemaining = (bill, isAppliedSection) => {
  if (!bill) return 0;

  if (isAppliedSection) {
    return bill.remainingCredit || 0;
  } else {
    let totalAllPayments = 0;
    const history = bill.paymentHistory || bill.payment_history;

    if (history) {
      let payments = typeof history === 'string' ? JSON.parse(history) : history;
      if (Array.isArray(payments)) {
        payments.forEach(p => {
          totalAllPayments += parseFloat(p?.amount) || 0;
        });
      }
    }
    return Math.max(0, bill.totalAmount - totalAllPayments);
  }
};

/**
 * Build full receipt HTML for printing
 */
export const buildFullReceiptHTML = (
  salesData,
  billNo,
  customerCode,
  mobile,
  globalLoanAmount = 0,
  givenAmount = 0,
  paymentMethod = 'cash',
  paymentDetails = null,
  billSize = '3inch',
  cashGivenAmount = 0
) => {
  try {
    const formatNumber = (num) => {
      if (typeof num !== 'number' && typeof num !== 'string') return '0';
      const number = parseFloat(num);
      if (isNaN(number)) return '0';
      if (Number.isInteger(number)) return number.toLocaleString('en-US');
      const parts = number.toFixed(2).split('.');
      const wholePart = parseInt(parts[0]).toLocaleString('en-US');
      return `${wholePart}.${parts[1]}`;
    };

    const date = new Date().toLocaleDateString();
    const time = new Date().toLocaleTimeString();
    const displayGivenAmount = cashGivenAmount > 0 ? cashGivenAmount : givenAmount;

    const totalSales = salesData.reduce(
      (sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseFloat(s.price_per_kg) || 0)),
      0
    );
    const totalPackCost = salesData.reduce(
      (sum, s) => sum + ((parseFloat(s.CustomerPackCost) || 0) * (parseFloat(s.packs) || 0)),
      0
    );
    const finalGrandTotal = totalSales + totalPackCost;
    const remaining = displayGivenAmount > 0 ? Math.abs(displayGivenAmount - finalGrandTotal) : 0;

    const itemsHtml = salesData
      .map(s => {
        const packs = parseInt(s.packs) || 0;
        const weight = parseFloat(s.weight) || 0;
        const price = parseFloat(s.price_per_kg) || 0;
        const value = (weight * price).toFixed(2);
        return `<tr><td style="padding:5px 0;">${s.item_name || ''}<br>${formatNumber(packs)}</td><td style="text-align:right;">${formatNumber(weight.toFixed(2))}</td><td style="text-align:right;">${formatNumber(price.toFixed(2))}</td><td style="text-align:right;">${s.supplier_code || 'ASW'}<br>${formatNumber(value)}</td></tr>`;
      })
      .join('');

    let paymentMethodDisplay = '';
    if (paymentMethod === 'cheque' && paymentDetails) {
      paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">💳 Cheque: ${paymentDetails.bank_name || 'Bank'} | No: ${paymentDetails.cheq_no}</div>`;
    } else if (paymentMethod === 'bank_to_bank' && paymentDetails) {
      paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">🏦 Bank Transfer: Ref: ${paymentDetails.reference_no}</div>`;
    } else if (paymentMethod === 'credit') {
      paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center; background:#fef3c7; padding:8px;">💳 CREDIT PAYMENT: Rs. ${(paymentDetails?.amount || 0).toFixed(2)}</div>`;
    } else {
      paymentMethodDisplay = `<div style="font-size:12px; margin-top:8px; text-align:center;">💰 Cash Payment</div>`;
    }

    const displayCode = customerCode ? customerCode.toUpperCase() : 'WALKING';

    return `
      <div style="width:350px; margin:0 auto; padding:10px; font-family: monospace;">
        <div style="text-align:center; font-weight:bold;">
          <div style="font-size:20px;">Manju Colombage Lanka (Pvt) Ltd</div>
          <div style="font-size:14px;">එළවළු,පළතුරු තොග වෙළෙන්දෝ</div>
          <div style="font-size:18px; margin:10px 0;">Bill No: ${billNo}</div>
          <div>Customer: ${displayCode}</div>
          <div>Date: ${date} | Time: ${time}</div>
        </div>
        <hr/>
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr><th>Item</th><th>Kg</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <hr/>
        <div><strong>Total: Rs. ${formatNumber(finalGrandTotal.toFixed(2))}</strong></div>
        <div>Paid: Rs. ${formatNumber(displayGivenAmount.toFixed(2))}</div>
        <div>Balance: Rs. ${formatNumber(remaining.toFixed(2))}</div>
        ${paymentMethodDisplay}
        <hr/>
        <div style="text-align:center; font-size:12px;">Thank you! Come again.</div>
      </div>
    `;
  } catch (error) {
    console.error('Error building receipt HTML:', error);
    return '<div>Error generating receipt</div>';
  }
};

/**
 * Create payment history entry
 */
export const createPaymentHistoryEntry = (
  paymentAmount,
  paymentMethod,
  totalGivenAmount,
  isFullySettled
) => {
  return {
    id: Math.random().toString(36).substr(2, 9),
    date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    amount: parseFloat(paymentAmount),
    method: paymentMethod,
    running_balance: parseFloat(totalGivenAmount),
    is_fully_paid: isFullySettled,
    reference: paymentMethod,
    details: {}
  };
};

/**
 * Safely parse JSON with fallback
 */
export const safeParseJSON = (data, fallback = []) => {
  try {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    if (Array.isArray(data)) {
      return data;
    }
    return fallback;
  } catch (error) {
    console.warn('Error parsing JSON:', error);
    return fallback;
  }
};

/**
 * Debounce function
 */
export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

/**
 * Throttle function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

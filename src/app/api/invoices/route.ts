import { NextResponse } from 'next/server';
import { getGoogleSheets, SPREADSHEET_ID, COLS } from '@/lib/google-sheets';

export async function GET() {
    try {
        const sheets = await getGoogleSheets();

        // Fetch all rows from the sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A2:Z', // Start from row 2 to skip headers
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return NextResponse.json({ suppliers: [], invoices: {} });
        }

        const suppliers = new Set<string>();
        const invoices: Record<string, any[]> = {};

        rows.forEach((row, index) => {
            const supplierName = row[COLS.SUPPLIER_NAME];
            const invoiceNumber = row[COLS.INVOICE_NUMBER];
            const status = row[COLS.PAYMENT_STATUS] || 'Open';
            const amountStr = row[COLS.AMOUNT] || '0';
            const remaining = parseFloat(amountStr.replace(/[^0-9.-]+/g, ""));

            // Only process valid rows
            if (!supplierName || !invoiceNumber) return;

            suppliers.add(supplierName);

            if (!invoices[supplierName]) {
                invoices[supplierName] = [];
            }

            // Calculate history out of custom columns
            const history = [];
            let originalTotalAmount = remaining;

            if (row[COLS.PARTIAL_PAYMENT_1]) {
                const amt = parseFloat(row[COLS.PARTIAL_PAYMENT_1]);
                originalTotalAmount += amt;
                history.push({ date: row[COLS.PARTIAL_PAYMENT_1_DATE] || 'Unknown', amount: amt });
            }
            if (row[COLS.PARTIAL_PAYMENT_2]) {
                const amt = parseFloat(row[COLS.PARTIAL_PAYMENT_2]);
                originalTotalAmount += amt;
                history.push({ date: row[COLS.PARTIAL_PAYMENT_2_DATE] || 'Unknown', amount: amt });
            }
            if (row[COLS.PARTIAL_PAYMENT_3]) {
                const amt = parseFloat(row[COLS.PARTIAL_PAYMENT_3]);
                originalTotalAmount += amt;
                history.push({ date: row[COLS.PARTIAL_PAYMENT_3_DATE] || 'Unknown', amount: amt });
            }
            if (row[COLS.PARTIAL_PAYMENT_4]) {
                const amt = parseFloat(row[COLS.PARTIAL_PAYMENT_4]);
                originalTotalAmount += amt;
                history.push({ date: row[COLS.PARTIAL_PAYMENT_4_DATE] || 'Unknown', amount: amt });
            }
            if (row[COLS.PARTIAL_PAYMENT_5]) {
                const amt = parseFloat(row[COLS.PARTIAL_PAYMENT_5]);
                originalTotalAmount += amt;
                history.push({ date: row[COLS.PARTIAL_PAYMENT_5_DATE] || 'Unknown', amount: amt });
            }

            invoices[supplierName].push({
                id: invoiceNumber,
                status: status,
                totalAmount: originalTotalAmount,
                remaining: remaining > 0 ? remaining : 0,
                history,
                lastPaymentDate: row[COLS.PAYMENT_DATE] || null,
                rowIndex: index + 2 // +2 because array is 0-indexed and sheet starts at row 2
            });
        });

        return NextResponse.json({
            suppliers: Array.from(suppliers).sort(),
            invoices
        });

    } catch (error: any) {
        console.error("Error fetching invoices:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

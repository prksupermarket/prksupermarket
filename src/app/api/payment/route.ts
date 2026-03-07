import { NextResponse } from 'next/server';
import { getGoogleSheets, SPREADSHEET_ID, COLS } from '@/lib/google-sheets';
import { format } from 'date-fns';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { supplier, invoiceId, rowIndex, amountRaw, isPartialMode } = body;

        const amountToPay = parseFloat(amountRaw);
        if (!supplier || !invoiceId || !rowIndex || isNaN(amountToPay)) {
            return NextResponse.json({ error: "Missing required fields or invalid amount" }, { status: 400 });
        }

        const sheets = await getGoogleSheets();

        // 1. Fetch the specific row to check its current state (preventing race conditions)
        const range = `Sheet1!A${rowIndex}:Z${rowIndex}`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });

        const row = response.data.values?.[0];
        if (!row) {
            return NextResponse.json({ error: "Invoice not found in sheet" }, { status: 404 });
        }

        // Safety Check: Is it already fully paid?
        if (row[COLS.PAYMENT_STATUS] === 'Fully Paid') {
            return NextResponse.json({
                error: "DUPLICATE_PAYMENT",
                message: "This invoice is already Fully Paid!"
            }, { status: 409 });
        }

        const todayDate = format(new Date(), 'dd-MMM-yy');

        // We need to prepare the exact updates for this row.
        // Google Sheets API update requires an array of arrays representing the cells.
        // Instead of updating the whole row, we'll fetch existing and merge.

        // Ensure the row array is long enough 
        while (row.length <= COLS.PARTIAL_PAYMENT_5_DATE) {
            row.push("");
        }

        // Deduct from the main Amount cell so the Google Sheet reflects the remaining balance
        const currentAmount = parseFloat(row[COLS.AMOUNT]?.replace(/[^0-9.-]+/g, "") || "0");
        const newRemaining = Math.max(0, currentAmount - amountToPay);
        row[COLS.AMOUNT] = newRemaining.toString();

        if (!isPartialMode) {
            // --- FULL PAYMENT LOGIC ---
            row[COLS.PAYMENT_STATUS] = 'Fully Paid';
            row[COLS.PAYMENT_DATE] = todayDate;
            // We don't overwrite partials in case they want a history of how it got fully paid
        } else {
            // --- PARTIAL PAYMENT LOGIC ---
            // If this partial payment clears the balance, mark it fully paid.
            row[COLS.PAYMENT_STATUS] = newRemaining === 0 ? 'Fully Paid' : 'Partially Paid';
            row[COLS.PAYMENT_DATE] = todayDate; // Update last activity date

            // Shift logic: Find the next available partial slot
            if (!row[COLS.PARTIAL_PAYMENT_1]) {
                row[COLS.PARTIAL_PAYMENT_1] = amountToPay.toString();
                row[COLS.PARTIAL_PAYMENT_1_DATE] = todayDate;
            } else if (!row[COLS.PARTIAL_PAYMENT_2]) {
                row[COLS.PARTIAL_PAYMENT_2] = amountToPay.toString();
                row[COLS.PARTIAL_PAYMENT_2_DATE] = todayDate;
            } else if (!row[COLS.PARTIAL_PAYMENT_3]) {
                row[COLS.PARTIAL_PAYMENT_3] = amountToPay.toString();
                row[COLS.PARTIAL_PAYMENT_3_DATE] = todayDate;
            } else if (!row[COLS.PARTIAL_PAYMENT_4]) {
                row[COLS.PARTIAL_PAYMENT_4] = amountToPay.toString();
                row[COLS.PARTIAL_PAYMENT_4_DATE] = todayDate;
            } else if (!row[COLS.PARTIAL_PAYMENT_5]) {
                row[COLS.PARTIAL_PAYMENT_5] = amountToPay.toString();
                row[COLS.PARTIAL_PAYMENT_5_DATE] = todayDate;
            } else {
                return NextResponse.json({
                    error: "MAX_PARTIALS",
                    message: "Maximum of 5 partial payments reached."
                }, { status: 400 });
            }
        }

        // 2. Write the updated row back to Google Sheets
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED', // Evaluates numbers as numbers, not text
            requestBody: {
                values: [row]
            }
        });

        return NextResponse.json({ success: true, newStatus: row[COLS.PAYMENT_STATUS] });

    } catch (error: any) {
        console.error("Error updating payment:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

import { google } from 'googleapis';

export async function getGoogleSheets() {
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
}

export const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

// Column Indices (Based on actual Google Sheet headers we found)
export const COLS = {
    SUPPLIER_NAME: 1,    // B
    INVOICE_NUMBER: 3,   // D
    AMOUNT: 5,           // F - Original invoice amount (never modified)
    BALANCE: 6,          // G - Remaining balance (updated on payments)
    PAYMENT_STATUS: 8,   // I
    PAYMENT_DATE: 10,    // K
    PARTIAL_PAYMENT_1: 11, // L
    PARTIAL_PAYMENT_1_DATE: 12, // M
    PARTIAL_PAYMENT_2: 13, // N
    PARTIAL_PAYMENT_2_DATE: 14, // O
    PARTIAL_PAYMENT_3: 15, // P
    PARTIAL_PAYMENT_3_DATE: 16, // Q
    PARTIAL_PAYMENT_4: 17, // R
    PARTIAL_PAYMENT_4_DATE: 18, // S
    PARTIAL_PAYMENT_5: 19, // T
    PARTIAL_PAYMENT_5_DATE: 20  // U
};

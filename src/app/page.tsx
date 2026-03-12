"use client";

import { useState, useEffect } from "react";
import { Search, AlertCircle, CheckCircle2, ChevronLeft, IndianRupee } from "lucide-react";

type Invoice = {
    id: string;
    status: string;
    totalAmount: number;
    remaining: number;
    history: { date: string; amount: number; paymentMode?: string }[];
    lastPaymentDate: string | null;
    paymentMode?: string;
    rowIndex: number;
};

type Step = "LOOKUP" | "SUCCESS";

export default function Home() {
    const [step, setStep] = useState<Step>("LOOKUP");

    const [suppliers, setSuppliers] = useState<string[]>([]);
    const [invoicesBySupplier, setInvoicesBySupplier] = useState<Record<string, Invoice[]>>({});
    const [invoiceIdCounts, setInvoiceIdCounts] = useState<Record<string, number>>({});
    const [isInitializing, setIsInitializing] = useState(true);

    const [supplier, setSupplier] = useState<string>("");
    const [invoiceId, setInvoiceId] = useState<string>("");
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [partialAmount, setPartialAmount] = useState<string>("");
    const [isPartial, setIsPartial] = useState(false);
    const [activeAction, setActiveAction] = useState<"FULL" | "PARTIAL" | null>(null);
    const [paymentMode, setPaymentMode] = useState<string>("");
    const [errorMessage, setErrorMessage] = useState("");

    useEffect(() => {
        fetchInvoices();
    }, []);

    useEffect(() => {
        // Pre-calculate counts for all invoice IDs to optimize duplicate checking
        const counts: Record<string, number> = {};
        Object.values(invoicesBySupplier).flat().forEach(inv => {
            counts[inv.id] = (counts[inv.id] || 0) + 1;
        });
        setInvoiceIdCounts(counts);
    }, [invoicesBySupplier]);

    const fetchInvoices = async () => {
        setIsInitializing(true);
        try {
            const res = await fetch('/api/invoices');
            const data = await res.json();
            setSuppliers(data.suppliers || []);
            setInvoicesBySupplier(data.invoices || {});
        } catch (e) {
            console.error("Failed to load sheet data", e);
        } finally {
            setIsInitializing(false);
        }
    };

    const selectedInvoice = invoicesBySupplier[supplier]?.find(i => i.rowIndex === selectedRowIndex);


    // Finds the globally 'first' occurrence of an ID (lowest rowIndex)
    const getFirstOccurrence = (id: string) => {
        let first: { supplierName: string; invoice: Invoice } | null = null;
        for (const [sName, invList] of Object.entries(invoicesBySupplier)) {
            for (const inv of invList) {
                if (inv.id === id) {
                    if (!first || inv.rowIndex < first.invoice.rowIndex) {
                        first = { supplierName: sName, invoice: inv };
                    }
                }
            }
        }
        return first;
    };

    const handleInvoiceSelect = (rIndex: number) => {
        const inv = Object.values(invoicesBySupplier).flat().find(i => i.rowIndex === rIndex);
        if (!inv) return;

        setSelectedRowIndex(rIndex);
        setInvoiceId(inv.id);
        setActiveAction(null);
        setPaymentMode("");
        setErrorMessage("");

        // 1. First-Come-First-Served Duplicate Check
        const firstOccur = getFirstOccurrence(inv.id);

        // If this IS NOT the first occurrence in the sheet, it's a BLOCKED duplicate
        if (firstOccur && inv.rowIndex > firstOccur.invoice.rowIndex) {
            const lastDate = firstOccur.invoice.lastPaymentDate || firstOccur.invoice.history?.[firstOccur.invoice.history.length - 1]?.date || "No date recorded";
            const amountPaid = firstOccur.invoice.history.reduce((sum, h) => sum + h.amount, 0);

            // Format date to include day of week if possible
            let formattedDate = lastDate;
            try {
                const dateParts = lastDate.split('-'); // 07-Mar-26
                if (dateParts.length === 3) {
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    const monthIdx = months.indexOf(dateParts[1]);
                    const year = 2000 + parseInt(dateParts[2]);
                    const day = parseInt(dateParts[0]);
                    if (monthIdx !== -1) {
                        const dateObj = new Date(year, monthIdx, day);
                        const dayOfWeek = dateObj.toLocaleDateString('en-IN', { weekday: 'long' });
                        formattedDate = `${lastDate} (${dayOfWeek})`;
                    }
                }
            } catch (e) { console.error("Date formatting failed", e); }

            setErrorMessage(`❌ DUPLICATE DETECTED: An original entry for this invoice already exists in Row ${firstOccur.invoice.rowIndex} under "${firstOccur.supplierName}" with status ${firstOccur.invoice.status} of Amount ₹${amountPaid.toLocaleString('en-IN')} on ${formattedDate} and the remaining balance is ₹${firstOccur.invoice.remaining.toLocaleString('en-IN')}`);
            return;
        }

        // 2. Local Safety Check
        if (inv.status === "Fully Paid") {
            const lastDate = inv.lastPaymentDate || inv.history?.[inv.history.length - 1]?.date || "No date recorded";
            setErrorMessage(`STOP: This invoice is already fully paid on ${lastDate}!`);
            return;
        }

        // 3. AUTO-ADVANCE removed as requested for single-page layout
        setErrorMessage("");
    };

    const handlePayment = async (selectedMode: string, isPartialMode: boolean) => {
        if (!selectedInvoice) return;

        if (isPartialMode && (!partialAmount || Number(partialAmount) <= 0 || Number(partialAmount) > selectedInvoice.remaining)) {
            setErrorMessage(`Please enter a valid partial amount. Maximum is ₹${selectedInvoice.remaining}`);
            return;
        }

        setIsPartial(isPartialMode);
        setPaymentMode(selectedMode);
        setIsLoading(true);
        setErrorMessage("");

        try {
            const res = await fetch('/api/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier,
                    invoiceId,
                    rowIndex: selectedInvoice.rowIndex,
                    amountRaw: isPartialMode ? partialAmount : selectedInvoice.remaining,
                    isPartialMode: isPartialMode,
                    paymentMode: selectedMode
                })
            });

            const result = await res.json();

            if (!res.ok) {
                setErrorMessage(result.message || "An error occurred with the payment.");
                setIsLoading(false);
                return;
            }

            setStep("SUCCESS");
        } catch (e) {
            console.error(e);
            setErrorMessage("Network error. Please try again.");
            setIsLoading(false);
        }
    };

    const [currentTime, setCurrentTime] = useState<Date | null>(null);

    useEffect(() => {
        if (step === "SUCCESS") {
            setCurrentTime(new Date());
        }
    }, [step]);

    const reset = () => {
        setStep("LOOKUP");
        setSupplier("");
        setInvoiceId("");
        setSelectedRowIndex(null);
        setPartialAmount("");
        setIsPartial(false);
        setActiveAction(null);
        setPaymentMode("");
        setIsLoading(false);
        setErrorMessage("");
        setCurrentTime(null);
        fetchInvoices(); // Refresh data from sheet
    };

    if (isInitializing) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                <p className="text-xl font-bold text-slate-600 animate-pulse">Loading Google Sheet...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* ERROR BANNER */}
            {errorMessage && (
                <div className={`text-white p-6 rounded-3xl shadow-2xl border-4 animate-in slide-in-from-top flex items-start gap-4 mb-8 ${errorMessage.includes('❌') ? 'bg-black border-red-600 ring-8 ring-red-900/50' : 'bg-red-600 border-red-700'}`} style={{ minHeight: "120px" }}>
                    <AlertCircle size={60} className="shrink-0 mt-1" />
                    <div>
                        <h3 className="text-2xl font-black uppercase mb-1">{errorMessage.includes('❌') ? '!!! CRITICAL ERROR !!!' : 'Warning'}</h3>
                        <p className="text-2xl font-bold leading-tight">{errorMessage}</p>
                    </div>
                </div>
            )}

            {/* STEP 1: LOOKUP */}
            {step === "LOOKUP" && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                    <div className="space-y-8">
                        <div className="space-y-3">
                            <label htmlFor="supplier" className="block text-2xl font-bold text-slate-700">Supplier Name</label>
                            <select
                                id="supplier"
                                value={supplier}
                                onChange={(e) => {
                                    setSupplier(e.target.value);
                                    setInvoiceId("");
                                    setSelectedRowIndex(null);
                                    setErrorMessage("");
                                }}
                                className="w-full p-5 text-2xl bg-slate-50 border-2 border-slate-300 rounded-2xl focus:border-blue-500 focus:ring-4 focus:ring-blue-200 transition-all appearance-none font-bold"
                                style={{ minHeight: "80px" }}
                            >
                                <option value="" disabled>Select Supplier...</option>
                                {suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {supplier && (
                            <div className="space-y-3 animate-in slide-in-from-top-4 duration-300">
                                <label htmlFor="invoice" className="block text-2xl font-bold text-slate-700">Invoice Number</label>
                                <select
                                    id="invoice"
                                    value={selectedRowIndex || ""}
                                    onChange={(e) => handleInvoiceSelect(Number(e.target.value))}
                                    className={`w-full p-5 text-2xl bg-slate-50 border-2 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all appearance-none font-bold ${(() => {
                                        const cur = selectedInvoice;
                                        if (!cur) return 'border-blue-500 text-blue-800';
                                        const first = getFirstOccurrence(cur.id);
                                        return first && cur.rowIndex > first.invoice.rowIndex ? 'border-red-400 text-red-700 bg-red-50' : 'border-blue-500 text-blue-800';
                                    })()}`}
                                    style={{ minHeight: "80px" }}
                                >
                                    <option value="" disabled>Select Invoice...</option>
                                    {invoicesBySupplier[supplier]
                                        ?.filter(inv => inv.status !== "Fully Paid")
                                        .sort((a, b) => a.rowIndex - b.rowIndex) // Sort chronologically
                                        .map((inv) => {
                                            const first = getFirstOccurrence(inv.id);
                                            const isDuplicate = first && inv.rowIndex > first.invoice.rowIndex;
                                            return (
                                                <option
                                                    key={`${inv.id}-${inv.rowIndex}`}
                                                    value={inv.rowIndex}
                                                    className={isDuplicate ? "text-red-600 bg-red-50" : ""}
                                                >
                                                    {inv.id} ({inv.status}) {isDuplicate ? "• DUPLICATE of Row " + first.invoice.rowIndex : ""}
                                                </option>
                                            );
                                        })}
                                </select>
                            </div>
                        )}

                        {supplier && invoiceId && selectedInvoice && !errorMessage.includes('❌') && (
                            <div className="p-6 rounded-3xl mt-4 border-2 animate-in fade-in zoom-in-95 duration-300 bg-blue-50 border-blue-200">
                                <div className="space-y-4">
                                    <div className="flex items-center flex-wrap gap-x-4 gap-y-2 border-b border-slate-200 pb-3">
                                        <p className="text-xl text-slate-700 font-black">Total: ₹{selectedInvoice.totalAmount.toLocaleString('en-IN')}</p>
                                        {selectedInvoice.remaining > 0 && (
                                            <>
                                                <span className="text-slate-300 text-xl font-light leading-none hidden sm:inline">|</span>
                                                <p className="text-xl text-blue-700 font-black">Balance: ₹{selectedInvoice.remaining.toLocaleString('en-IN')}</p>
                                            </>
                                        )}
                                    </div>

                                    {selectedInvoice.history && selectedInvoice.history.length > 0 && (
                                        <div className="space-y-1">
                                            {selectedInvoice.history.map((h, i) => (
                                                <div key={i} className="text-lg text-slate-600 font-medium">
                                                    Partial Payment {i + 1} - ₹{h.amount.toLocaleString('en-IN')} paid on {h.date} {h.paymentMode ? `(via ${h.paymentMode})` : ''}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Inline Payment Controls - Highlighted */}
                                    <div className="pt-6 mt-4 border-t-2 border-slate-200 space-y-4 bg-slate-50/50 -mx-6 px-6 pb-6 rounded-b-[24px]">
                                        <div className="grid grid-cols-2 gap-4 items-start">
                                            {/* FULL PAYMENT COLUMN */}
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => { setActiveAction(activeAction === "FULL" ? null : "FULL"); setErrorMessage(""); }}
                                                    disabled={isLoading}
                                                    className={`hover:bg-green-700 text-white py-5 px-4 text-2xl font-black shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 z-10 relative ${activeAction === "FULL" ? "bg-green-700 rounded-t-2xl" : "bg-green-600 rounded-2xl"}`}
                                                >
                                                    Pay Full
                                                </button>

                                                {activeAction === "FULL" && (
                                                    <div className="p-3 bg-white border-x-2 border-b-2 border-green-700 rounded-b-2xl space-y-2 animate-in slide-in-from-top-2 shadow-xl -mt-1 pt-4">
                                                        {[{ id: 'PhonePe', bg: 'bg-[#5f259f] hover:bg-[#4a1c7d] text-white' },
                                                        { id: 'Bank Transfer', bg: 'bg-blue-600 hover:bg-blue-700 text-white' },
                                                        { id: 'Cash Payment', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' }].map(m => (
                                                            <button
                                                                key={m.id}
                                                                onClick={() => handlePayment(m.id, false)}
                                                                disabled={isLoading}
                                                                className={`w-full p-3 rounded-xl text-lg font-bold transition shadow-sm border-b-4 border-black/20 active:border-b-0 active:translate-y-1 ${m.bg}`}
                                                            >
                                                                {m.id}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* PARTIAL PAYMENT COLUMN */}
                                            <div className="flex flex-col">
                                                <button
                                                    onClick={() => { setActiveAction(activeAction === "PARTIAL" ? null : "PARTIAL"); setErrorMessage(""); }}
                                                    disabled={isLoading}
                                                    className={`hover:bg-yellow-600 text-white py-5 px-4 text-2xl font-black shadow-lg active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 z-10 relative ${activeAction === "PARTIAL" ? "bg-yellow-600 rounded-2xl ring-4 ring-yellow-300 shadow-yellow-500/50 scale-105" : "bg-yellow-500 rounded-2xl"}`}
                                                >
                                                    Partial
                                                </button>
                                            </div>
                                        </div>

                                        {/* FULL WIDTH PARTIAL AREA */}
                                        {activeAction === "PARTIAL" && (
                                            <div className="p-5 bg-white border-4 border-yellow-500 rounded-3xl space-y-5 animate-in fade-in slide-in-from-top-4 shadow-2xl mt-6">
                                                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl shadow-inner">
                                                    <div className="relative">
                                                        <IndianRupee className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500" size={32} />
                                                        <input
                                                            type="number"
                                                            value={partialAmount}
                                                            onChange={(e) => setPartialAmount(e.target.value)}
                                                            placeholder="Amount"
                                                            className="w-full py-6 pl-16 pr-4 text-4xl font-black bg-transparent outline-none text-slate-800 placeholder:text-slate-300 transition-all tracking-tight"
                                                        />
                                                    </div>
                                                </div>

                                                {partialAmount && Number(partialAmount) > selectedInvoice.remaining && (
                                                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl animate-in fade-in slide-in-from-top-1">
                                                        <p className="text-base font-bold text-red-600 text-center">
                                                            Amount exceeds balance (₹{selectedInvoice.remaining.toLocaleString('en-IN')})
                                                        </p>
                                                    </div>
                                                )}

                                                {partialAmount && Number(partialAmount) > 0 && Number(partialAmount) <= selectedInvoice.remaining && (
                                                    <div className="space-y-4 pt-4 border-t-2 border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
                                                        {Number(partialAmount) >= 100000 && (
                                                            <div className="text-center pb-2">
                                                                <span className="text-base font-black text-yellow-800 bg-yellow-100 px-5 py-2.5 rounded-full shadow-sm">
                                                                    Paying - {parseFloat((Number(partialAmount) / 100000).toFixed(2))} Lakh Rupees
                                                                </span>
                                                            </div>
                                                        )}
                                                        <p className="text-xs font-black text-slate-400 text-center uppercase tracking-widest pb-1">Select Mode to Pay</p>
                                                        <div className="grid gap-3">
                                                            {[{ id: 'PhonePe', bg: 'bg-[#5f259f] hover:bg-[#4a1c7d] text-white' },
                                                            { id: 'Bank Transfer', bg: 'bg-blue-600 hover:bg-blue-700 text-white' },
                                                            { id: 'Cash Payment', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' }].map(m => (
                                                                <button
                                                                    key={m.id}
                                                                    disabled={isLoading}
                                                                    onClick={() => handlePayment(m.id, true)}
                                                                    className={`w-full p-4 rounded-2xl text-xl font-bold transition shadow-sm border-b-4 border-black/20 active:border-b-0 active:translate-y-1 ${m.bg}`}
                                                                >
                                                                    {m.id}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* STEP 3: SUCCESS */}
            {step === "SUCCESS" && (
                <div className="bg-green-500 p-8 rounded-3xl shadow-xl border-4 border-green-600 animate-in zoom-in duration-500 text-center text-white flex flex-col items-center justify-center space-y-8 min-h-[60vh]">
                    <CheckCircle2 size={120} className="text-white animate-bounce" />
                    <h2 className="text-5xl font-black mb-4">Success!</h2>
                    <p className="text-3xl font-medium">
                        {isPartial ? "Partial Payment Recorded" : "Fully Paid!"}
                    </p>
                    {paymentMode && (
                        <p className="text-2xl font-bold bg-white/20 px-6 py-2 rounded-full inline-block mt-4">
                            Paid via {paymentMode}
                        </p>
                    )}
                    <div className="bg-green-600 rounded-2xl p-6 w-full text-left space-y-2 mt-8">
                        {currentTime && (
                            <div className="border-b border-green-500 pb-4 mb-4">
                                <p className="text-xl opacity-90">Payment Date & Time:</p>
                                <p className="text-3xl font-black">
                                    {currentTime.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                                <p className="text-2xl font-bold opacity-90">
                                    {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </p>
                            </div>
                        )}

                        <p className="text-xl mb-2">Invoice: <strong>{invoiceId}</strong></p>
                        <p className="text-xl mb-2">Amount Paid: <strong>₹{isPartial ? Number(partialAmount).toLocaleString('en-IN') : selectedInvoice?.remaining.toLocaleString('en-IN')}</strong></p>

                        {isPartial && selectedInvoice && (
                            <>
                                <p className="text-xl mb-4">New Remaining Balance: <strong>₹{(selectedInvoice.remaining - Number(partialAmount)).toLocaleString('en-IN')}</strong></p>

                                {selectedInvoice.history && selectedInvoice.history.length > 0 && (
                                    <div className="mt-4 border-t border-green-500 pt-4">
                                        <p className="text-lg font-bold mb-2">Previous Payments History:</p>
                                        {selectedInvoice.history.map((h, i) => (
                                            <p key={i} className="text-lg text-green-100 mb-1">Paid ₹{h.amount.toLocaleString('en-IN')} on {h.date} {h.paymentMode ? `(via ${h.paymentMode})` : ''}</p>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <button onClick={reset} className="w-full bg-white text-green-700 hover:bg-green-50 p-6 rounded-2xl text-3xl font-bold shadow-lg active:scale-95 mt-12" style={{ minHeight: "100px" }}>
                        Make Another Payment
                    </button>
                </div>
            )}
        </div>
    );
}

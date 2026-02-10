import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import logo from '../../../public/cvk-logo.jpeg';
import turkeyInvoiceApi from "../../Api/turkeyInvoice.api";
import toast from "react-hot-toast";
import { InvoiceTemplate } from "../../components";
import html2pdf from 'html2pdf.js';

export default function CVKInvoiceView({ invoiceData }) {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(!invoiceData);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [paginatedData, setPaginatedData] = useState([]);
  const invoiceRef = useRef(null);
  const ROWS_PER_PAGE = 38;

  const isPdfDownload = location.pathname.includes("/download-pdf");

  useEffect(() => {
    if (invoiceData) {
      console.log("✅ Using invoiceData prop:", invoiceData);
      const transformed = transformInvoiceData(invoiceData);
      console.log("✅ Transformed data:", transformed);
      setInvoice(transformed);
      setLoading(false);
    } else if (invoiceId) {
      fetchInvoiceData();
    } else {
      setError("No invoice identifier provided");
      setLoading(false);
    }
  }, [invoiceData, invoiceId]);

   useEffect(() => {
      console.log("this is path",isPdfDownload);
      
    if (
      isPdfDownload &&
      invoice 
      
    ) {
      const timer = setTimeout(async () => {
        await handleDownloadPDF();
  
        // Redirect after download
        navigate("/invoices", { replace: true });
      }, 800); // slight delay for render safety
  
      return () => clearTimeout(timer);
    }
  }, [isPdfDownload, invoice]);
  

  const fetchInvoiceData = async () => {
    try {
      setLoading(true);
      const response = await turkeyInvoiceApi.getInvoiceById(invoiceId);

      let data = response.data || response;

      if (data.data && typeof data.data === 'object') {
        data = data.data;
        if (data.data && typeof data.data === 'object') {
          data = data.data;
        }
      }

      const transformed = transformInvoiceData(data);
      setInvoice(transformed);
    } catch (err) {
      console.error("❌ Error fetching invoice:", err);
      setError(err.message || "Failed to load invoice data");
      toast.error("Failed to load invoice");
    } finally {
      setLoading(false);
    }
  };


 const transformInvoiceData = (data) => {
    console.log("🔄 Transforming data:", data);

    if (!data) {
      console.error("❌ No data to transform");
      return null;
    }

    const accommodationDetails = data.accommodationDetails || [];
    const otherServices = data.otherServices || [];
    const transactions = [];

    // Pre-convert to Numbers to prevent precision errors
    const exchangeRate = Number(data.exchangeRate) || 1;
    const actualRate = Number(data.actualRate) || 0;

    // Accommodation details (10% VAT)
    accommodationDetails.forEach((acc) => {
      const roomRate = Number(acc.rate) || 0;
      const vatAmount = roomRate * 0.1;
      const accTax = roomRate * 0.02;

      transactions.push({
        description: "Accommodation Package",
        foreignAmount: `${actualRate.toFixed(2)} EUR / ${exchangeRate.toFixed(5)}`,
        date: formatDate(acc.date),
        rawDate: acc.date, 
        debit: formatCurrency(roomRate),
        credit: "",
        vatRate: 10
      });

      transactions.push({
        description: "VAT %10",
        foreignAmount: "",
        date: formatDate(acc.date),
        rawDate: acc.date, 
        debit: formatCurrency(vatAmount),
        credit: "",
        vatRate: 10
      });

      transactions.push({
        description: "Accommodation TAX",
        foreignAmount: "",
        date: formatDate(acc.date),
        rawDate: acc.date, 
        debit: formatCurrency(accTax),
        credit: "",
        vatRate: 10
      });
    });

    // Other services (20% VAT)
    otherServices.forEach(service => {
      const serviceAmount = Number(service.amount) || 0;
      transactions.push({
        description: service.name || "Service",
        foreignAmount: "",
        date: formatDate(service.date),
        rawDate: service.date, 
        debit: formatCurrency(serviceAmount),
        credit: "",
        vatRate: 20
      });
    });

    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.rawDate || 0) - new Date(b.rawDate || 0));

    // Calculate totals using Number() to avoid the "long string" bug
    const accommodationSubTotal = Number(data.subTotal) || 0;
    const accommodationVAT = Number(data.vat_total_nights) || 0;
    const totalAccTax = Number(data.acc_tax_total_nights) || 0;

    const otherServicesTotal = otherServices.reduce((sum, service) => sum + (Number(service.amount) || 0), 0);
    const otherServicesBase = otherServicesTotal / 1.2;
    const otherServicesVAT = otherServicesTotal - otherServicesBase;

    // The core fix: Summing numbers first, then rounding to 2 decimals
    const totalBase = Number((accommodationSubTotal + (otherServicesTotal > 0 ? otherServicesBase : 0)).toFixed(2));
    const totalVAT = Number((accommodationVAT + (otherServicesTotal > 0 ? otherServicesVAT : 0)).toFixed(2));
    const totalIncVat = Number((accommodationSubTotal + accommodationVAT + totalAccTax + otherServicesTotal).toFixed(2));

    const transformed = {
      companyName: "Azar Tourism Services",
      companyAddress: "Algeria Square Building Number 12 First Floor,",
      companyCity: "Tripoli, Libya.",
      vd: data.vd || "",
      vno: data.vNo || "",
      refNo: data.referenceNo,
      guestName: data.guestName || "Guest",
      roomNo: data.roomNo || "",
      folioNo: data.folio_number || "",
      arrivalDate: formatDate(data.arrivalDate),
      departureDate: formatDate(data.departureDate),
      adults: String(data.paxAdult || 1),
      children: String(data.paxChild || 0),
      passportNo: data.passportNo || "",
      crsNo: data.voucherNo || "",
      user: data.userId || "",
      cashNo: data.batchNo || "",
      pageNo: "1",
      invoiceDate: formatDate(data.invoiceDate),
      transactions: transactions,
      taxTable: [
        {
          rate: "%10",
          base: formatCurrency(accommodationSubTotal),
          amount: formatCurrency(accommodationVAT)
        },
        ...(otherServicesTotal > 0 ? [{
          rate: "%20",
          base: formatCurrency(otherServicesBase),
          amount: formatCurrency(otherServicesVAT)
        }] : [])
      ],
      exchangeRate: `${exchangeRate.toFixed(5)} TRY`,
      totalInEUR: `${(totalIncVat / exchangeRate).toFixed(2)} EUR`,
      totalAmount: formatCurrency(totalBase),
      taxableAmount: formatCurrency(totalBase),
      totalVAT: formatCurrency(totalVAT),
      totalAccTax: formatCurrency(totalAccTax),
      totalIncVat: formatCurrency(totalIncVat),
      directBilling: formatCurrency(-totalIncVat),
      balance: "0.00",
      hasOtherServices: otherServicesTotal > 0
    };

    console.log("✅ Transformation complete:", transformed);
    return transformed;
  };
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}.${month}.${year}`;
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount) || 0;
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  useEffect(() => {
    if (invoice && invoice.transactions) {
      const pages = [];
      const totalTransactions = invoice.transactions.length;

      for (let i = 0; i < totalTransactions; i += ROWS_PER_PAGE) {
        pages.push({
          transactions: invoice.transactions.slice(i, i + ROWS_PER_PAGE),
          pageNum: pages.length + 1,
          isLastPage: i + ROWS_PER_PAGE >= totalTransactions
        });
      }

      if (pages.length === 0) {
        pages.push({
          transactions: [],
          pageNum: 1,
          isLastPage: true
        });
      }

      setPaginatedData(pages);
    }
  }, [invoice]);

  const handleDownloadPDF = async () => {
    if (!invoiceRef.current) return;
    setPdfLoading(true);

    // 1. Style Guard (Tailwind v4 Bypass)
    const headStyles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
    headStyles.forEach(style => {
      style.parentNode.removeChild(style);
    });

    try {
      // 3. Image Loading Verification
      const images = invoiceRef.current.querySelectorAll('img');
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // Small delay to ensure layout is settled
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2 & 4. Targeting and Smart Pagination
      const element = invoiceRef.current;
      const opt = {
        margin: 0,
        filename: `${invoice.refNo}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          scrollY: 0,
          windowWidth: 794
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      // Generate PDF
      await html2pdf().set(opt).from(element).save();
      toast.success("PDF Downloaded Successfully");
    } catch (err) {
      console.error("❌ PDF Error:", err);
      toast.error("Failed to generate PDF");
    } finally {
      // 5. Instant Recovery (Styles Restore)
      headStyles.forEach(style => {
        document.head.appendChild(style);
      });
      setPdfLoading(false);
    }
  };

  const handlePrint = () => window.print();

  if (!invoice) {
    return (
      <InvoiceTemplate
        loading={loading}
        error={error}
        invoice={invoice}
        pdfLoading={pdfLoading}
        onDownloadPDF={handleDownloadPDF}
        onPrint={handlePrint}
        onBack={() => navigate("/invoices")}
      >
        <></>
      </InvoiceTemplate>
    );
  }

  return (
    <InvoiceTemplate
      loading={loading}
      error={error}
      invoice={invoice}
      pdfLoading={pdfLoading}
      onDownloadPDF={handleDownloadPDF}
      onPrint={handlePrint}
      onBack={() => navigate("/invoices")}
    >
      <style>{`
        @page { size: A4; margin: 0; }
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; font-size: 8.9px; }

        .invoice-page {
          background-color: white;
          width: 100%;
          max-width: 794px;
          min-height: 296mm;
          margin: 0 auto;
          padding: 40px 30px;
          color: #000;
          position: relative;
          box-sizing: border-box;
          page-break-inside: avoid;
          page-break-after: always;
          
        }

        .invoice-page:last-child {
          page-break-after: auto;
        }

        .header { margin-bottom: 14px; }
        .logo-box { margin-bottom: 20px; }
        .logo-img { max-width: 180px; height: auto; }
        .company-address { margin-bottom: 8px; }
        
        .info-row { display: flex; align-items: flex-start; }
        .info-lbl { display: inline-block; white-space: nowrap; }
        .info-sep { padding: 0 4px 0 2px; }

        .meta-container { display: flex; justify-content: space-between; margin-bottom: 5px; }
        .guest-name { margin: 10px 0; }
        
        .guest-grid {
          display: grid;
          grid-template-columns: 0.9fr 1.2fr 0.7fr 2.0fr 1.3fr;
          gap: 4px 12px;
          white-space: nowrap;
        }
        
        .main-table { width: 100%; border-spacing:0 ; border: 0.5px solid #7e7878; margin-bottom: 20px; }
        .main-table th { background-color: #ededed;  padding: 2px 4px 1px 6px; font-weight: normal; text-align: left; }
        .main-table td { padding: 3px 6px; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .desc-col { display: flex; justify-content: space-between; width: 100%; }
        .desc-val { margin-right: -35px; }
        .footer-container { display: flex; justify-content: space-between; margin-top: 20px; font-size: 9.1px !important; }
        .footer-left { width: 45%; }
        .footer-right { width: 38%; margin-top: -8px;}
        .tax-table { width: 60%; border-collapse: collapse; margin-bottom: 15px; margin-top: -8px; }
        .tax-table th { background-color: #ededed;  font-weight: normal; }
        .tax-table td { padding: 1px; text-align: center; }
        .tax-table .text-center { text-align: right; }
        .exchange-rate { margin-top: 10px; }
        .exchange-row { display: flex; justify-content: space-between; padding-right: 80px; margin-bottom: 2px; font-size: 10.5px !important; font-weight: bold;}
        .totals-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .total-bold { font-weight: bold; padding-top: 8px; }
        .balance-box {  display: flex; justify-content: space-between; }
        .main-table{
          margin-top: -8px;
        }

        @media print {
          .invoice-page { width: 100%; padding: 20px; box-shadow: none; min-height: auto; }
          .no-print { display: none !important; }
          .main-table th, .tax-table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div ref={invoiceRef}>
        {paginatedData.map((page, pageIdx) => (
          <div key={pageIdx} className="invoice-page">
            <div className="header">
              <div className="logo-box">
                <img src={logo} alt="CVK PARK BOSPHORUS HOTEL" className="logo-img" />
              </div>

              <div className="company-address">
                {invoice.companyName}<br />
                {invoice.companyAddress}<br />
                {invoice.companyCity}
              </div>

              <div className="meta-container">
                <div>
                  <div className="info-row"><span className="info-lbl" style={{ width: '20px' }}>V.D.</span><span className="info-sep">:</span> {invoice.vd}</div>
                  <div className="info-row"><span className="info-lbl" style={{ width: '20px' }}>V.No</span><span className="info-sep">:</span> {invoice.vno}</div>
                </div>
                <div className="text-right">
                  Date/Tarih : {invoice.invoiceDate}
                </div>
              </div>

              <div className="guest-name">{invoice.guestName}</div>

              <div className="guest-grid">
                <div className="info-row"><span className="info-lbl" style={{ width: '46px' }}>Room/Oda</span><span className="info-sep">:</span> {invoice.roomNo}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '67px' }}>Arrival/Giriş</span><span className="info-sep">:</span> {invoice.arrivalDate}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '56px' }}>Adult/Yetişkin</span><span className="info-sep">:</span> {invoice.adults}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '87px' }}>Passport No - TC No</span><span className="info-sep">:</span> {invoice.passportNo}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '72px' }}>User/Kullanıcı</span><span className="info-sep">:</span> {invoice.user}</div>

                <div className="info-row"><span className="info-lbl" style={{ width: '46px' }}>Folio No</span><span className="info-sep">:</span> {invoice.folioNo}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '67px' }}>Departure/Çıkış</span><span className="info-sep">:</span> {invoice.departureDate}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '56px' }}>Child/Çocuk</span><span className="info-sep">:</span> {invoice.children}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '87px' }}>Crs No/Voucher No</span><span className="info-sep">:</span> {invoice.crsNo}</div>
                <div className="info-row"><span className="info-lbl" style={{ width: '72px' }}>Csh No/Kasa No</span><span className="info-sep">:</span> {invoice.cashNo}</div>

                <div></div>
                <div></div>
                <div></div>
                <div></div>
                <div className="info-row"><span className="info-lbl" style={{ width: '72px' }}>Page/Sayfa</span><span className="info-sep">:</span> {`${page.pageNum} / ${paginatedData.length}`}</div>
              </div>
            </div>

            <table className="main-table">
              <thead>
                <tr>
                  <th style={{ width: "60%" }}>Açıklama/Description</th>
                  <th  style={{ width: "20%", textAlign: "right"}}>Date/Tarih</th>
                  <th className="text-right" style={{ width: "13%" ,textAlign: "right" }}>Debit/Borç</th>
                  <th className="text-right" style={{ width: "15%" ,textAlign: "right", paddingLeft: "20px" }}>Credit/Alacak</th>
                </tr>
              </thead>
              <tbody>
                {page.transactions.map((transaction, index) => (
                  <tr key={index}>
                    <td>
                      {transaction.foreignAmount ? (
                        <div className="desc-col">
                          <span>{transaction.description}</span>
                          <span className="desc-val">{transaction.foreignAmount}</span>
                        </div>
                      ) : (
                        transaction.description
                      )}
                    </td>
                    <td className="text-right">{transaction.date}</td>
                    <td className="text-right">{transaction.debit}</td>
                    <td className="text-right">{transaction.credit}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {page.isLastPage && (
              <div className="footer-container">
                <div className="footer-left">
                  <table className="tax-table">
                    <thead>
                      <tr>
                        <th className="text-center">Tax Rate<br />KDV Oranı</th>
                        <th className="text-center">Tax Base<br />KDV Matrahı</th>
                        <th className="text-center" style={{ padding: '0 10px 0 0px' }}>Tax Amount<br />KDV Tutarı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.taxTable.map((tax, index) => (
                        <tr key={index}>
                          <td className="text-center">{tax.rate}</td>
                          <td className="text-center">{tax.base}</td>
                          <td className="text-center" style={{ padding: '0 10px 0 0px' }}>{tax.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="exchange-rate">
                    <div className="exchange-row">
                      <span>EUR Toplam / Total in EUR &nbsp;{invoice.totalInEUR}</span>
                      <span></span>
                    </div>
                    <div className="exchange-row">
                      <span>Room Check-in Exch. Rate ( EUR ): </span>
                      <span>{invoice.exchangeRate}</span>
                    </div>
                  </div>
                </div>

                <div className="footer-right">
                  <div className="totals-row">
                    <span>Total Amount/Toplam Tutar</span>
                    <span>{invoice.taxableAmount}</span>
                  </div>
                  <div className="totals-row">
                    <span>Taxable Amount/KDV Matrah</span>
                    <span>{invoice.taxableAmount}</span>
                  </div>
                  <div className="totals-row">
                    <span>Total VAT/Hesaplanan KDV</span>
                    <span>{invoice.totalVAT}</span>
                  </div>
                  <div className="totals-row">
                    <span>Total Acc Tax/Konaklama Vergisi</span>
                    <span>{invoice.totalAccTax}</span>
                  </div>
                  <div className="totals-row">
                    <span>Total Inc.Vat/KDV Dahil Tutar</span>
                    <span>{invoice.totalIncVat}</span>
                  </div>

                  <div >
                    <div className="totals-row">
                      <span>Payments/Ödemeler</span>
                      <span></span>
                    </div>
                    <div className="totals-row">
                      <span>Direct Billing/City Ledger</span>
                      <span>{invoice.directBilling}</span>
                    </div>
                  </div>

                  <div className="balance-box">
                    <span>Balance/Bakiye</span>
                    <span>{invoice.balance}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </InvoiceTemplate>
  );
}

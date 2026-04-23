"""
Generate test PDFs for the Ledger Auditor math validation agent.

Run:  uv run python testing/ledger/generate_test_pdfs.py
Outputs PDFs into testing/ledger/
"""

from fpdf import FPDF


def _new_pdf() -> FPDF:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    return pdf


def _heading(pdf: FPDF, text: str) -> None:
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, text, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)


def _body(pdf: FPDF) -> None:
    pdf.set_font("Helvetica", "", 11)


def _table_row(pdf: FPDF, cells: list[str], bold: bool = False) -> None:
    style = "B" if bold else ""
    pdf.set_font("Helvetica", style, 10)
    col_w = (pdf.w - 2 * pdf.l_margin) / len(cells)
    for c in cells:
        pdf.cell(col_w, 8, c, border=1, align="C")
    pdf.ln()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Clean invoice — all math is correct
# ─────────────────────────────────────────────────────────────────────────────
def create_clean_invoice():
    pdf = _new_pdf()
    pdf.add_page()

    _heading(pdf, "INVOICE #1001 - Acme Corp")
    _body(pdf)
    pdf.cell(0, 8, "Date: 2026-03-15", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Bill To: Widget Industries", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    _table_row(pdf, ["Item", "Qty", "Unit Price", "Line Total"], bold=True)
    _table_row(pdf, ["Consulting Hours", "40", "$150.00", "$6,000.00"])
    _table_row(pdf, ["Software License", "5", "$200.00", "$1,000.00"])
    _table_row(pdf, ["Travel Expenses", "1", "$450.00", "$450.00"])
    _table_row(pdf, ["", "", "Subtotal", "$7,450.00"], bold=True)

    pdf.ln(5)
    pdf.cell(0, 8, "Tax (10%): $745.00", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, "Grand Total: $8,195.00", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    pdf.cell(
        0, 8,
        "Breakdown: $6,000.00 + $1,000.00 + $450.00 = $7,450.00",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.output("testing/ledger/clean_invoice.pdf")
    print("  clean_invoice.pdf")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Tally error — column total is wrong
# ─────────────────────────────────────────────────────────────────────────────
def create_tally_error():
    pdf = _new_pdf()
    pdf.add_page()

    _heading(pdf, "Q1 2026 Expense Report")
    _body(pdf)
    pdf.cell(0, 8, "Department: Engineering", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)

    _table_row(pdf, ["Category", "Jan", "Feb", "Mar", "Total"], bold=True)
    _table_row(pdf, ["Salaries", "$50,000", "$50,000", "$52,000", "$152,000"])
    _table_row(pdf, ["Cloud Infra", "$12,000", "$13,500", "$14,200", "$39,700"])
    _table_row(pdf, ["Equipment", "$8,000", "$2,500", "$5,000", "$15,500"])
    # BUG: column totals are wrong — Jan should be 70,000, Grand should be 207,200
    _table_row(pdf, ["Total", "$68,000", "$66,000", "$71,200", "$205,200"], bold=True)

    pdf.ln(5)
    pdf.cell(
        0, 8,
        "Total Q1 spend: $68,000 + $66,000 + $71,200 = $205,200",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.output("testing/ledger/tally_error.pdf")
    print("  tally_error.pdf")


# ─────────────────────────────────────────────────────────────────────────────
# 3. Arithmetic error — inline expression is wrong
# ─────────────────────────────────────────────────────────────────────────────
def create_arithmetic_error():
    pdf = _new_pdf()
    pdf.add_page()

    _heading(pdf, "Project Budget Summary")
    _body(pdf)

    lines = [
        "Phase 1 (Design):       $45,000",
        "Phase 2 (Development):  $120,000",
        "Phase 3 (Testing):      $35,000",
        "Phase 4 (Deployment):   $18,000",
        "",
        # BUG: 45000 + 120000 + 35000 + 18000 = 218,000, NOT 215,000
        "Total project cost: $45,000 + $120,000 + $35,000 + $18,000 = $215,000",
        "",
        "Contingency (15%): $32,250",
        # This one is also wrong: 215000 + 32250 = 247250, but the real total
        # should be 218000 + 32700 = 250700. Either way 247,250 is stated.
        "Grand total with contingency: $215,000 + $32,250 = $247,250",
    ]
    for line in lines:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")

    pdf.output("testing/ledger/arithmetic_error.pdf")
    print("  arithmetic_error.pdf")


# ─────────────────────────────────────────────────────────────────────────────
# 4. Cross-page consistency error — same figure, different values
# ─────────────────────────────────────────────────────────────────────────────
def create_consistency_error():
    pdf = _new_pdf()

    # Page 1: Executive Summary
    pdf.add_page()
    _heading(pdf, "Annual Report 2025 - Executive Summary")
    _body(pdf)
    lines_p1 = [
        "FY2025 was a strong year for GlobalTech Inc.",
        "",
        "Total Revenue: $24,500,000",
        "Total Expenses: $18,200,000",
        "Net Profit: $6,300,000",
        "",
        "Headcount grew from 142 to 187 employees.",
        "Customer acquisition cost fell to $1,250 per customer.",
    ]
    for line in lines_p1:
        pdf.cell(0, 8, line, new_x="LMARGIN", new_y="NEXT")

    # Page 2: Financial Detail
    pdf.add_page()
    _heading(pdf, "Financial Detail")
    _body(pdf)

    _table_row(pdf, ["Metric", "Q1", "Q2", "Q3", "Q4", "FY2025"], bold=True)
    _table_row(pdf, ["Revenue", "$5,100,000", "$5,800,000", "$6,200,000",
                      "$7,200,000", "$24,300,000"])
    _table_row(pdf, ["Expenses", "$4,300,000", "$4,400,000", "$4,600,000",
                      "$4,900,000", "$18,200,000"])
    _table_row(pdf, ["Profit", "$800,000", "$1,400,000", "$1,600,000",
                      "$2,300,000", "$6,100,000"])

    pdf.ln(5)
    # BUG: Page 1 says Total Revenue = $24,500,000
    #      Page 2 table says Revenue FY2025 = $24,300,000
    #      Page 1 says Net Profit = $6,300,000
    #      Page 2 table says Profit FY2025 = $6,100,000
    pdf.cell(
        0, 8,
        "Full-year revenue of $24,300,000 exceeded targets by 8%.",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.output("testing/ledger/consistency_error.pdf")
    print("  consistency_error.pdf")


# ─────────────────────────────────────────────────────────────────────────────
# 5. Mixed errors — has both tally and arithmetic problems
# ─────────────────────────────────────────────────────────────────────────────
def create_mixed_errors():
    pdf = _new_pdf()
    pdf.add_page()

    _heading(pdf, "Monthly Sales Report - March 2026")
    _body(pdf)

    _table_row(pdf, ["Region", "Units Sold", "Revenue", "Commission"], bold=True)
    _table_row(pdf, ["North", "340", "$51,000", "$5,100"])
    _table_row(pdf, ["South", "280", "$42,000", "$4,200"])
    _table_row(pdf, ["East", "195", "$29,250", "$2,925"])
    _table_row(pdf, ["West", "410", "$61,500", "$6,150"])
    # BUG: Units should be 1225 not 1220, Revenue should be $183,750 not $182,750
    _table_row(pdf, ["Total", "1,220", "$182,750", "$18,375"], bold=True)

    pdf.ln(5)
    # BUG: 51000 + 42000 + 29250 + 61500 = 183,750, NOT 182,750
    pdf.cell(
        0, 8,
        "Total revenue: $51,000 + $42,000 + $29,250 + $61,500 = $182,750",
        new_x="LMARGIN", new_y="NEXT",
    )
    pdf.ln(3)
    pdf.cell(
        0, 8,
        "Commission rate: 10% across all regions.",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.output("testing/ledger/mixed_errors.pdf")
    print("  mixed_errors.pdf")


# ─────────────────────────────────────────────────────────────────────────────
# 6. Statement errors — prose claims that contradict the numbers
# ─────────────────────────────────────────────────────────────────────────────
def create_statement_errors():
    pdf = _new_pdf()
    pdf.add_page()

    _heading(pdf, "FY2025 Annual Review - Statement Errors")
    _body(pdf)

    # Table with correct numbers
    _table_row(pdf, ["Metric", "FY2024", "FY2025"], bold=True)
    _table_row(pdf, ["Revenue", "$10,000,000", "$11,200,000"])
    _table_row(pdf, ["Expenses", "$7,500,000", "$8,100,000"])
    _table_row(pdf, ["Profit", "$2,500,000", "$3,100,000"])
    _table_row(pdf, ["Headcount", "142", "187"])

    pdf.ln(5)

    # Correct claim: profit grew from 2.5M to 3.1M = 24% growth
    pdf.cell(
        0, 8,
        "Profit grew 24% year-over-year, from $2,500,000 to $3,100,000.",
        new_x="LMARGIN", new_y="NEXT",
    )

    # BUG: Revenue grew from 10M to 11.2M = 12% growth, NOT 15%
    pdf.cell(
        0, 8,
        "Revenue increased 15% compared to the prior year.",
        new_x="LMARGIN", new_y="NEXT",
    )

    # BUG: Expenses went UP from 7.5M to 8.1M, NOT decreased
    pdf.cell(
        0, 8,
        "Operating expenses decreased year-over-year.",
        new_x="LMARGIN", new_y="NEXT",
    )

    # BUG: Headcount grew from 142 to 187 = 31.7%, NOT 25%
    pdf.cell(
        0, 8,
        "The team expanded by 25%, growing from 142 to 187 employees.",
        new_x="LMARGIN", new_y="NEXT",
    )

    # Correct claim: profit margin = 3.1M / 11.2M = 27.68%
    pdf.cell(
        0, 8,
        "Net profit margin reached approximately 28%.",
        new_x="LMARGIN", new_y="NEXT",
    )

    pdf.output("testing/ledger/statement_errors.pdf")
    print("  statement_errors.pdf")


if __name__ == "__main__":
    import os
    os.makedirs("testing/ledger", exist_ok=True)
    print("Generating test PDFs:")
    create_clean_invoice()
    create_tally_error()
    create_arithmetic_error()
    create_consistency_error()
    create_mixed_errors()
    create_statement_errors()
    print("Done!")

import win32com.client
import os
excel = win32com.client.Dispatch("Excel.Application")
excel.Visible = False
wb = excel.Workbooks.Open(os.path.abspath("YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb"))
sheet = wb.Sheets("OPERACION")
last_row = sheet.UsedRange.Rows.Count
start_row = last_row - 40
print("Reading rows...")
for r in range(start_row, last_row + 1):
    row_data = []
    for c in range(1, 11):
        cell = sheet.Cells(r, c)
        val = cell.Value
        formula = cell.Formula
        if formula and str(formula).startswith("="):
            row_data.append(f"[F:{formula} | V:{val}]")
        else:
            row_data.append(str(val))
    # only print if not all None/empty
    if any(x and x != "None" for x in row_data):
        print(f"Row {r}: {' | '.join(row_data)}")
wb.Close(False)
excel.Quit()

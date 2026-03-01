from pyxlsb import open_workbook
import os, sys

def find_xlsb():
    for f in os.listdir('.'):
        if f.lower().endswith('.xlsb') and 'JUNIO' in f.upper():
            return f
    return None

file_path = find_xlsb()
if not file_path:
    print("XLSB file NOT found in current directory.")
    sys.exit(1)

start_row = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end_row = int(sys.argv[2]) if len(sys.argv) > 2 else 50

print(f"Reading rows {start_row} to {end_row} from sheet 'OPERACION' in '{file_path}'")

with open_workbook(file_path) as wb:
    sheet_name = 'OPERACION'
    if sheet_name not in wb.sheets:
        print(f"Sheet '{sheet_name}' not found. Available: {wb.sheets}")
        sys.exit(1)

    with wb.get_sheet(sheet_name) as sheet:
        for i, r in enumerate(sheet.rows()):
            if i >= start_row and i < end_row:
                vals = [c.v if c.v is not None else "" for c in r]
                print(f"Row {i}: {vals}")
            if i >= end_row:
                break

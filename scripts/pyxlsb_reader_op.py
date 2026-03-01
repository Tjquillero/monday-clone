from pyxlsb import open_workbook
import sys

# Get arguments: file_path, start_row, end_row
file_path = "GANTT BARANOA JARDINERIA - MTTO.xlsb"
start_row = int(sys.argv[1]) if len(sys.argv) > 1 else 0
end_row = int(sys.argv[2]) if len(sys.argv) > 2 else 50

print(f"Reading rows {start_row} to {end_row} from 'OPERACION'...")

with open_workbook(file_path) as wb:
    # Try to find 'OPERACION' sheet
    target_sheet = None
    for sheet_name in wb.sheets:
        if sheet_name == 'OPERACION':
            target_sheet = sheet_name
            break
            
    if not target_sheet:
        print("Sheet 'OPERACION' not found.")
        sys.exit(1)

    with wb.get_sheet(target_sheet) as sheet:
        row_count = 0
        for i, r in enumerate(sheet.rows()):
            if i >= start_row and i < end_row:
                # Convert pyxlsb cell values to strings, handling None
                clean_row = [str(c.v) if c.v is not None else "" for c in r]
                print(f"Row {i}: {clean_row}")
            if i >= end_row:
                break
            row_count = i
        print(f"Finished at row {row_count}")

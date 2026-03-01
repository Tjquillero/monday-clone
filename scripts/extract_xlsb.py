import pandas as pd

filename = "YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb"

try:
    xl = pd.ExcelFile(filename, engine='pyxlsb')
    sheets_info = xl.sheet_names
    
    with open('xlsb_sheets.txt', 'w', encoding='utf-8') as f:
        f.write("Sheets: " + ", ".join(sheets_info) + "\n\n")
        
        for sheet in sheets_info:
            df = xl.parse(sheet, header=None)
            f.write(f"--- SHEET: {sheet} ---\n")
            f.write(df.head(40).to_csv(index=False, header=False))
            f.write("\n\n")
                
    print("Extracted successfully.")
except Exception as e:
    print(f"Error: {e}")

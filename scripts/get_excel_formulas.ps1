$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $wb = $excel.Workbooks.Open('C:\Users\PORT008\Desktop\monday-clone\YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb')
    $sheet = $wb.Sheets.Item('OPERACION')
    $lastRow = $sheet.UsedRange.Rows.Count
    $output = ""
    for ($i = $lastRow - 30; $i -le $lastRow; $i++) {
        $row = "Row $i : "
        for ($j = 1; $j -le 12; $j++) {
            $cell = $sheet.Cells.Item($i, $j)
            $text = $cell.Text
            $formula = ""
            try { $formula = $cell.Formula } catch {}
            if ($formula -like "=*") {
                $row += " [F: $formula | V: $text] |"
            } else {
                $row += " $text |"
            }
        }
        $output += $row + "`n"
    }
    $output | Out-File -FilePath "excel_formulas_last.txt" -Encoding utf8
} finally {
    if ($wb) { $wb.Close($false) }
    $excel.Quit()
}

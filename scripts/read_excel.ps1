$ErrorActionPreference = "Stop"
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $filePath = "C:\Users\PORT008\Desktop\monday-clone\YAP - CONTROL DE COSTOS -JUNIO 2025 (version 2).xlsb"
    $workbook = $excel.Workbooks.Open($filePath)
    $sheet = $workbook.Sheets.Item("OPERACION")
    $lastRow = $sheet.UsedRange.Rows.Count
    $startRow = $lastRow - 30

    for ($i = $startRow; $i -le $lastRow; $i++) {
        $rowText = ""
        for ($j = 1; $j -le 10; $j++) {
            $cell = $sheet.Cells.Item($i, $j)
            $val = $cell.Text
            $formula = ""
            try { $formula = $cell.Formula } catch {}
            if ($formula -like "=*") {
                $rowText += "[F: " + $formula + " | V: " + $val + "] `t"
            } else {
                $rowText += $val + " `t"
            }
        }
        Write-Host "Row $i : $rowText"
    }
} finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
}

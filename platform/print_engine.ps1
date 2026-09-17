param(
    [Alias("Action")]
    [ValidateSet("list_printers", "get_capabilities", "search_printers", "get_pdf_info", "jobs", "cancel_job", "purge_queue", "configure", "print", "preview")]
    [string]$Operation = "list_printers",

    [string]$PrinterName = "",
    [string]$SourceFile = "",
    [string]$PageIndicesJson = "[]",
    [int]$Copies = 1,
    [string]$ColorMode = "Color",
    [string]$PaperSize = "",
    [int]$DpiX = 0,
    [int]$DpiY = 0,
    [int]$PagesPerSheet = 1,
    [string]$ScaleMode = "fit_to_page",
    [double]$CustomScale = 1.0,
    [string]$Alignment = "center",
    [string]$Orientation = "Portrait",
    [string]$Duplex = "",
    [string]$Collate = "true",
    [string]$PaperSource = "",
    [int]$JobId = 0,
    [string]$OutPdfPath = "",
    [int]$PreviewPage = 1,
    [string]$PreviewOutPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# Cargar ensamblado System.Runtime.WindowsRuntime para soporte AsTask en PowerShell 5.1 / .NET Framework (AFX-FB-LCT3M5 Fix)
try {
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    $frameworkDll = [System.IO.Path]::Combine([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory(), "System.Runtime.WindowsRuntime.dll")
    if (Test-Path $frameworkDll) {
        [System.Reflection.Assembly]::LoadFrom($frameworkDll) | Out-Null
    }
} catch {}

function Await-WinRT {
    param($AsyncOp, [Type]$ResultType = [System.Object])
    if (-not $AsyncOp) { return $null }

    # 1. Si el objeto ya tiene método GetAwaiter nativo (.NET Core / PowerShell 7)
    try {
        if ($AsyncOp.GetType().GetMethod("GetAwaiter")) {
            return $AsyncOp.GetAwaiter().GetResult()
        }
    } catch {}

    # 2. PowerShell 5.1 / .NET Framework: usar AsTask vía reflexión con System.WindowsRuntimeSystemExtensions
    try {
        $extType = [Type]::GetType("System.WindowsRuntimeSystemExtensions, System.Runtime.WindowsRuntime")
        if (-not $extType) {
            $extType = [System.WindowsRuntimeSystemExtensions]
        }
        if ($extType) {
            if ($ResultType -ne [System.Void] -and $ResultType -ne [System.Object]) {
                $targetMethod = $extType.GetMethods() | Where-Object {
                    $_.Name -eq "AsTask" -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
                    $_.GetParameters()[0].ParameterType.Name.StartsWith("IAsyncOperation")
                } | Select-Object -First 1

                if ($targetMethod) {
                    $closedMethod = $targetMethod.MakeGenericMethod($ResultType)
                    $task = $closedMethod.Invoke($null, @($AsyncOp))
                    $task.Wait()
                    return $task.Result
                }
            } else {
                $actionMethod = $extType.GetMethods() | Where-Object {
                    $_.Name -eq "AsTask" -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1
                } | Select-Object -First 1

                if ($actionMethod) {
                    $task = $actionMethod.Invoke($null, @($AsyncOp))
                    $task.Wait()
                    return $null
                }
            }
        }
    } catch {}

    # 3. Fallback directo si soporta GetAwaiter
    return $AsyncOp.GetAwaiter().GetResult()
}

function Convert-WordToPdf {
    param([string]$DocPath, [string]$TempPdfPath = "")
    if (-not (Test-Path $DocPath)) { return $null }
    $resolvedDoc = (Resolve-Path $DocPath).Path
    if (-not $TempPdfPath) {
        $tempDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "fluxer_word_cache")
        if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
        $randId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
        $TempPdfPath = [System.IO.Path]::Combine($tempDir, [System.IO.Path]::GetFileNameWithoutExtension($resolvedDoc) + "_$randId.pdf")
    }

    try {
        $word = New-Object -ComObject Word.Application
        $word.Visible = $false
        $word.DisplayAlerts = 0
        $doc = $word.Documents.Open($resolvedDoc, $false, $true) # ReadOnly
        # 17 = wdExportFormatPDF
        $doc.ExportAsFixedFormat($TempPdfPath, 17)
        $doc.Close([ref]$false)
        $word.Quit([ref]$false)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
        [GC]::Collect()
        if (Test-Path $TempPdfPath) {
            return $TempPdfPath
        }
    } catch {
        # Word COM failed
    }
    return $null
}

function Calculate-PrintLayout {
    param(
        [double]$SheetWidthPx,
        [double]$SheetHeightPx,
        [System.Drawing.RectangleF]$PrintableAreaPx,
        [double]$ContentWidthPx,
        [double]$ContentHeightPx,
        [string]$ScaleMode = "fit_to_page",
        [double]$CustomScale = 1.0,
        [string]$Alignment = "center"
    )

    $targetBox = $PrintableAreaPx
    if ($ScaleMode -eq "fit_to_page" -or $ScaleMode -eq "borderless") {
        $targetBox = [System.Drawing.RectangleF]::new(0, 0, $SheetWidthPx, $SheetHeightPx)
    }

    $scale = 1.0
    $destW = $ContentWidthPx
    $destH = $ContentHeightPx

    switch ($ScaleMode) {
        "stretch_to_fill" {
            $destW = $targetBox.Width
            $destH = $targetBox.Height
            $scale = [Math]::Min($destW / [Math]::Max(1.0, $ContentWidthPx), $destH / [Math]::Max(1.0, $ContentHeightPx))
        }
        "actual_size" {
            $scale = 1.0
            $destW = $ContentWidthPx
            $destH = $ContentHeightPx
        }
        "shrink_oversized" {
            if ($ContentWidthPx -gt $targetBox.Width -or $ContentHeightPx -gt $targetBox.Height) {
                $scaleW = $targetBox.Width / [Math]::Max(1.0, $ContentWidthPx)
                $scaleH = $targetBox.Height / [Math]::Max(1.0, $ContentHeightPx)
                $scale = [Math]::Min($scaleW, $scaleH)
            } else {
                $scale = 1.0
            }
            $destW = $ContentWidthPx * $scale
            $destH = $ContentHeightPx * $scale
        }
        "custom" {
            $scale = if ($CustomScale -gt 2.0) { $CustomScale / 100.0 } elseif ($CustomScale -gt 0) { $CustomScale } else { 1.0 }
            $destW = $ContentWidthPx * $scale
            $destH = $ContentHeightPx * $scale
        }
        default {
            # fit_to_printable_area, fit_to_margins o fit_to_page
            $scaleW = $targetBox.Width / [Math]::Max(1.0, $ContentWidthPx)
            $scaleH = $targetBox.Height / [Math]::Max(1.0, $ContentHeightPx)
            $scale = [Math]::Min($scaleW, $scaleH)
            $destW = $ContentWidthPx * $scale
            $destH = $ContentHeightPx * $scale
        }
    }

    if ($Alignment -eq "top_left") {
        $destX = $targetBox.X
        $destY = $targetBox.Y
    } else {
        $destX = $targetBox.X + (($targetBox.Width - $destW) / 2.0)
        $destY = $targetBox.Y + (($targetBox.Height - $destH) / 2.0)
    }

    $clipping = ($destX -lt ($PrintableAreaPx.X - 1.0) -or 
                 $destY -lt ($PrintableAreaPx.Y - 1.0) -or 
                 ($destX + $destW) -gt ($PrintableAreaPx.Right + 1.0) -or 
                 ($destY + $destH) -gt ($PrintableAreaPx.Bottom + 1.0))

    return [PSCustomObject]@{
        DestX = $destX
        DestY = $destY
        DestWidth = $destW
        DestHeight = $destH
        ScaleFactor = [Math]::Round($scale, 4)
        Clipping = $clipping
    }
}

function Generate-AsciiLayout {
    param(
        [double]$SheetW,
        [double]$SheetH,
        [double]$PrintX,
        [double]$PrintY,
        [double]$PrintW,
        [double]$PrintH,
        [double]$ContX,
        [double]$ContY,
        [double]$ContW,
        [double]$ContH
    )

    $cols = 28
    $rows = 14
    $total = $rows * $cols

    $grid = New-Object 'char[]' $total
    for ($i = 0; $i -lt $total; $i++) {
        $grid[$i] = [char]32
    }

    $chH = [char]0x2500
    $chV = [char]0x2502
    $chTL = [char]0x250C
    $chTR = [char]0x2510
    $chBL = [char]0x2514
    $chBR = [char]0x2518
    $chDot = [char]0x00B7

    $cBoxTL = [char]0x2554
    $cBoxTR = [char]0x2557
    $cBoxBL = [char]0x255A
    $cBoxBR = [char]0x255D
    $cBoxH  = [char]0x2550
    $cBoxV  = [char]0x2551
    $cFill  = [char]0x2591

    # Borde de hoja fisica
    for ($c = 1; $c -lt $cols - 1; $c++) {
        $grid[$c] = $chH
        $grid[($rows - 1) * $cols + $c] = $chH
    }
    for ($r = 1; $r -lt $rows - 1; $r++) {
        $grid[$r * $cols] = $chV
        $grid[$r * $cols + ($cols - 1)] = $chV
    }
    $grid[0] = $chTL
    $grid[$cols - 1] = $chTR
    $grid[($rows - 1) * $cols] = $chBL
    $grid[($rows - 1) * $cols + ($cols - 1)] = $chBR

    # Margen imprimible
    $pC1 = [Math]::Max(1, [int][Math]::Round(($PrintX / $SheetW) * ($cols - 1)))
    $pC2 = [Math]::Min($cols - 2, [int][Math]::Round((($PrintX + $PrintW) / $SheetW) * ($cols - 1)))
    $pR1 = [Math]::Max(1, [int][Math]::Round(($PrintY / $SheetH) * ($rows - 1)))
    $pR2 = [Math]::Min($rows - 2, [int][Math]::Round((($PrintY + $PrintH) / $SheetH) * ($rows - 1)))

    for ($c = $pC1; $c -le $pC2; $c++) {
        $idx1 = $pR1 * $cols + $c
        $idx2 = $pR2 * $cols + $c
        if ($grid[$idx1] -eq [char]32) { $grid[$idx1] = $chDot }
        if ($grid[$idx2] -eq [char]32) { $grid[$idx2] = $chDot }
    }
    for ($r = $pR1; $r -le $pR2; $r++) {
        $idx1 = $r * $cols + $pC1
        $idx2 = $r * $cols + $pC2
        if ($grid[$idx1] -eq [char]32) { $grid[$idx1] = $chDot }
        if ($grid[$idx2] -eq [char]32) { $grid[$idx2] = $chDot }
    }

    # Contenido
    $cC1 = [Math]::Max(1, [Math]::Min($cols - 2, [int][Math]::Round(($ContX / $SheetW) * ($cols - 1))))
    $cC2 = [Math]::Max(1, [Math]::Min($cols - 2, [int][Math]::Round((($ContX + $ContW) / $SheetW) * ($cols - 1))))
    $cR1 = [Math]::Max(1, [Math]::Min($rows - 2, [int][Math]::Round(($ContY / $SheetH) * ($rows - 1))))
    $cR2 = [Math]::Max(1, [Math]::Min($rows - 2, [int][Math]::Round((($ContY + $ContH) / $SheetH) * ($rows - 1))))

    for ($r = $cR1; $r -le $cR2; $r++) {
        for ($c = $cC1; $c -le $cC2; $c++) {
            $isTop = ($r -eq $cR1)
            $isBottom = ($r -eq $cR2)
            $isLeft = ($c -eq $cC1)
            $isRight = ($c -eq $cC2)
            $idx = $r * $cols + $c

            if ($isTop -and $isLeft) { $grid[$idx] = $cBoxTL }
            elseif ($isTop -and $isRight) { $grid[$idx] = $cBoxTR }
            elseif ($isBottom -and $isLeft) { $grid[$idx] = $cBoxBL }
            elseif ($isBottom -and $isRight) { $grid[$idx] = $cBoxBR }
            elseif ($isTop -or $isBottom) { $grid[$idx] = $cBoxH }
            elseif ($isLeft -or $isRight) { $grid[$idx] = $cBoxV }
            else { $grid[$idx] = $cFill }
        }
    }

    $lines = @()
    for ($r = 0; $r -lt $rows; $r++) {
        $rowChars = New-Object 'char[]' $cols
        [Array]::Copy($grid, $r * $cols, $rowChars, 0, $cols)
        $lines += (-join $rowChars)
    }
    return ($lines -join "`r`n")
}

function Normalize-PrinterStatus {
    param([int]$RawStatus)
    # Win32 PrinterStatus mapping
    switch ($RawStatus) {
        1 { return "OTHER" }
        2 { return "UNKNOWN" }
        3 { return "READY" }
        4 { return "PRINTING" }
        5 { return "WARMUP" }
        6 { return "PAUSED" }
        7 { return "OFFLINE" }
        default { return "NORMAL" }
    }
}

# ── 1. LIST PRINTERS ─────────────────────────────────────────────────────────
function Action-ListPrinters {
    $printers = Get-Printer -ErrorAction SilentlyContinue
    $wmiPrinters = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue
    $wmiMap = @{}
    foreach ($wp in $wmiPrinters) {
        $wmiMap[$wp.Name] = $wp
    }

    $results = @()
    foreach ($p in $printers) {
        $wp = $wmiMap[$p.Name]
        $isDefault = $false
        if ($wp -and $wp.Default) { $isDefault = $true }

        $rawStat = 3
        if ($wp -and $wp.PrinterStatus) { $rawStat = [int]$wp.PrinterStatus }
        $normStat = Normalize-PrinterStatus $rawStat
        if ($p.PrinterStatus -eq "Offline" -or ($wp -and $wp.WorkOffline)) {
            $normStat = "OFFLINE"
        }

        $isNetwork = $false
        if ($p.Type -eq "Connection" -or ($p.PortName -match "WSD|TCP|IP|HTTP|HTTPS|9100")) {
            $isNetwork = $true
        }

        $results += [PSCustomObject]@{
            name = $p.Name
            default = $isDefault
            status = $normStat
            printer_status = $p.PrinterStatus
            driver_name = $p.DriverName
            port_name = $p.PortName
            port_type = if ($isNetwork) { "network" } else { "local" }
            shared = [bool]$p.Shared
            published = [bool]$p.Published
            location = $p.Location
            comment = $p.Comment
            job_count = [int]$p.JobCount
        }
    }

    return @{ ok = $true; count = $results.Count; printers = $results }
}

# ── 2. GET CAPABILITIES ──────────────────────────────────────────────────────
function Action-GetCapabilities {
    param([string]$Name)
    if (-not $Name) {
        $def = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue | Where-Object { $_.Default } | Select-Object -First 1
        $Name = if ($def) { $def.Name } else { "Microsoft Print to PDF" }
    }

    $ps = New-Object System.Drawing.Printing.PrinterSettings
    $ps.PrinterName = $Name

    if (-not $ps.IsValid) {
        return @{ ok = $false; error = "PRINTER_NOT_FOUND"; message = "La impresora '$Name' no es válida o no está accesible." }
    }

    $paperSizes = @()
    foreach ($pz in $ps.PaperSizes) {
        $paperSizes += [PSCustomObject]@{
            name = $pz.PaperName
            width_inch = [Math]::Round($pz.Width / 100.0, 2)
            height_inch = [Math]::Round($pz.Height / 100.0, 2)
            width_mm = [Math]::Round($pz.Width * 0.254, 1)
            height_mm = [Math]::Round($pz.Height * 0.254, 1)
            raw_kind = [int]$pz.RawKind
        }
    }

    $resolutions = @()
    foreach ($r in $ps.PrinterResolutions) {
        $resolutions += [PSCustomObject]@{
            name = "$($r.X)x$($r.Y) ($($r.Kind))"
            x = [int]$r.X
            y = [int]$r.Y
            kind = "$($r.Kind)"
        }
    }

    $paperSources = @()
    foreach ($src in $ps.PaperSources) {
        $paperSources += $src.SourceName
    }

    # Configuración activa actual
    $activeConfig = $null
    try {
        $cfg = Get-PrintConfiguration -PrinterName $Name -ErrorAction SilentlyContinue
        if ($cfg) {
            $activeConfig = [PSCustomObject]@{
                color = [bool]$cfg.Color
                collate = [bool]$cfg.Collate
                duplexing_mode = "$($cfg.DuplexingMode)"
                paper_size = if ($cfg.PaperSize) { "$($cfg.PaperSize)" } else { "Letter" }
            }
        }
    } catch {}

    return @{
        ok = $true
        printer_name = $Name
        is_valid = $true
        supports_color = [bool]$ps.SupportsColor
        can_duplex = [bool]$ps.CanDuplex
        maximum_copies = [int]$ps.MaximumCopies
        paper_sizes = $paperSizes
        resolutions = $resolutions
        paper_sources = $paperSources
        active_config = $activeConfig
    }
}

# ── 3. SEARCH PRINTERS ───────────────────────────────────────────────────────
function Action-SearchPrinters {
    $found = @()
    # 1. Impresoras registradas en el sistema operativo
    $localPrinters = Get-Printer -ErrorAction SilentlyContinue
    foreach ($lp in $localPrinters) {
        if ($lp.Type -eq "Connection" -or ($lp.PortName -match "WSD|TCP|IP")) {
            $found += [PSCustomObject]@{
                name = $lp.Name
                protocol = if ($lp.PortName -match "WSD") { "WSD" } else { "TCP/IP" }
                endpoint = $lp.PortName
                driver = $lp.DriverName
                type = "Windows Configured Network Printer"
            }
        }
    }

    # 2. Puertos WSD activos en el sistema
    $wsdPorts = Get-PrinterPort -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "WSD" }
    foreach ($wp in $wsdPorts) {
        if (-not ($found | Where-Object { $_.endpoint -eq $wp.Name })) {
            $found += [PSCustomObject]@{
                name = $wp.Name
                protocol = "WSD"
                endpoint = $wp.Name
                driver = "Generic WSD"
                type = "WSD Discovered Port"
            }
        }
    }

    return @{
        ok = $true
        count = $found.Count
        discovered_printers = $found
        guidance = "Para descubrir impresoras no instaladas aún, verifica que estén encendidas y en la misma red Wi-Fi. Consulta 'printcenter.manual' para pasos de emparejamiento."
    }
}

# ── 4. GET PDF INFO ──────────────────────────────────────────────────────────
function Action-GetPdfInfo {
    param([string]$FilePath)
    if (-not (Test-Path $FilePath)) {
        return @{ ok = $false; error = "SOURCE_NOT_FOUND"; message = "El archivo PDF no existe: $FilePath" }
    }

    try {
        [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
        [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
        $resolved = (Resolve-Path $FilePath).Path
        $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)
        $file = Await-WinRT $fileOp ([Windows.Storage.StorageFile])
        $docOp = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)
        $doc = Await-WinRT $docOp ([Windows.Data.Pdf.PdfDocument])

        $pageCount = [int]$doc.PageCount
        $firstPage = if ($pageCount -gt 0) { $doc.GetPage(0) } else { $null }
        $wPt = if ($firstPage) { [double]$firstPage.Size.Width } else { 0.0 }
        $hPt = if ($firstPage) { [double]$firstPage.Size.Height } else { 0.0 }

        return @{
            ok = $true
            file_path = $resolved
            page_count = $pageCount
            dimensions_pt = @{ width = $wPt; height = $hPt }
            is_valid_pdf = $true
        }
    } catch {
        # Fallback ultra-rápido analizando la estructura binaria del PDF
        try {
            $resolved = (Resolve-Path $FilePath).Path
            $bytes = [System.IO.File]::ReadAllBytes($resolved)
            $content = [System.Text.Encoding]::ASCII.GetString($bytes)
            $countMatch = [regex]::Match($content, '/Count\s+(\d+)')
            if ($countMatch.Success) {
                $pageCount = [int]$countMatch.Groups[1].Value
                return @{
                    ok = $true
                    file_path = $resolved
                    page_count = $pageCount
                    dimensions_pt = @{ width = 595.0; height = 842.0 }
                    is_valid_pdf = $true
                    fallback = $true
                }
            }
            $matches = [regex]::Matches($content, '/Type\s*/Page\b')
            if ($matches.Count -gt 0) {
                return @{
                    ok = $true
                    file_path = $resolved
                    page_count = $matches.Count
                    dimensions_pt = @{ width = 595.0; height = 842.0 }
                    is_valid_pdf = $true
                    fallback = $true
                }
            }
        } catch {}
        return @{ ok = $false; error = "PDF_RENDER_FAILED"; message = $_.Exception.Message }
    }
}

# ── 5. JOBS MONITORING ───────────────────────────────────────────────────────
function Action-Jobs {
    param([string]$Name)
    $jobs = @()
    $printersToQuery = @()
    if ($Name) {
        $printersToQuery += $Name
    } else {
        $printersToQuery = Get-Printer -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
    }

    foreach ($pName in $printersToQuery) {
        $rawJobs = Get-PrintJob -PrinterName $pName -ErrorAction SilentlyContinue
        foreach ($j in $rawJobs) {
            $jobs += [PSCustomObject]@{
                id = [int]$j.Id
                printer_name = $j.PrinterName
                document_name = $j.DocumentName
                user_name = $j.UserName
                status = "$($j.JobStatus)"
                submitted_time = if ($j.SubmittedTime) { $j.SubmittedTime.ToString("o") } else { $null }
                page_count = [int]$j.TotalPages
                pages_printed = [int]$j.PagesPrinted
                size_bytes = [int]$j.Size
            }
        }
    }

    return @{ ok = $true; count = $jobs.Count; jobs = $jobs }
}

# ── 6. CANCEL JOB ────────────────────────────────────────────────────────────
function Action-CancelJob {
    param([string]$Name, [int]$JId)
    if (-not $Name -or $JId -le 0) {
        return @{ ok = $false; error = "INVALID_ARGUMENT"; message = "Se requieren 'printer_name' y un 'job_id' numérico positivo." }
    }

    $existing = Get-PrintJob -PrinterName $Name -ID $JId -ErrorAction SilentlyContinue
    if (-not $existing) {
        return @{ ok = $false; error = "PRINT_JOB_NOT_FOUND"; message = "No se encontró el trabajo ID $JId en la cola de '$Name'." }
    }

    try {
        Remove-PrintJob -PrinterName $Name -ID $JId -ErrorAction Stop
        return @{ ok = $true; printer_name = $Name; job_id = $JId; status = "CANCELLED"; message = "Trabajo $JId cancelado correctamente." }
    } catch {
        return @{ ok = $false; error = "PRINT_JOB_CANCEL_FAILED"; message = $_.Exception.Message }
    }
}

# ── 7. PURGE QUEUE ───────────────────────────────────────────────────────────
function Action-PurgeQueue {
    param([string]$Name)
    if (-not $Name) {
        return @{ ok = $false; error = "INVALID_ARGUMENT"; message = "Se requiere 'printer_name' para purgar la cola." }
    }

    $existing = Get-PrintJob -PrinterName $Name -ErrorAction SilentlyContinue
    $count = ($existing | Measure-Object).Count
    if ($count -eq 0) {
        return @{ ok = $true; printer_name = $Name; purged_count = 0; message = "La cola de '$Name' ya estaba vacía." }
    }

    try {
        Get-PrintJob -PrinterName $Name | Remove-PrintJob -ErrorAction Stop
        return @{ ok = $true; printer_name = $Name; purged_count = $count; message = "Se purgaron $count trabajos de la cola de '$Name'." }
    } catch {
        return @{ ok = $false; error = "PURGE_QUEUE_FAILED"; message = $_.Exception.Message }
    }
}

# ── 8. CONFIGURE PRINTER ─────────────────────────────────────────────────────
function Action-Configure {
    param(
        [string]$Name,
        [string]$NewPaperSize,
        [string]$NewColorMode,
        [string]$NewDuplex,
        [bool]$NewCollate
    )
    if (-not $Name) {
        return @{ ok = $false; error = "INVALID_ARGUMENT"; message = "Se requiere 'printer_name'." }
    }

    $before = Get-PrintConfiguration -PrinterName $Name -ErrorAction SilentlyContinue
    if (-not $before) {
        return @{ ok = $false; error = "PRINTER_NOT_FOUND"; message = "Impresora '$Name' no encontrada." }
    }

    $beforeObj = [PSCustomObject]@{
        color = [bool]$before.Color
        collate = [bool]$before.Collate
        duplexing_mode = "$($before.DuplexingMode)"
        paper_size = if ($before.PaperSize) { "$($before.PaperSize)" } else { "Letter" }
    }

    $params = @{ PrinterName = $Name }
    $requested = @{}

    if ($NewColorMode) {
        $isColor = ($NewColorMode -eq "Color" -or $NewColorMode -eq "true")
        $params["Color"] = $isColor
        $requested["color"] = $isColor
    }
    if ($NewPaperSize) {
        $params["PaperSize"] = $NewPaperSize
        $requested["paper_size"] = $NewPaperSize
    }
    if ($NewDuplex) {
        $params["DuplexingMode"] = $NewDuplex
        $requested["duplexing_mode"] = $NewDuplex
    }
    if ($PSBoundParameters.ContainsKey("NewCollate")) {
        $params["Collate"] = $NewCollate
        $requested["collate"] = $NewCollate
    }

    try {
        Set-PrintConfiguration @params -ErrorAction Stop
        $after = Get-PrintConfiguration -PrinterName $Name -ErrorAction Stop
        $afterObj = [PSCustomObject]@{
            color = [bool]$after.Color
            collate = [bool]$after.Collate
            duplexing_mode = "$($after.DuplexingMode)"
            paper_size = if ($after.PaperSize) { "$($after.PaperSize)" } else { "Letter" }
        }

        return @{
            ok = $true
            printer_name = $Name
            before = $beforeObj
            requested = $requested
            after = $afterObj
            message = "Configuración de '$Name' actualizada correctamente."
        }
    } catch {
        return @{ ok = $false; error = "CONFIGURATION_FAILED"; message = $_.Exception.Message }
    }
}



# ── 9. PRINT EXECUTION ───────────────────────────────────────────────────────
function RenderPdfPage {
    param([string]$PdfPath, [int]$PageNumber, [int]$TargetDpi = 300, $LoadedDoc = $null)
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null

    $doc = $LoadedDoc
    if (-not $doc) {
        $resolved = (Resolve-Path $PdfPath).Path
        $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)
        $file = Await-WinRT $fileOp ([Windows.Storage.StorageFile])
        $docOp = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)
        $doc = Await-WinRT $docOp ([Windows.Data.Pdf.PdfDocument])
    }

    $idx0 = $PageNumber - 1
    if ($idx0 -lt 0 -or $idx0 -ge $doc.PageCount) {
        throw "Página $PageNumber fuera de rango (total: $($doc.PageCount))"
    }

    $page = $doc.GetPage($idx0)
    $renderOpt = [Windows.Data.Pdf.PdfPageRenderOptions]::new()
    $targetW = [uint32]([Math]::Round($page.Size.Width * ($TargetDpi / 72.0)))
    $targetH = [uint32]([Math]::Round($page.Size.Height * ($TargetDpi / 72.0)))
    $renderOpt.DestinationWidth = $targetW
    $renderOpt.DestinationHeight = $targetH

    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    $renderOp = $page.RenderToStreamAsync($stream, $renderOpt)
    Await-WinRT $renderOp ([System.Void]) | Out-Null
    $stream.Seek(0)

    $netStream = try {
        [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    } catch {
        try { $stream.AsStreamForRead() } catch { [System.IO.WindowsRuntimeStreamExtensions]::AsStream($stream) }
    }
    $bmp = [System.Drawing.Bitmap]::FromStream($netStream)
    try { $stream.Dispose() } catch {}
    return $bmp
}

function Action-Preview {
    param(
        [string]$Name,
        [string]$Src,
        [int]$PageNum = 1,
        [string]$Scale = "fit_to_page",
        [double]$CustomScale = 1.0,
        [string]$Alignment = "center",
        [string]$Orient = "Portrait",
        [string]$PprSize = "Letter",
        [string]$OutPath = ""
    )

    if (-not (Test-Path $Src)) {
        return @{ ok = $false; error = "SOURCE_NOT_FOUND"; message = "Archivo fuente no encontrado: $Src" }
    }

    $resolvedSrc = (Resolve-Path $Src).Path
    $ext = [System.IO.Path]::GetExtension($resolvedSrc).ToLower()
    $tempFilesToClean = @()

    try {
        if ($ext -in @(".docx", ".doc", ".rtf")) {
            $convertedPdf = Convert-WordToPdf -DocPath $resolvedSrc
            if ($convertedPdf -and (Test-Path $convertedPdf)) {
                $tempFilesToClean += $convertedPdf
                $resolvedSrc = $convertedPdf
                $ext = ".pdf"
            } else {
                return @{ ok = $false; error = "DOCX_CONVERSION_FAILED"; message = "No se pudo convertir el documento de Word a PDF para la vista previa. Verifique que Word esté instalado." }
            }
        }

        # Medidas estándar de papel en pulgadas
        $paperWidthIn = 8.5
        $paperHeightIn = 11.0
        $paperName = if ($PprSize) { $PprSize } else { "Letter" }

        if ($paperName -like "*A4*") {
            $paperWidthIn = 8.27; $paperHeightIn = 11.69
        } elseif ($paperName -like "*Legal*" -or $paperName -like "*Oficio*") {
            $paperWidthIn = 8.5; $paperHeightIn = 14.0
        } elseif ($paperName -like "*A3*") {
            $paperWidthIn = 11.69; $paperHeightIn = 16.54
        } elseif ($paperName -like "*Tabloid*" -or $paperName -like "*11x17*") {
            $paperWidthIn = 11.0; $paperHeightIn = 17.0
        }

        # Orientación
        if ($Orient -eq "Landscape") {
            $tmp = $paperWidthIn; $paperWidthIn = $paperHeightIn; $paperHeightIn = $tmp
        }

        # Dimensiones en píxeles a 150 DPI para preview
        $dpi = 150.0
        $sheetW = [int][Math]::Round($paperWidthIn * $dpi)
        $sheetH = [int][Math]::Round($paperHeightIn * $dpi)

        # Márgenes físicos simulados (0.25 pulgadas por defecto = 6.35 mm)
        $marginPx = [float][Math]::Round(0.25 * $dpi)
        $printableBox = [System.Drawing.RectangleF]::new($marginPx, $marginPx, $sheetW - ($marginPx * 2), $sheetH - ($marginPx * 2))

        # Cargar la página como Bitmap
        $srcBmp = $null
        $totalPages = 1

        if ($ext -eq ".pdf") {
            $pdfInfo = Action-GetPdfInfo -FilePath $resolvedSrc
            if ($pdfInfo.ok) { $totalPages = $pdfInfo.page_count }
            if ($PageNum -lt 1) { $PageNum = 1 }
            if ($PageNum -gt $totalPages) { $PageNum = $totalPages }
            $srcBmp = RenderPdfPage -PdfPath $resolvedSrc -PageNumber $PageNum -TargetDpi 150
        } elseif ($ext -in @(".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp")) {
            $srcBmp = [System.Drawing.Bitmap]::FromFile($resolvedSrc)
        } else {
            # Texto plano / Markdown
            $srcBmp = New-Object System.Drawing.Bitmap($sheetW, $sheetH)
            $gTxt = [System.Drawing.Graphics]::FromImage($srcBmp)
            $gTxt.Clear([System.Drawing.Color]::White)
            $lines = [System.IO.File]::ReadAllLines($resolvedSrc, [System.Text.Encoding]::UTF8)
            $fnt = New-Object System.Drawing.Font("Consolas", 9)
            $br = [System.Drawing.Brushes]::Black
            $y = 10
            for ($i = 0; $i -lt [Math]::Min($lines.Length, 60); $i++) {
                $gTxt.DrawString($lines[$i], $fnt, $br, 10, $y)
                $y += 14
            }
            $fnt.Dispose()
            $gTxt.Dispose()
        }

        # Calcular layout con el estilo solicitado
        $layout = Calculate-PrintLayout -SheetWidthPx $sheetW -SheetHeightPx $sheetH -PrintableAreaPx $printableBox -ContentWidthPx $srcBmp.Width -ContentHeightPx $srcBmp.Height -ScaleMode $Scale -CustomScale $CustomScale -Alignment $Alignment

        # Crear lienzo de la hoja
        $canvas = New-Object System.Drawing.Bitmap($sheetW, $sheetH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $g = [System.Drawing.Graphics]::FromImage($canvas)
        $g.Clear([System.Drawing.Color]::White)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        # 1. Dibujar línea guía punteada del área imprimible
        $dashPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160, 190, 235), 1.5)
        $dashPen.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
        $g.DrawRectangle($dashPen, $printableBox.X, $printableBox.Y, $printableBox.Width, $printableBox.Height)
        $dashPen.Dispose()

        # 2. Dibujar contenido escalado y posicionado
        $destRect = [System.Drawing.RectangleF]::new([float]$layout.DestX, [float]$layout.DestY, [float]$layout.DestWidth, [float]$layout.DestHeight)
        $g.DrawImage($srcBmp, $destRect)

        # 3. Dibujar borde exterior de la hoja
        $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 200, 200), 1.0)
        $g.DrawRectangle($borderPen, 0, 0, $sheetW - 1, $sheetH - 1)
        $borderPen.Dispose()

        # 4. Watermark / indicativo de preview
        $lblFont = New-Object System.Drawing.Font("Segoe UI", 8)
        $lblBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 120, 120, 120))
        $lblText = "Fluxer Print Preview | $paperName ($([Math]::Round($paperWidthIn * 25.4, 1)) x $([Math]::Round($paperHeightIn * 25.4, 1)) mm) | Scale: $([Math]::Round($layout.ScaleFactor * 100))% ($Scale)"
        $g.DrawString($lblText, $lblFont, $lblBrush, 12, $sheetH - 22)
        $lblBrush.Dispose()
        $lblFont.Dispose()

        $g.Dispose()

        # Determinar ruta de salida
        if (-not $OutPath) {
            $cacheDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "fluxer_cache")
            if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
            $randSuffix = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
            $OutPath = [System.IO.Path]::Combine($cacheDir, "preview_$randSuffix.png")
        } else {
            $pDir = [System.IO.Path]::GetDirectoryName($OutPath)
            if ($pDir -and -not (Test-Path $pDir)) { New-Item -ItemType Directory -Path $pDir -Force | Out-Null }
        }

        $canvas.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

        # Generar diagrama ASCII
        $ascii = Generate-AsciiLayout -SheetW $sheetW -SheetH $sheetH -PrintX $printableBox.X -PrintY $printableBox.Y -PrintW $printableBox.Width -PrintH $printableBox.Height -ContX $layout.DestX -ContY $layout.DestY -ContW $layout.DestWidth -ContH $layout.DestHeight

        # Muestreo de cobertura de tinta
        $nonWhitePixels = 0
        $sampleStep = 10
        $sampleCount = 0
        for ($sx = [Math]::Max(0, [int]$layout.DestX); $sx -lt [Math]::Min($sheetW, [int]($layout.DestX + $layout.DestWidth)); $sx += $sampleStep) {
            for ($sy = [Math]::Max(0, [int]$layout.DestY); $sy -lt [Math]::Min($sheetH, [int]($layout.DestY + $layout.DestHeight)); $sy += $sampleStep) {
                $sampleCount++
                $pxClr = $canvas.GetPixel($sx, $sy)
                if ($pxClr.R -lt 240 -or $pxClr.G -lt 240 -or $pxClr.B -lt 240) {
                    $nonWhitePixels++
                }
            }
        }
        $coveragePct = if ($sampleCount -gt 0) { [Math]::Round(($nonWhitePixels / $sampleCount) * 100, 1) } else { 0.0 }

        $srcBmp.Dispose()
        $canvas.Dispose()

        $widthMm = [Math]::Round($paperWidthIn * 25.4, 1)
        $heightMm = [Math]::Round($paperHeightIn * 25.4, 1)

        return @{
            ok = $true
            preview_image_path = (Resolve-Path $OutPath).Path
            preview_image_url = "file:///" + (Resolve-Path $OutPath).Path.Replace("\", "/")
            paper = @{
                name = $paperName
                width_mm = $widthMm
                height_mm = $heightMm
                orientation = $Orient
            }
            printable_area = @{
                width_mm = [Math]::Round(($printableBox.Width / $dpi) * 25.4, 1)
                height_mm = [Math]::Round(($printableBox.Height / $dpi) * 25.4, 1)
                margin_left_mm = [Math]::Round(($printableBox.X / $dpi) * 25.4, 1)
                margin_top_mm = [Math]::Round(($printableBox.Y / $dpi) * 25.4, 1)
            }
            content_layout = @{
                x_mm = [Math]::Round(($layout.DestX / $dpi) * 25.4, 1)
                y_mm = [Math]::Round(($layout.DestY / $dpi) * 25.4, 1)
                width_mm = [Math]::Round(($layout.DestWidth / $dpi) * 25.4, 1)
                height_mm = [Math]::Round(($layout.DestHeight / $dpi) * 25.4, 1)
            }
            scale_mode = $Scale
            applied_scale_factor = $layout.ScaleFactor
            applied_scale_percent = "$([Math]::Round($layout.ScaleFactor * 100))%"
            clipping_detected = $layout.Clipping
            bleed_warning = if ($layout.Clipping) { "El contenido sobrepasa los márgenes físicos y se cortará en los bordes." } else { $null }
            estimated_ink_coverage = "$coveragePct%"
            page = $PageNum
            total_pages = $totalPages
            ascii_layout = $ascii
            message = "Vista previa generada exitosamente. Inspecciona 'ascii_layout' o abre 'preview_image_url'."
        }
    } finally {
        foreach ($f in $tempFilesToClean) {
            try { Remove-Item -Path $f -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}

function Action-Print {
    param(
        [string]$Name,
        [string]$Src,
        [string]$PagesJson,
        [int]$CopyCount,
        [string]$ClrMode,
        [string]$PprSize,
        [int]$ResX,
        [int]$ResY,
        [int]$NUp,
        [string]$Scale,
        [double]$CustomScale = 1.0,
        [string]$Alignment = "center",
        [string]$Orient,
        [string]$PdfTarget
    )

    if (-not (Test-Path $Src)) {
        return @{ ok = $false; error = "SOURCE_NOT_FOUND"; message = "Archivo fuente no encontrado: $Src" }
    }

    $resolvedSrc = (Resolve-Path $Src).Path
    $ext = [System.IO.Path]::GetExtension($resolvedSrc).ToLower()
    $tempFilesToClean = @()

    try {
        if ($ext -in @(".docx", ".doc", ".rtf")) {
            $convertedPdf = Convert-WordToPdf -DocPath $resolvedSrc
            if ($convertedPdf -and (Test-Path $convertedPdf)) {
                $tempFilesToClean += $convertedPdf
                $resolvedSrc = $convertedPdf
                $ext = ".pdf"
            } else {
                return @{ ok = $false; error = "DOCX_CONVERSION_FAILED"; message = "No se pudo convertir el archivo de Word a PDF para impresión." }
            }
        }

        # Parsear lista de páginas
        $pageIndices = @(1)
        if ($PagesJson -and $PagesJson -ne "[]") {
            try {
                $pageIndices = ConvertFrom-Json $PagesJson
            } catch {}
        }

        $doc = New-Object System.Drawing.Printing.PrintDocument
        $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
        $doc.PrinterSettings.PrinterName = $Name

        if (-not $doc.PrinterSettings.IsValid) {
            return @{ ok = $false; error = "PRINTER_NOT_FOUND"; message = "La impresora '$Name' no es válida." }
        }

        # Redirección a PDF si es Microsoft Print to PDF
        $isPdfPrinter = ($Name -eq "Microsoft Print to PDF" -or $Name -like "*PDF*")
        if ($isPdfPrinter -and $PdfTarget) {
            $parentDir = [System.IO.Path]::GetDirectoryName($PdfTarget)
            if ($parentDir -and -not (Test-Path $parentDir)) {
                New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
            }
            $doc.PrinterSettings.PrintToFile = $true
            $doc.PrinterSettings.PrintFileName = $PdfTarget
        }

        $doc.PrinterSettings.Copies = [int16][Math]::Max(1, $CopyCount)

        # Modo color/escala de grises
        # ColorMode: "Color", "Monochrome", "Grayscale" o "grayscale"
        $isGrayscale = ($ClrMode -eq "Grayscale" -or $ClrMode -eq "grayscale" -or $ClrMode -eq "Monochrome")
        $doc.DefaultPageSettings.Color = -not $isGrayscale

        # Orientación: "auto" detecta según dimensiones del contenido renderizado
        $resolvedOrient = $Orient
        if ($Orient -eq "auto") {
            $resolvedOrient = "Portrait"
            if ($ext -in @(".png", ".jpg", ".jpeg", ".bmp", ".webp", ".gif", ".tiff")) {
                try {
                    $probe = [System.Drawing.Image]::FromFile($resolvedSrc)
                    if ($probe.Width -gt $probe.Height) { $resolvedOrient = "Landscape" }
                    $probe.Dispose()
                } catch {}
            }
        }
        if ($resolvedOrient -eq "Landscape") {
            $doc.DefaultPageSettings.Landscape = $true
        } elseif ($resolvedOrient -eq "Portrait") {
            $doc.DefaultPageSettings.Landscape = $false
        }

        # Asignar tamaño de papel si coincide con los disponibles
        if ($PprSize) {
            foreach ($pz in $doc.PrinterSettings.PaperSizes) {
                if ($pz.PaperName -like "*$PprSize*" -or $pz.PaperName -eq $PprSize) {
                    $doc.DefaultPageSettings.PaperSize = $pz
                    break
                }
            }
        }

        # Asignar resolución si se solicitó
        if ($ResX -gt 0 -and $ResY -gt 0) {
            foreach ($r in $doc.PrinterSettings.PrinterResolutions) {
                if ($r.X -eq $ResX -and $r.Y -eq $ResY) {
                    $doc.DefaultPageSettings.PrinterResolution = $r
                    break
                }
            }
        }

        # Configurar dúplex si la impresora lo soporta
        if ($Duplex -and $Duplex -ne "" -and $doc.PrinterSettings.CanDuplex) {
            try {
                $duplexMode = switch ($Duplex.ToLower()) {
                    "duplex_long_edge"  { [System.Drawing.Printing.Duplex]::Horizontal }
                    "duplex_short_edge" { [System.Drawing.Printing.Duplex]::Vertical }
                    "simplex"           { [System.Drawing.Printing.Duplex]::Simplex }
                    default             { [System.Drawing.Printing.Duplex]::Default }
                }
                $doc.PrinterSettings.Duplex = $duplexMode
            } catch {}
        }

        $pagesToPrint = [System.Collections.Generic.List[int]]::new()
        foreach ($idx in $pageIndices) {
            $pagesToPrint.Add([int]$idx)
        }

        $pdfState = [hashtable]::Synchronized(@{ pointer = 0 })
        $totalSelected = $pagesToPrint.Count

        # Carga de documento según extensión
        if ($ext -eq ".pdf") {
            $loadedPdfDoc = $null
            try {
                $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolvedSrc)
                $storageFile = Await-WinRT $fileOp ([Windows.Storage.StorageFile])
                $docOp = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($storageFile)
                $loadedPdfDoc = Await-WinRT $docOp ([Windows.Data.Pdf.PdfDocument])
            } catch {}

            $doc.add_PrintPage({
                param($sender, $e)
                if ($pdfState.pointer -ge $totalSelected) {
                    $e.HasMorePages = $false
                    return
                }

                $pageNum = $pagesToPrint[$pdfState.pointer]
                # Si hay más de 10 páginas y no se especificó DPI explícito, usar 200 DPI para velocidad y evitar timeouts
                $targetRenderDpi = if ($ResX -gt 0) { $ResX } elseif ($totalSelected -gt 10) { 200 } else { 300 }
                $bmp = RenderPdfPage -PdfPath $resolvedSrc -PageNumber $pageNum -TargetDpi $targetRenderDpi -LoadedDoc $loadedPdfDoc

                $bounds = $e.MarginBounds
                $pageBounds = $e.PageBounds
                $layout = Calculate-PrintLayout -SheetWidthPx $pageBounds.Width -SheetHeightPx $pageBounds.Height -PrintableAreaPx $bounds -ContentWidthPx ($bmp.Width * 100.0 / $targetRenderDpi) -ContentHeightPx ($bmp.Height * 100.0 / $targetRenderDpi) -ScaleMode $Scale -CustomScale $CustomScale -Alignment $Alignment

                $e.Graphics.DrawImage($bmp, [float]$layout.DestX, [float]$layout.DestY, [float]$layout.DestWidth, [float]$layout.DestHeight)

                $bmp.Dispose()
                [GC]::Collect(0)
                $pdfState.pointer++
                $e.HasMorePages = ($pdfState.pointer -lt $totalSelected)
            })
        } elseif ($ext -in @(".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp")) {
            $doc.add_PrintPage({
                param($sender, $e)
                $img = [System.Drawing.Image]::FromFile($resolvedSrc)
                $bounds = $e.MarginBounds
                $pageBounds = $e.PageBounds

                $layout = Calculate-PrintLayout -SheetWidthPx $pageBounds.Width -SheetHeightPx $pageBounds.Height -PrintableAreaPx $bounds -ContentWidthPx ($img.Width * 100.0 / 96.0) -ContentHeightPx ($img.Height * 100.0 / 96.0) -ScaleMode $Scale -CustomScale $CustomScale -Alignment $Alignment

                $e.Graphics.DrawImage($img, [float]$layout.DestX, [float]$layout.DestY, [float]$layout.DestWidth, [float]$layout.DestHeight)

                $img.Dispose()
                $e.HasMorePages = $false
            })
        } else {
            # Archivo de texto plano / Markdown / Log
            $lines = [System.IO.File]::ReadAllLines($resolvedSrc, [System.Text.Encoding]::UTF8)
            $txtState = [hashtable]::Synchronized(@{ lineIndex = 0 })
            $font = New-Object System.Drawing.Font("Consolas", 10)
            $brush = [System.Drawing.Brushes]::Black

            $doc.add_PrintPage({
                param($sender, $e)
                $bounds = $e.MarginBounds
                $lineHeight = $font.GetHeight($e.Graphics)
                $linesPerPage = [int]($bounds.Height / $lineHeight)
                $linesPrinted = 0

                while ($txtState.lineIndex -lt $lines.Length -and $linesPrinted -lt $linesPerPage) {
                    $line = $lines[$txtState.lineIndex]
                    $y = $bounds.Top + ($linesPrinted * $lineHeight)
                    $e.Graphics.DrawString($line, $font, $brush, $bounds.Left, $y)
                    $txtState.lineIndex++
                    $linesPrinted++
                }

                $e.HasMorePages = ($txtState.lineIndex -lt $lines.Length)
            })
        }

        $startTime = [DateTime]::UtcNow
        try {
            $doc.Print()
        } catch {
            $printError = $_.Exception.Message
            $fallbackOk = $false
            if ($ext -in @(".pdf", ".png", ".jpg", ".jpeg", ".txt")) {
                try {
                    $pInfo = New-Object System.Diagnostics.ProcessStartInfo
                    $pInfo.FileName = $resolvedSrc
                    $pInfo.Verb = "PrintTo"
                    $pInfo.Arguments = "`"$Name`""
                    $pInfo.CreateNoWindow = $true
                    $pInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
                    $proc = [System.Diagnostics.Process]::Start($pInfo)
                    if ($proc) {
                        $proc.WaitForExit(10000)
                        $fallbackOk = $true
                    }
                } catch {}
            }
            if (-not $fallbackOk) {
                throw "Error ejecutando impresión en '$Name': $printError"
            }
        } finally {
            $doc.Dispose()
        }

        # Observar Spooler dentro de ventana de 3 segundos
        $detectedJobId = $null
        $spoolerSeen = $false

        if (-not $isPdfPrinter) {
            $deadline = [DateTime]::UtcNow.AddSeconds(3)
            while ([DateTime]::UtcNow -lt $deadline) {
                $activeJobs = Get-PrintJob -PrinterName $Name -ErrorAction SilentlyContinue
                if ($activeJobs) {
                    $candidate = $activeJobs | Where-Object { $_.SubmittedTime -and $_.SubmittedTime.ToUniversalTime() -ge $startTime.AddSeconds(-2) } | Select-Object -First 1
                    if ($candidate) {
                        $detectedJobId = [int]$candidate.Id
                        $spoolerSeen = $true
                        break
                    }
                }
                Start-Sleep -Milliseconds 250
            }
        } else {
            $spoolerSeen = $true
        }

        # Verificar creación de archivo si fue a PDF
        $pdfCreated = $false
        $pdfSize = 0
        if ($isPdfPrinter -and $PdfTarget -and (Test-Path $PdfTarget)) {
            $pdfCreated = $true
            $pdfSize = (Get-Item $PdfTarget).Length
        }

        return @{
            ok = $true
            submitted = $true
            printer = $Name
            source = $resolvedSrc
            pages_requested = $pagesToPrint
            copies = $CopyCount
            color = -not $isGrayscale
            grayscale = $isGrayscale
            orientation = $resolvedOrient
            paper_size = $PprSize
            spooler_seen = $spoolerSeen
            job_id = $detectedJobId
            pdf_file_created = $pdfCreated
            pdf_file_size = $pdfSize
            timestamp = [DateTime]::UtcNow.ToString("o")
            message = if ($isPdfPrinter) { "Documento impreso correctamente a archivo PDF." } else { "Documento enviado con éxito al spooler de la impresora '$Name'." }
        }
    } finally {
        foreach ($f in $tempFilesToClean) {
            try { Remove-Item -Path $f -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}

# ── DISPATCH ─────────────────────────────────────────────────────────────────
$response = switch ($Operation) {
    "list_printers"    { Action-ListPrinters }
    "get_capabilities" { Action-GetCapabilities -Name $PrinterName }
    "search_printers"  { Action-SearchPrinters }
    "get_pdf_info"     { Action-GetPdfInfo -FilePath $SourceFile }
    "jobs"             { Action-Jobs -Name $PrinterName }
    "cancel_job"       { Action-CancelJob -Name $PrinterName -JId $JobId }
    "purge_queue"      { Action-PurgeQueue -Name $PrinterName }
    "configure"        { Action-Configure -Name $PrinterName -NewPaperSize $PaperSize -NewColorMode $ColorMode -NewDuplex $Duplex -NewCollate $Collate }
    "preview"          { Action-Preview -Name $PrinterName -Src $SourceFile -PageNum $PreviewPage -Scale $ScaleMode -CustomScale $CustomScale -Alignment $Alignment -Orient $Orientation -PprSize $PaperSize -OutPath $PreviewOutPath }
    "print"            { Action-Print -Name $PrinterName -Src $SourceFile -PagesJson $PageIndicesJson -CopyCount $Copies -ClrMode $ColorMode -PprSize $PaperSize -ResX $DpiX -ResY $DpiY -NUp $PagesPerSheet -Scale $ScaleMode -CustomScale $CustomScale -Alignment $Alignment -Orient $Orientation -PdfTarget $OutPdfPath }
    default            { @{ ok = $false; error = "INVALID_ACTION"; message = "Acción '$Operation' desconocida." } }
}

$json = ConvertTo-Json -InputObject $response -Depth 6 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json

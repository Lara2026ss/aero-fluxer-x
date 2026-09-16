param(
    [Alias("Action")]
    [ValidateSet("list_printers", "get_capabilities", "search_printers", "get_pdf_info", "jobs", "cancel_job", "purge_queue", "configure", "print")]
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
    [string]$Orientation = "Portrait",
    [string]$Duplex = "",
    [string]$Collate = "true",
    [string]$PaperSource = "",
    [int]$JobId = 0,
    [string]$OutPdfPath = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

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
        $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved).GetAwaiter().GetResult()
        $doc = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file).GetAwaiter().GetResult()

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

# ── 9. PRINT EXECUTION ───────────────────────────────────────────────────────
function RenderPdfPage {
    param([string]$PdfPath, [int]$PageNumber, [int]$TargetDpi = 300)
    [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
    $resolved = (Resolve-Path $PdfPath).Path

    $fileOp = [Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved)
    $file = Await-WinRT $fileOp ([Windows.Storage.StorageFile])

    $docOp = [Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)
    $doc = Await-WinRT $docOp ([Windows.Data.Pdf.PdfDocument])

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
    return $bmp
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
        [string]$Orient,
        [string]$PdfTarget
    )

    if (-not (Test-Path $Src)) {
        return @{ ok = $false; error = "SOURCE_NOT_FOUND"; message = "Archivo fuente no encontrado: $Src" }
    }

    $resolvedSrc = (Resolve-Path $Src).Path
    $ext = [System.IO.Path]::GetExtension($resolvedSrc).ToLower()

    # Parsear lista de páginas
    $pageIndices = @(1)
    if ($PagesJson -and $PagesJson -ne "[]") {
        try {
            $pageIndices = ConvertFrom-Json $PagesJson
        } catch {}
    }

    $doc = New-Object System.Drawing.Printing.PrintDocument
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
    $doc.DefaultPageSettings.Color = ($ClrMode -eq "Color")

    if ($Orient -eq "Landscape") {
        $doc.DefaultPageSettings.Landscape = $true
    } elseif ($Orient -eq "Portrait") {
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

    $pagesToPrint = [System.Collections.Generic.List[int]]::new()
    foreach ($idx in $pageIndices) {
        $pagesToPrint.Add([int]$idx)
    }

    $currentPagePointer = 0
    $totalSelected = $pagesToPrint.Count

    # Carga de documento según extensión
    if ($ext -eq ".pdf") {
        $doc.add_PrintPage({
            param($sender, $e)
            if ($currentPagePointer -ge $totalSelected) {
                $e.HasMorePages = $false
                return
            }

            $pageNum = $pagesToPrint[$currentPagePointer]
            $targetRenderDpi = if ($ResX -gt 0) { $ResX } else { 300 }
            $bmp = RenderPdfPage -PdfPath $resolvedSrc -PageNumber $pageNum -TargetDpi $targetRenderDpi

            # Margen y área imprimible
            $bounds = $e.MarginBounds
            if ($Scale -eq "stretch") {
                $e.Graphics.DrawImage($bmp, $bounds)
            } elseif ($Scale -eq "actual_size") {
                $e.Graphics.DrawImage($bmp, $bounds.Left, $bounds.Top, $bmp.Width, $bmp.Height)
            } else {
                # fit_to_page (conservar aspecto)
                $ratioW = [double]$bounds.Width / $bmp.Width
                $ratioH = [double]$bounds.Height / $bmp.Height
                $ratio = [Math]::Min($ratioW, $ratioH)
                $destW = [int]($bmp.Width * $ratio)
                $destH = [int]($bmp.Height * $ratio)
                $destX = $bounds.Left + [int](($bounds.Width - $destW) / 2)
                $destY = $bounds.Top + [int](($bounds.Height - $destH) / 2)
                $e.Graphics.DrawImage($bmp, $destX, $destY, $destW, $destH)
            }

            $bmp.Dispose()
            $currentPagePointer++
            $e.HasMorePages = ($currentPagePointer -lt $totalSelected)
        })
    } elseif ($ext -in @(".png", ".jpg", ".jpeg", ".bmp", ".gif")) {
        $doc.add_PrintPage({
            param($sender, $e)
            $img = [System.Drawing.Image]::FromFile($resolvedSrc)
            $bounds = $e.MarginBounds

            if ($Scale -eq "stretch") {
                $e.Graphics.DrawImage($img, $bounds)
            } elseif ($Scale -eq "actual_size") {
                $e.Graphics.DrawImage($img, $bounds.Left, $bounds.Top, $img.Width, $img.Height)
            } else {
                $ratioW = [double]$bounds.Width / $img.Width
                $ratioH = [double]$bounds.Height / $img.Height
                $ratio = [Math]::Min($ratioW, $ratioH)
                $destW = [int]($img.Width * $ratio)
                $destH = [int]($img.Height * $ratio)
                $destX = $bounds.Left + [int](($bounds.Width - $destW) / 2)
                $destY = $bounds.Top + [int](($bounds.Height - $destH) / 2)
                $e.Graphics.DrawImage($img, $destX, $destY, $destW, $destH)
            }

            $img.Dispose()
            $e.HasMorePages = $false
        })
    } else {
        # Archivo de texto plano / Markdown / Log
        $lines = [System.IO.File]::ReadAllLines($resolvedSrc, [System.Text.Encoding]::UTF8)
        $lineIndex = 0
        $font = New-Object System.Drawing.Font("Consolas", 10)
        $brush = [System.Drawing.Brushes]::Black

        $doc.add_PrintPage({
            param($sender, $e)
            $bounds = $e.MarginBounds
            $lineHeight = $font.GetHeight($e.Graphics)
            $linesPerPage = [int]($bounds.Height / $lineHeight)
            $linesPrinted = 0

            while ($lineIndex -lt $lines.Length -and $linesPrinted -lt $linesPerPage) {
                $line = $lines[$lineIndex]
                $y = $bounds.Top + ($linesPrinted * $lineHeight)
                $e.Graphics.DrawString($line, $font, $brush, $bounds.Left, $y)
                $lineIndex++
                $linesPrinted++
            }

            $e.HasMorePages = ($lineIndex -lt $lines.Length)
        })
    }

    $startTime = [DateTime]::UtcNow
    try {
        $doc.Print()
    } catch {
        $printError = $_.Exception.Message
        $fallbackOk = $false
        # Fallback a PrintTo para impresoras físicas en caso de incompatibilidad GDI/controlador
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
        color = ($ClrMode -eq "Color")
        paper_size = $PprSize
        spooler_seen = $spoolerSeen
        job_id = $detectedJobId
        pdf_file_created = $pdfCreated
        pdf_file_size = $pdfSize
        timestamp = [DateTime]::UtcNow.ToString("o")
        message = if ($isPdfPrinter) { "Documento impreso correctamente a archivo PDF." } else { "Documento enviado con éxito al spooler de la impresora '$Name'." }
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
    "print"            { Action-Print -Name $PrinterName -Src $SourceFile -PagesJson $PageIndicesJson -CopyCount $Copies -ClrMode $ColorMode -PprSize $PaperSize -ResX $DpiX -ResY $DpiY -NUp $PagesPerSheet -Scale $ScaleMode -Orient $Orientation -PdfTarget $OutPdfPath }
    default            { @{ ok = $false; error = "INVALID_ACTION"; message = "Acción '$Operation' desconocida." } }
}

$json = ConvertTo-Json -InputObject $response -Depth 6 -Compress
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $json

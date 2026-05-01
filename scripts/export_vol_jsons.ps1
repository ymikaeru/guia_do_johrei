# export_vol_jsons.ps1
# Lê bilingual_johrei.json e exporta johrei_vol0X_bilingual.json
# no schema existente do site (array plano de entradas por seção).

param(
    [string]$InputFile  = "c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json",
    [string]$OutputDir  = "c:\Mioshie_Sites\guia_johrei\data",
    [switch]$Backup     = $true
)

Add-Type -AssemblyName System.Web

$raw  = Get-Content $InputFile -Encoding UTF8 -Raw
$data = $raw | ConvertFrom-Json

# -----------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------

# Extrai número romano da string "### I. Título" ou "## Título"
function Get-SectionNum([string]$header) {
    if ($header -match '^###\s+([IVXLCDM]+)\.\s+') { return $Matches[1] }
    return $null
}

# Extrai título depois do número: "### I. Título" -> "Título"
function Get-SectionTitle([string]$header) {
    if ($header -match '^#{2,3}\s+(?:[IVXLCDM]+\.\s+)?(.+)$') { return $Matches[1].Trim() }
    return $header -replace '^#{2,3}\s+', ''
}

# Junta blocos em texto corrido separado por \n\n (ignora blocos vazios)
function Join-Blocks([string[]]$blocks) {
    return ($blocks | Where-Object { $_ -ne $null -and $_.Trim() -ne '' }) -join "`n`n"
}

# Volume label PT: "## Palestras sobre o Método de Johrei (1)" -> "Palestras..."
function Vol-LabelFromHeader([string]$h) {
    return $h -replace '^##\s+', ''
}

# -----------------------------------------------------------------------
# Processa cada volume
# -----------------------------------------------------------------------
foreach ($vol in $data) {
    $n      = $vol.volume
    $padded = $n.ToString().PadLeft(2, '0')
    $outFile = Join-Path $OutputDir "johrei_vol${padded}_bilingual.json"

    # Backup do arquivo existente
    if ($Backup -and (Test-Path $outFile)) {
        $ts  = (Get-Date -Format 'yyyyMMdd_HHmmss')
        $bak = "$outFile.bak.md_export.$ts"
        Copy-Item $outFile $bak
        Write-Host ("  Backup: " + [System.IO.Path]::GetFileName($bak))
    }

    $entries = [System.Collections.Generic.List[object]]::new()
    $pos = 0

    foreach ($sec in $vol.sections) {
        $jpHeader = $sec.jp_header
        $ptHeader = $sec.pt_header

        # Determina se é titulo de volume (##) ou secao (###)
        $isVolTitle = ($jpHeader -match '^## ')
        $secNum     = Get-SectionNum $jpHeader
        $secTitle   = Get-SectionTitle $ptHeader

        # Junta todos os blocos PT e JP da seção
        $ptBlocks = $sec.pairs | ForEach-Object { $_.pt } | Where-Object { $_ -ne $null }
        $jpBlocks = $sec.pairs | ForEach-Object { $_.ja } | Where-Object { $_ -ne $null }

        $contentPt = Join-Blocks $ptBlocks
        $contentJp = Join-Blocks $jpBlocks

        # Pula seções completamente vazias
        if (-not $contentPt -and -not $contentJp) { continue }

        $pos++
        $idSuffix = $pos.ToString().PadLeft(2, '0')
        $id       = "johreivol${padded}_${idSuffix}"

        # título JP da seção: extrai após número
        $titleJp = (Get-SectionTitle $jpHeader)

        # source_ref: pega do primeiro bloco se for fonte bibliográfica
        $firstBlock = $sec.pairs | Select-Object -First 1
        $sourceRef  = ''
        if ($firstBlock -and $firstBlock.pt -match '^\*[^\*]') {
            # linha de fonte em itálico — guarda como source_ref e remove do content
            $sourceRef = ($firstBlock.pt -replace '^\*(.+)\*$', '$1').Trim()
        }

        $entry = [PSCustomObject]@{
            id             = $id
            volume         = "Johrei Hô Kohza"
            volume_num     = $n
            section_num    = $secNum
            section_title  = $secTitle
            article_num    = $null
            article_title  = $secTitle
            sub_letter     = $null
            position       = $pos
            parent_id      = $null
            source_ref     = $sourceRef
            title_pt       = $secTitle
            content_pt     = $contentPt
            title_jp       = $titleJp
            content_jp     = $contentJp
            tags           = @()
            categories     = @("johrei")
            related_items  = @()
            info_pt        = ""
            source         = ""
            Master_Title   = "Johrei Hô Kohza"
        }

        $entries.Add($entry)
    }

    $json = $entries | ConvertTo-Json -Depth 10
    $json | Out-File -FilePath $outFile -Encoding UTF8

    Write-Host ("Vol " + $n + ": " + $entries.Count + " entradas -> " + [System.IO.Path]::GetFileName($outFile))
}

Write-Host ""
Write-Host "Concluído." -ForegroundColor Cyan

# build_bilingual_json_v2.ps1
# Emparelha por BLOCO DE PARÁGRAFO (separados por linha vazia)
# JP: MD_Original_normalized | PT: MD_PT_v3

param(
    [string]$OutputFile = "c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json"
)

$jpDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_Original_normalized"
$ptDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_PT_v3"

function Split-Blocks {
    param([string[]]$lines)
    $blocks = [System.Collections.Generic.List[string]]::new()
    $current = [System.Collections.Generic.List[string]]::new()
    foreach ($line in $lines) {
        if ($line.Trim() -eq '') {
            if ($current.Count -gt 0) {
                $blocks.Add(($current -join "`n"))
                $current.Clear()
            }
        } else {
            $current.Add($line.TrimEnd())
        }
    }
    if ($current.Count -gt 0) { $blocks.Add(($current -join "`n")) }
    return $blocks
}

# Classifica o tipo de bloco baseado no conteúdo
function Get-BlockType {
    param([string]$block)
    $first = $block.Split("`n")[0].Trim()
    if ($first -match '^## ')      { return 'volume_title' }
    if ($first -match '^### ')     { return 'section_title' }
    if ($first -match '^＝')       { return 'subsection_marker' }
    if ($first -match '^◇')       { return 'news_item' }
    if ($first -match '^（|^\(')   { return 'subtitle' }
    return 'paragraph'
}

$result = [System.Collections.Generic.List[object]]::new()
$hasWarning = $false

for ($n = 1; $n -le 10; $n++) {
    $jpFile = Join-Path $jpDir "浄霊法講座$n.md"
    $ptFile = Join-Path $ptDir "Johrei_Ho_Kohza_$($n)_retranslated.md"

    $jpLines = Get-Content -Path $jpFile -Encoding UTF8
    $ptLines = Get-Content -Path $ptFile -Encoding UTF8

    $jpBlocks = Split-Blocks $jpLines
    $ptBlocks = Split-Blocks $ptLines

    $jpCount = $jpBlocks.Count
    $ptCount = $ptBlocks.Count

    if ($jpCount -ne $ptCount) {
        Write-Warning ("Volume " + $n + ": JP=" + $jpCount + " blocos, PT=" + $ptCount + " blocos — DESALINHAMENTO!")
        $hasWarning = $true
    } else {
        Write-Host ("Volume " + $n + ": " + $jpCount + " blocos OK") -ForegroundColor Green
    }

    $pairs = [System.Collections.Generic.List[object]]::new()
    $maxBlocks = [Math]::Max($jpCount, $ptCount)

    for ($i = 0; $i -lt $maxBlocks; $i++) {
        $jaBlock = if ($i -lt $jpCount) { $jpBlocks[$i] } else { "" }
        $ptBlock = if ($i -lt $ptCount) { $ptBlocks[$i] } else { "" }

        $blockType = Get-BlockType $jaBlock

        $pairs.Add([PSCustomObject]@{
            index     = $i + 1
            type      = $blockType
            ja        = $jaBlock
            pt        = $ptBlock
        })
    }

    $result.Add([PSCustomObject]@{
        volume    = $n
        jp_file   = [System.IO.Path]::GetFileName($jpFile)
        pt_file   = [System.IO.Path]::GetFileName($ptFile)
        jp_blocks = $jpCount
        pt_blocks = $ptCount
        aligned   = ($jpCount -eq $ptCount)
        pairs     = $pairs
    })
}

# Garante o diretório de saída
$outputDir = [System.IO.Path]::GetDirectoryName($OutputFile)
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$json = $result | ConvertTo-Json -Depth 10
$json | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host ""
if ($hasWarning) {
    Write-Warning "Alguns volumes têm desalinhamento — verifique os dados antes de usar."
} else {
    Write-Host "Todos os volumes estão alinhados!" -ForegroundColor Green
}
Write-Host "JSON gerado em: $OutputFile" -ForegroundColor Cyan

# Resumo final
Write-Host ""
Write-Host "Resumo:"
foreach ($v in $result) {
    $status = if ($v.aligned) { "[OK]" } else { "[WARN]" }
    Write-Host "  Vol $($v.volume) $status JP=$($v.jp_blocks) PT=$($v.pt_blocks) blocos"
}

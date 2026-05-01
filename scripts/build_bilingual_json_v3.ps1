# build_bilingual_json_v3.ps1
# Alinha por SECAO (## / ###) e dentro de cada secao por PARAGRAFO.
# Volumes problemáticos: títulos ## duplicados no PT são ignorados na chave de seção.

param(
    [string]$OutputFile = "c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json"
)

$jpDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_Original_normalized"
$ptDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_PT_v3"

# -----------------------------------------------------------------------
# Divide o arquivo em secoes.
# Cada secao = { header: string, blocks: string[] }
# Um bloco é um parágrafo (linhas agrupadas separadas por linha vazia).
# -----------------------------------------------------------------------
function Split-Sections {
    param([string[]]$lines)

    $sections   = [System.Collections.Generic.List[object]]::new()
    $curHeader  = "__preamble__"
    $curBlocks  = [System.Collections.Generic.List[string]]::new()
    $curLines   = [System.Collections.Generic.List[string]]::new()

    function Flush-Block {
        if ($curLines.Count -gt 0) {
            $curBlocks.Add(($curLines -join "`n"))
            $curLines.Clear()
        }
    }

    function Flush-Section {
        Flush-Block
        if ($curBlocks.Count -gt 0 -or $curHeader -ne "__preamble__") {
            $sections.Add([PSCustomObject]@{
                header = $curHeader
                blocks = $curBlocks.ToArray()
            })
        }
        $curBlocks.Clear()
    }

    foreach ($line in $lines) {
        if ($line -match '^#{2,3} ') {
            Flush-Section
            $curHeader = $line.Trim()
        } elseif ($line.Trim() -eq '') {
            Flush-Block
        } else {
            $curLines.Add($line.TrimEnd())
        }
    }
    Flush-Section

    return $sections
}

# -----------------------------------------------------------------------
# Classifica o tipo de um bloco
# -----------------------------------------------------------------------
function Get-BlockType {
    param([string]$block)
    $first = $block.Split("`n")[0].Trim()
    if ($first -match '^＝')      { return 'subsection_marker' }
    if ($first -match '^◇')      { return 'news_item' }
    if ($first -match '^（|^\(') { return 'subtitle' }
    return 'paragraph'
}

# -----------------------------------------------------------------------
# Determina o "nível" de um header: 2 para ##, 3 para ###
# -----------------------------------------------------------------------
function Get-HeaderLevel {
    param([string]$h)
    if ($h -match '^### ') { return 3 }
    if ($h -match '^## ')  { return 2 }
    return 0
}

# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------
$result       = [System.Collections.Generic.List[object]]::new()
$globalWarnings = [System.Collections.Generic.List[string]]::new()

for ($n = 1; $n -le 10; $n++) {
    $jpFile = Join-Path $jpDir "浄霊法講座$n.md"
    $ptFile = Join-Path $ptDir "Johrei_Ho_Kohza_$($n)_retranslated.md"

    $jpLines = Get-Content -Path $jpFile -Encoding UTF8
    $ptLines = Get-Content -Path $ptFile -Encoding UTF8

    $jpSections = Split-Sections $jpLines
    $ptSections = Split-Sections $ptLines

    # -----------------------------------------------------------------
    # Filtra secoes PT que são "## duplicados" (título do volume que
    # aparece novamente no meio do arquivo — artefato de edição)
    # Estratégia: mantém apenas a PRIMEIRA ocorrência de cada header ##
    # -----------------------------------------------------------------
    $seenH2     = [System.Collections.Generic.HashSet[string]]::new()
    $ptFiltered = [System.Collections.Generic.List[object]]::new()
    foreach ($sec in $ptSections) {
        $lvl = Get-HeaderLevel $sec.header
        if ($lvl -eq 2) {
            # normaliza o header para comparação (ignora variações de título)
            if (-not $seenH2.Contains($sec.header)) {
                $seenH2.Add($sec.header) | Out-Null
                $ptFiltered.Add($sec)
            } else {
                Write-Warning ("Vol " + $n + ": PT header duplicado ignorado: " + $sec.header)
            }
        } else {
            $ptFiltered.Add($sec)
        }
    }
    $ptSections = $ptFiltered

    # Alerta se ainda há diferença
    if ($jpSections.Count -ne $ptSections.Count) {
        $msg = ("Vol " + $n + ": JP=" + $jpSections.Count + " secoes, PT=" + $ptSections.Count + " secoes — DESALINHAMENTO!")
        Write-Warning $msg
        $globalWarnings.Add($msg)
    } else {
        Write-Host ("Vol " + $n + ": " + $jpSections.Count + " secoes alinhadas") -ForegroundColor Green
    }

    # -----------------------------------------------------------------
    # Constrói o array de seções emparelhadas
    # -----------------------------------------------------------------
    $sectionPairs = [System.Collections.Generic.List[object]]::new()
    $maxSec = [Math]::Max($jpSections.Count, $ptSections.Count)

    for ($s = 0; $s -lt $maxSec; $s++) {
        $jpSec = if ($s -lt $jpSections.Count) { $jpSections[$s] } else { $null }
        $ptSec = if ($s -lt $ptSections.Count) { $ptSections[$s] } else { $null }

        $jpHeader = if ($jpSec) { $jpSec.header } else { "" }
        $ptHeader = if ($ptSec) { $ptSec.header } else { "" }

        $jpBlocks = if ($jpSec) { $jpSec.blocks } else { @() }
        $ptBlocks = if ($ptSec) { $ptSec.blocks } else { @() }

        # Aviso de diferença de parágrafos dentro da seção
        $secAligned = ($jpBlocks.Count -eq $ptBlocks.Count)
        if (-not $secAligned) {
            $msg = ("  Vol " + $n + " / Sec '" + $jpHeader + "': JP=" + $jpBlocks.Count + " blocos, PT=" + $ptBlocks.Count + " blocos")
            Write-Warning $msg
            $globalWarnings.Add($msg)
        }

        # Emparelha os parágrafos dentro da seção
        $pairs = [System.Collections.Generic.List[object]]::new()
        $maxBlocks = [Math]::Max($jpBlocks.Count, $ptBlocks.Count)
        for ($b = 0; $b -lt $maxBlocks; $b++) {
            $jaBlock = if ($b -lt $jpBlocks.Count) { $jpBlocks[$b] } else { "" }
            $ptBlock = if ($b -lt $ptBlocks.Count) { $ptBlocks[$b] } else { "" }
            $pairs.Add([PSCustomObject]@{
                index   = $b + 1
                type    = Get-BlockType $jaBlock
                ja      = $jaBlock
                pt      = $ptBlock
            })
        }

        $sectionPairs.Add([PSCustomObject]@{
            section_index = $s + 1
            jp_header     = $jpHeader
            pt_header     = $ptHeader
            aligned       = $secAligned
            pairs         = $pairs
        })
    }

    $result.Add([PSCustomObject]@{
        volume    = $n
        jp_file   = [System.IO.Path]::GetFileName($jpFile)
        pt_file   = [System.IO.Path]::GetFileName($ptFile)
        aligned   = ($jpSections.Count -eq $ptSections.Count)
        sections  = $sectionPairs
    })
}

# Garante o diretório de saída
$outputDir = [System.IO.Path]::GetDirectoryName($OutputFile)
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$json = $result | ConvertTo-Json -Depth 15
$json | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "JSON gerado em: $OutputFile" -ForegroundColor Cyan
$size = [Math]::Round((Get-Item $OutputFile).Length / 1024, 1)
Write-Host "Tamanho: $size KB"

Write-Host ""
Write-Host "=== RESUMO ==="
foreach ($v in $result) {
    $status = if ($v.aligned) { "[OK]" } else { "[WARN]" }
    Write-Host ("  Vol " + $v.volume + " " + $status + " " + $v.sections.Count + " secoes")
}

if ($globalWarnings.Count -gt 0) {
    Write-Host ""
    Write-Host "Avisos restantes ($($globalWarnings.Count)):" -ForegroundColor Yellow
    foreach ($w in $globalWarnings) { Write-Host "  $w" -ForegroundColor Yellow }
}

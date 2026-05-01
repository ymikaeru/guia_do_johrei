# build_bilingual_json.ps1
# Emparelha os arquivos MD japoneses (MD_Original_normalized) com as
# traduções portuguesas (MD_PT_v3) e gera um JSON bilíngue estruturado.

$jpDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_Original_normalized"
$ptDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_PT_v3"
$outputFile = "c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json"

# Mapeamento explícito: número do volume => (arquivo JP, arquivo PT)
$volumes = 1..10 | ForEach-Object {
    [PSCustomObject]@{
        number = $_
        jpFile = Join-Path $jpDir "浄霊法講座$_.md"
        ptFile = Join-Path $ptDir "Johrei_Ho_Kohza_$($_)_retranslated.md"
    }
}

$result = @()

foreach ($vol in $volumes) {
    Write-Host "Processando Volume $($vol.number)..."

    $jpLines = Get-Content -Path $vol.jpFile -Encoding UTF8
    $ptLines = Get-Content -Path $vol.ptFile -Encoding UTF8

    $lineCount = [Math]::Min($jpLines.Count, $ptLines.Count)

    if ($jpLines.Count -ne $ptLines.Count) {
        Write-Warning "Volume $($vol.number): JP=$($jpLines.Count) linhas, PT=$($ptLines.Count) linhas — usando mínimo: $lineCount"
    }

    $pairs = @()
    for ($i = 0; $i -lt $lineCount; $i++) {
        $ja = $jpLines[$i].Trim()
        $pt = $ptLines[$i].Trim()

        # Inclui a linha mesmo que apenas um lado tenha conteúdo,
        # mas pula linhas completamente vazias nos dois lados.
        if ($ja -eq "" -and $pt -eq "") { continue }

        $pairs += [PSCustomObject]@{
            line = $i + 1
            ja   = $ja
            pt   = $pt
        }
    }

    $result += [PSCustomObject]@{
        volume = $vol.number
        jpFile = [System.IO.Path]::GetFileName($vol.jpFile)
        ptFile = [System.IO.Path]::GetFileName($vol.ptFile)
        pairs  = $pairs
    }
}

# Garante que o diretório de saída existe
$outputDir = [System.IO.Path]::GetDirectoryName($outputFile)
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$json = $result | ConvertTo-Json -Depth 10 -EscapeHandling EscapeNonAscii:$false
# PowerShell 5 não tem -EscapeHandling, usar abordagem compatível
$json = $result | ConvertTo-Json -Depth 10

$json | Out-File -FilePath $outputFile -Encoding UTF8

Write-Host ""
Write-Host "JSON gerado em: $outputFile"

# Resumo
foreach ($v in $result) {
    Write-Host "  Vol $($v.volume): $($v.pairs.Count) pares de linhas"
}

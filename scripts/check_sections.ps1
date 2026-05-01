# check_sections.ps1
# Compara a estrutura de secoes (## e ###) entre JP e PT para todos os volumes

$jpDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_Original_normalized"
$ptDir = "c:\Mioshie_Sites\guia_johrei\Markdown\MD_PT_v3"

for ($n = 1; $n -le 10; $n++) {
    $jpFile = Join-Path $jpDir "浄霊法講座$n.md"
    $ptFile = Join-Path $ptDir "Johrei_Ho_Kohza_$($n)_retranslated.md"

    $jpHeaders = Get-Content $jpFile -Encoding UTF8 | Where-Object { $_ -match '^#{2,3} ' }
    $ptHeaders = Get-Content $ptFile -Encoding UTF8 | Where-Object { $_ -match '^#{2,3} ' }

    $ok = if ($jpHeaders.Count -eq $ptHeaders.Count) { "[OK $($jpHeaders.Count) sec]" } else { "[WARN JP=$($jpHeaders.Count) PT=$($ptHeaders.Count)]" }
    Write-Host "=== Vol $n $ok ===" -ForegroundColor $(if ($jpHeaders.Count -eq $ptHeaders.Count) { 'Green' } else { 'Yellow' })

    $max = [Math]::Max($jpHeaders.Count, $ptHeaders.Count)
    for ($i = 0; $i -lt $max; $i++) {
        $jp = if ($i -lt $jpHeaders.Count) { $jpHeaders[$i] } else { "(sem correspondente)" }
        $pt = if ($i -lt $ptHeaders.Count) { $ptHeaders[$i] } else { "(sem correspondente)" }
        Write-Host ("  " + ($i+1).ToString().PadLeft(2) + "  JP: " + $jp)
        Write-Host ("       PT: " + $pt)
    }
    Write-Host ""
}

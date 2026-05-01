# validate_json.ps1
$j = Get-Content 'c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json' -Encoding UTF8 -Raw
$data = $j | ConvertFrom-Json
Write-Host "Volumes no JSON: $($data.Count)"
foreach ($v in $data) {
    Write-Host ("  Vol " + $v.volume + ": " + $v.pairs.Count + " pares, aligned=" + $v.aligned)
}

Write-Host ""
Write-Host "Amostra Vol 1, par 3 (primeiro paragrafo de texto):"
$p = $data[0].pairs[2]
$jaShort = $p.ja.Substring(0, [Math]::Min(100, $p.ja.Length))
$ptShort = $p.pt.Substring(0, [Math]::Min(100, $p.pt.Length))
Write-Host "  type: $($p.type)"
Write-Host "  JA: $jaShort"
Write-Host "  PT: $ptShort"

Write-Host ""
Write-Host "Tamanho do arquivo JSON:"
$size = (Get-Item 'c:\Mioshie_Sites\guia_johrei\data\bilingual_johrei.json').Length
Write-Host ("  " + [Math]::Round($size / 1024, 1) + " KB")

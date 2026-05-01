# analyze_json_structure.ps1
# Mostra a estrutura de artigos por volume nos JSONs existentes

$dataDir = "c:\Mioshie_Sites\guia_johrei\data"

for ($n = 1; $n -le 10; $n++) {
    $pad = $n.ToString().PadLeft(2, '0')
    $file = Join-Path $dataDir "johrei_vol${pad}_bilingual.json"
    $entries = Get-Content $file -Encoding UTF8 -Raw | ConvertFrom-Json

    $totalEntries = $entries.Count
    $withArticle  = ($entries | Where-Object { $_.article_num -ne $null }).Count
    $withSub      = ($entries | Where-Object { $_.sub_letter -ne $null }).Count
    $sections     = ($entries | Select-Object -Property section_num -Unique).Count

    Write-Host ("Vol " + $n + ": " + $totalEntries + " entradas, " + $sections + " secoes unicas, " + $withArticle + " com article_num, " + $withSub + " com sub_letter")

    # Mostra primeiras 5 entradas resumidas
    $show = [Math]::Min(5, $entries.Count)
    for ($i = 0; $i -lt $show; $i++) {
        $e = $entries[$i]
        $ptLen = if ($e.content_pt) { $e.content_pt.Length } else { 0 }
        $jpLen = if ($e.content_jp) { $e.content_jp.Length } else { 0 }
        $info = "  " + $e.id + " sec=" + $e.section_num + " art=" + $e.article_num + " sub=" + $e.sub_letter + " pt=" + $ptLen + "c jp=" + $jpLen + "c"
        Write-Host $info
    }
    if ($totalEntries -gt 5) { Write-Host ("  ... +" + ($totalEntries - 5) + " mais") }
    Write-Host ""
}

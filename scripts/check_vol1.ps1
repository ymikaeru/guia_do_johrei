# check_vol1.ps1
$j = Get-Content 'c:\Mioshie_Sites\guia_johrei\data\johrei_vol01_bilingual.json' -Encoding UTF8 -Raw | ConvertFrom-Json
foreach ($entry in $j) {
    $sec = if ($entry.section_num) { $entry.section_num } else { "(vol-title)" }
    $title = $entry.section_title
    if ($title.Length -gt 50) { $title = $title.Substring(0, 50) + "..." }
    Write-Host ($entry.id + " | sec=" + $sec + " | " + $title)
}

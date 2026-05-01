# restore_backups.ps1
for ($n = 1; $n -le 10; $n++) {
    $pad = $n.ToString().PadLeft(2, '0')
    $target = "c:\Mioshie_Sites\guia_johrei\data\johrei_vol${pad}_bilingual.json"
    $bakPattern = "c:\Mioshie_Sites\guia_johrei\data\johrei_vol${pad}_bilingual.json.bak.md_export.*"
    $bak = Get-ChildItem $bakPattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($bak) {
        Copy-Item $bak.FullName $target -Force
        Write-Host ("Restaurado Vol " + $n + " de " + $bak.Name)
    } else {
        Write-Host ("AVISO: backup nao encontrado para Vol " + $n) -ForegroundColor Red
    }
}
Write-Host ""
Write-Host "Restauracao concluida." -ForegroundColor Green
